import { getPublicAppConfig } from '@/config/publicAppConfig';
import {
  MINICHAT_STREAM_EVENT,
  MINICHAT_STREAM_PHASE,
  MINICHAT_STREAM_PROTOCOL_HEADER,
  MINICHAT_STREAM_PROTOCOL_VERSION,
} from '../../shared/protocol';
import { SseParser, SseParserError, type ParsedSseEvent } from '@/lib/sse';
import type {
  ChatQuotaStatus,
  ChatRequestMessage,
  ChatStreamProgress,
  ChatStreamCompletionMetadata,
} from '@/types/chat';

interface ChatResponseStreamOptions {
  requestMessages: ChatRequestMessage[];
  abortSignal: AbortSignal;
  onTextChunk: (textChunk: string) => void;
  onComplete?: (completionMetadata: ChatStreamCompletionMetadata) => void;
  onQuotaStatus?: (quotaStatus: ChatQuotaStatus) => void;
  onProgress?: (streamProgress: ChatStreamProgress) => void;
}

interface ChatApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    retryAfterSeconds?: number;
  };
}

interface ChatHealthPayload {
  ok?: boolean;
  protocolVersion?: string;
}

const KNOWN_CHAT_STREAM_EVENTS = new Set<string>(
  Object.values(MINICHAT_STREAM_EVENT),
);

interface ChatApiErrorOptions {
  errorCode?: string;
  statusCode?: number;
  isRetryable?: boolean;
  retryAfterSeconds?: number;
  resetAtEpochSeconds?: number;
}

interface InactivityAbortController {
  signal: AbortSignal;
  abort: () => void;
  resetTimeout: () => void;
  cleanup: () => void;
  hasTimedOut: () => boolean;
}

export class ChatApiError extends Error {
  readonly errorCode: string;
  readonly statusCode?: number;
  readonly isRetryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly resetAtEpochSeconds?: number;

  constructor(errorMessage: string, errorOptions: ChatApiErrorOptions = {}) {
    super(errorMessage);
    this.name = 'ChatApiError';
    this.errorCode = errorOptions.errorCode ?? 'UNKNOWN_ERROR';
    this.statusCode = errorOptions.statusCode;
    this.isRetryable = errorOptions.isRetryable ?? false;
    this.retryAfterSeconds = errorOptions.retryAfterSeconds;
    this.resetAtEpochSeconds = errorOptions.resetAtEpochSeconds;
  }
}

function createInactivityAbortController(
  timeoutMs: number,
  externalAbortSignal?: AbortSignal,
): InactivityAbortController {
  const requestAbortController = new AbortController();
  let didRequestTimeOut = false;
  let requestTimeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

  const handleExternalAbort = () => {
    requestAbortController.abort(externalAbortSignal?.reason);
  };

  const resetTimeout = () => {
    if (requestAbortController.signal.aborted) {
      return;
    }

    if (requestTimeoutId !== undefined) {
      globalThis.clearTimeout(requestTimeoutId);
    }

    requestTimeoutId = globalThis.setTimeout(() => {
      didRequestTimeOut = true;
      requestAbortController.abort();
    }, timeoutMs);
  };

  if (externalAbortSignal?.aborted) {
    handleExternalAbort();
  } else {
    externalAbortSignal?.addEventListener('abort', handleExternalAbort, {
      once: true,
    });
  }

  resetTimeout();

  return {
    signal: requestAbortController.signal,
    abort: () => requestAbortController.abort(),
    resetTimeout,
    cleanup: () => {
      if (requestTimeoutId !== undefined) {
        globalThis.clearTimeout(requestTimeoutId);
      }
      externalAbortSignal?.removeEventListener('abort', handleExternalAbort);
    },
    hasTimedOut: () => didRequestTimeOut,
  };
}

async function cancelResponseStreamSafely(
  responseStreamReader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    await responseStreamReader.cancel();
  } catch {
    return;
  }
}

export function getChatApiBaseUrl(): string | null {
  return getPublicAppConfig().apiBaseUrl;
}

async function readChatApiErrorResponse(
  httpResponse: Response,
): Promise<ChatApiError> {
  let errorPayload: ChatApiErrorPayload | undefined;

  try {
    errorPayload = (await httpResponse.json()) as ChatApiErrorPayload;
  } catch {
    errorPayload = undefined;
  }

  return new ChatApiError(
    errorPayload?.error?.message ?? '챗봇 서버에서 응답을 받지 못했습니다.',
    {
      errorCode: errorPayload?.error?.code ?? `HTTP_${httpResponse.status}`,
      statusCode: httpResponse.status,
      isRetryable:
        errorPayload?.error?.retryable ?? httpResponse.status >= 500,
      retryAfterSeconds:
        errorPayload?.error?.retryAfterSeconds ??
        (Number.parseInt(httpResponse.headers.get('Retry-After') ?? '', 10) ||
          undefined),
      resetAtEpochSeconds:
        Number.parseInt(httpResponse.headers.get('X-RateLimit-Reset') ?? '', 10) ||
        undefined,
    },
  );
}

function parseNonNegativeIntegerHeader(
  responseHeaders: Headers,
  headerName: string,
): number | undefined {
  const headerValue = responseHeaders.get(headerName);
  if (!headerValue || !/^\d+$/.test(headerValue)) {
    return undefined;
  }

  const parsedHeaderValue = Number.parseInt(headerValue, 10);
  return Number.isSafeInteger(parsedHeaderValue) ? parsedHeaderValue : undefined;
}

export function readChatQuotaStatus(
  responseHeaders: Headers,
): ChatQuotaStatus | undefined {
  const requestLimit = parseNonNegativeIntegerHeader(
    responseHeaders,
    'X-RateLimit-Limit',
  );
  const remainingRequests = parseNonNegativeIntegerHeader(
    responseHeaders,
    'X-RateLimit-Remaining',
  );
  const resetAtEpochSeconds = parseNonNegativeIntegerHeader(
    responseHeaders,
    'X-RateLimit-Reset',
  );

  if (
    requestLimit === undefined ||
    requestLimit < 1 ||
    remainingRequests === undefined ||
    remainingRequests > requestLimit ||
    resetAtEpochSeconds === undefined ||
    resetAtEpochSeconds < 1
  ) {
    return undefined;
  }

  return {
    requestLimit,
    remainingRequests,
    resetAtEpochSeconds,
  };
}

interface InternalChatStreamCallbacks
  extends Pick<
    ChatResponseStreamOptions,
    'onTextChunk' | 'onComplete' | 'onProgress'
  > {
  onReady: () => void;
}

function isPlainRecord(candidateValue: unknown): candidateValue is Record<string, unknown> {
  return (
    candidateValue !== null &&
    typeof candidateValue === 'object' &&
    !Array.isArray(candidateValue)
  );
}

function createInvalidSseDataError(): ChatApiError {
  return new ChatApiError('스트리밍 응답 형식을 읽지 못했습니다.', {
    errorCode: 'INVALID_SSE_DATA',
    isRetryable: true,
  });
}

function parseSseEventPayload(parsedSseEvent: ParsedSseEvent): unknown {
  if (!parsedSseEvent.data) {
    throw createInvalidSseDataError();
  }

  try {
    return JSON.parse(parsedSseEvent.data) as unknown;
  } catch {
    throw createInvalidSseDataError();
  }
}

function handleChatStreamEvent(
  parsedSseEvent: ParsedSseEvent,
  streamCallbacks: InternalChatStreamCallbacks,
): void {
  if (!KNOWN_CHAT_STREAM_EVENTS.has(parsedSseEvent.event)) {
    return;
  }

  const parsedEventPayload = parseSseEventPayload(parsedSseEvent);

  switch (parsedSseEvent.event) {
    case MINICHAT_STREAM_EVENT.ready: {
      if (!isPlainRecord(parsedEventPayload)) {
        throw createInvalidSseDataError();
      }

      const protocolVersion = parsedEventPayload.protocolVersion;
      if (protocolVersion !== MINICHAT_STREAM_PROTOCOL_VERSION) {
        throw new ChatApiError(
          '대화 화면과 서버 버전이 맞지 않습니다. 페이지를 새로고침해주세요.',
          {
            errorCode: 'INCOMPATIBLE_CHAT_PROTOCOL',
            isRetryable: true,
          },
        );
      }
      streamCallbacks.onReady();
      streamCallbacks.onProgress?.('ready');
      break;
    }
    case MINICHAT_STREAM_EVENT.status: {
      if (!isPlainRecord(parsedEventPayload)) {
        throw createInvalidSseDataError();
      }

      const streamPhase = parsedEventPayload.phase;
      if (streamPhase !== undefined && typeof streamPhase !== 'string') {
        throw createInvalidSseDataError();
      }
      if (streamPhase === MINICHAT_STREAM_PHASE.generating) {
        streamCallbacks.onProgress?.('generating');
      }
      break;
    }
    case MINICHAT_STREAM_EVENT.chunk: {
      if (!isPlainRecord(parsedEventPayload)) {
        throw createInvalidSseDataError();
      }

      const textChunk = parsedEventPayload.text;
      if (typeof textChunk !== 'string') {
        throw createInvalidSseDataError();
      }
      if (textChunk.length > 0) {
        streamCallbacks.onTextChunk(textChunk);
      }
      break;
    }
    case MINICHAT_STREAM_EVENT.done: {
      if (!isPlainRecord(parsedEventPayload)) {
        throw createInvalidSseDataError();
      }
      streamCallbacks.onComplete?.(
        parsedEventPayload as ChatStreamCompletionMetadata,
      );
      break;
    }
    case MINICHAT_STREAM_EVENT.error: {
      if (!isPlainRecord(parsedEventPayload)) {
        throw createInvalidSseDataError();
      }

      const errorDetails = parsedEventPayload.error;
      if (!isPlainRecord(errorDetails)) {
        throw createInvalidSseDataError();
      }

      const errorMessage = errorDetails.message;
      const errorCode = errorDetails.code;
      const isRetryable = errorDetails.retryable;
      if (
        (errorMessage !== undefined && typeof errorMessage !== 'string') ||
        (errorCode !== undefined && typeof errorCode !== 'string') ||
        (isRetryable !== undefined && typeof isRetryable !== 'boolean')
      ) {
        throw createInvalidSseDataError();
      }

      throw new ChatApiError(
        errorMessage ?? '답변 생성 중 문제가 생겼습니다.',
        {
          errorCode,
          isRetryable,
        },
      );
    }
    default:
      break;
  }
}

function assertCompatibleChatProtocol(chatResponse: Response): void {
  const responseProtocolVersion = chatResponse.headers.get(
    MINICHAT_STREAM_PROTOCOL_HEADER,
  );

  if (responseProtocolVersion !== MINICHAT_STREAM_PROTOCOL_VERSION) {
    throw new ChatApiError(
      '대화 화면과 서버 버전이 맞지 않습니다. 페이지를 새로고침해주세요.',
      {
        errorCode: 'INCOMPATIBLE_CHAT_PROTOCOL',
        isRetryable: true,
      },
    );
  }
}

function isEventStreamResponse(chatResponse: Response): boolean {
  const responseContentType = chatResponse.headers
    .get('Content-Type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();

  return responseContentType === 'text/event-stream';
}

export async function streamChatResponse(
  streamOptions: ChatResponseStreamOptions,
): Promise<void> {
  const publicAppConfig = getPublicAppConfig();
  const chatApiBaseUrl = publicAppConfig.apiBaseUrl;

  if (!chatApiBaseUrl) {
    throw new ChatApiError('챗봇 서버 주소가 올바르게 설정되지 않았습니다.', {
      errorCode: 'API_NOT_CONFIGURED',
    });
  }

  const inactivityAbortController = createInactivityAbortController(
    publicAppConfig.requestTimeoutMs,
    streamOptions.abortSignal,
  );

  try {
    const chatResponse = await fetch(`${chatApiBaseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        [MINICHAT_STREAM_PROTOCOL_HEADER]:
          MINICHAT_STREAM_PROTOCOL_VERSION,
      },
      body: JSON.stringify({ messages: streamOptions.requestMessages }),
      signal: inactivityAbortController.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });

    if (!chatResponse.ok) {
      throw await readChatApiErrorResponse(chatResponse);
    }

    assertCompatibleChatProtocol(chatResponse);

    if (!isEventStreamResponse(chatResponse)) {
      throw new ChatApiError('챗봇 서버의 응답 형식이 올바르지 않습니다.', {
        errorCode: 'INVALID_CONTENT_TYPE',
        isRetryable: true,
      });
    }

    inactivityAbortController.resetTimeout();

    const quotaStatus = readChatQuotaStatus(chatResponse.headers);
    if (quotaStatus) {
      streamOptions.onQuotaStatus?.(quotaStatus);
    }

    if (!chatResponse.body) {
      throw new ChatApiError('브라우저가 스트리밍 응답을 지원하지 않습니다.', {
        errorCode: 'STREAM_UNAVAILABLE',
      });
    }

    const responseStreamReader = chatResponse.body.getReader();
    const responseTextDecoder = new TextDecoder();
    const sseParser = new SseParser();
    let hasReceivedReadyEvent = false;
    let hasReceivedCompletionEvent = false;
    let receivedResponseCharacterCount = 0;

    const assertReadyEventReceived = () => {
      if (!hasReceivedReadyEvent) {
        throw new ChatApiError(
          '대화 서버가 준비되기 전에 응답 데이터를 보냈습니다.',
          {
            errorCode: 'INVALID_STREAM_SEQUENCE',
            isRetryable: true,
          },
        );
      }
    };

    const assertStreamNotCompleted = () => {
      if (hasReceivedCompletionEvent) {
        throw new ChatApiError(
          '대화 서버가 완료 이벤트 뒤에 추가 데이터를 보냈습니다.',
          {
            errorCode: 'INVALID_STREAM_SEQUENCE',
            isRetryable: true,
          },
        );
      }
    };

    const streamCallbacks: InternalChatStreamCallbacks = {
      onReady: () => {
        assertStreamNotCompleted();
        if (hasReceivedReadyEvent) {
          throw new ChatApiError(
            '대화 서버가 준비 이벤트를 중복 전송했습니다.',
            {
              errorCode: 'INVALID_STREAM_SEQUENCE',
              isRetryable: true,
            },
          );
        }
        hasReceivedReadyEvent = true;
      },
      onTextChunk: (textChunk) => {
        assertReadyEventReceived();
        assertStreamNotCompleted();
        receivedResponseCharacterCount += textChunk.length;
        if (
          receivedResponseCharacterCount > publicAppConfig.maxResponseLength
        ) {
          inactivityAbortController.abort();
          throw new ChatApiError('답변이 허용된 길이를 초과했습니다.', {
            errorCode: 'RESPONSE_TOO_LARGE',
            isRetryable: true,
          });
        }

        streamOptions.onTextChunk(textChunk);
      },
      onProgress: (streamProgress) => {
        assertReadyEventReceived();
        assertStreamNotCompleted();
        streamOptions.onProgress?.(streamProgress);
      },
      onComplete: (completionMetadata) => {
        assertReadyEventReceived();
        assertStreamNotCompleted();
        hasReceivedCompletionEvent = true;
        streamOptions.onComplete?.(completionMetadata);
      },
    };

    try {
      while (true) {
        const {
          value: responseChunk,
          done: isResponseStreamComplete,
        } = await responseStreamReader.read();

        if (isResponseStreamComplete) {
          break;
        }

        inactivityAbortController.resetTimeout();

        const decodedResponseChunk = responseTextDecoder.decode(responseChunk, {
          stream: true,
        });

        for (const parsedSseEvent of sseParser.feed(decodedResponseChunk)) {
          handleChatStreamEvent(parsedSseEvent, streamCallbacks);
        }
      }

      const finalDecodedResponseChunk = responseTextDecoder.decode();

      for (const parsedSseEvent of sseParser.feed(finalDecodedResponseChunk)) {
        handleChatStreamEvent(parsedSseEvent, streamCallbacks);
      }

      for (const parsedSseEvent of sseParser.flush()) {
        handleChatStreamEvent(parsedSseEvent, streamCallbacks);
      }

      if (!hasReceivedReadyEvent) {
        throw new ChatApiError(
          '대화 서버가 연결 준비 이벤트를 보내지 않았습니다.',
          {
            errorCode: 'MISSING_READY_EVENT',
            isRetryable: true,
          },
        );
      }

      if (!hasReceivedCompletionEvent) {
        throw new ChatApiError(
          '답변 연결이 중간에 끊겼습니다. 다시 한 번 보내주세요.',
          {
            errorCode: 'INCOMPLETE_STREAM',
            isRetryable: true,
          },
        );
      }
    } catch (streamError) {
      await cancelResponseStreamSafely(responseStreamReader);
      throw streamError;
    } finally {
      responseStreamReader.releaseLock();
    }
  } catch (requestError) {
    if (inactivityAbortController.hasTimedOut()) {
      throw new ChatApiError('답변 연결이 오래 멈춰 중단했어요. 다시 시도해주세요.', {
        errorCode: 'STREAM_TIMEOUT',
        isRetryable: true,
      });
    }

    if (requestError instanceof SseParserError) {
      throw new ChatApiError('스트리밍 응답이 허용된 크기를 초과했습니다.', {
        errorCode: 'INVALID_SSE_DATA',
        isRetryable: true,
      });
    }

    if (
      requestError instanceof ChatApiError ||
      inactivityAbortController.signal.aborted ||
      streamOptions.abortSignal.aborted
    ) {
      throw requestError;
    }

    throw new ChatApiError('대화 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해주세요.', {
      errorCode: 'NETWORK_ERROR',
      isRetryable: true,
    });
  } finally {
    inactivityAbortController.cleanup();
  }
}

export async function checkChatApiHealth(
  externalAbortSignal?: AbortSignal,
): Promise<boolean> {
  const publicAppConfig = getPublicAppConfig();
  const chatApiBaseUrl = publicAppConfig.apiBaseUrl;

  if (!chatApiBaseUrl) {
    return false;
  }

  const inactivityAbortController = createInactivityAbortController(
    publicAppConfig.healthTimeoutMs,
    externalAbortSignal,
  );

  try {
    const healthResponse = await fetch(`${chatApiBaseUrl}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: inactivityAbortController.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });

    if (!healthResponse.ok) {
      return false;
    }

    if (
      healthResponse.headers.get(MINICHAT_STREAM_PROTOCOL_HEADER) !==
      MINICHAT_STREAM_PROTOCOL_VERSION
    ) {
      return false;
    }

    const healthPayload = (await healthResponse.json()) as ChatHealthPayload;
    return (
      healthPayload.ok === true &&
      healthPayload.protocolVersion === MINICHAT_STREAM_PROTOCOL_VERSION
    );
  } catch {
    return false;
  } finally {
    inactivityAbortController.cleanup();
  }
}
