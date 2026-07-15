import { getPublicAppConfig } from '@/config/publicAppConfig';
import { SseParser, type ParsedSseEvent } from '@/lib/sse';
import type {
  ChatQuotaStatus,
  ChatRequestMessage,
  ChatStreamCompletionMetadata,
} from '@/types/chat';

interface ChatResponseStreamOptions {
  requestMessages: ChatRequestMessage[];
  abortSignal: AbortSignal;
  onTextChunk: (textChunk: string) => void;
  onComplete?: (completionMetadata: ChatStreamCompletionMetadata) => void;
  onQuotaStatus?: (quotaStatus: ChatQuotaStatus) => void;
}

interface ChatApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    retryAfterSeconds?: number;
  };
}

interface ChatStreamChunkPayload {
  text?: string;
}

interface ChatApiErrorOptions {
  errorCode?: string;
  statusCode?: number;
  isRetryable?: boolean;
  retryAfterSeconds?: number;
  resetAtEpochSeconds?: number;
}

interface TimedAbortController {
  signal: AbortSignal;
  abort: () => void;
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

function createTimedAbortController(
  timeoutMs: number,
  externalAbortSignal?: AbortSignal,
): TimedAbortController {
  const requestAbortController = new AbortController();
  let didRequestTimeOut = false;

  const handleExternalAbort = () => {
    requestAbortController.abort(externalAbortSignal?.reason);
  };

  if (externalAbortSignal?.aborted) {
    handleExternalAbort();
  } else {
    externalAbortSignal?.addEventListener('abort', handleExternalAbort, {
      once: true,
    });
  }

  const requestTimeoutId = globalThis.setTimeout(() => {
    didRequestTimeOut = true;
    requestAbortController.abort();
  }, timeoutMs);

  return {
    signal: requestAbortController.signal,
    abort: () => requestAbortController.abort(),
    cleanup: () => {
      globalThis.clearTimeout(requestTimeoutId);
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

function handleChatStreamEvent(
  parsedSseEvent: ParsedSseEvent,
  streamCallbacks: Pick<ChatResponseStreamOptions, 'onTextChunk' | 'onComplete'>,
): void {
  if (!parsedSseEvent.data) {
    return;
  }

  let parsedEventPayload: unknown;

  try {
    parsedEventPayload = JSON.parse(parsedSseEvent.data);
  } catch {
    throw new ChatApiError('스트리밍 응답 형식을 읽지 못했습니다.', {
      errorCode: 'INVALID_SSE_DATA',
      isRetryable: true,
    });
  }

  switch (parsedSseEvent.event) {
    case 'chunk': {
      const textChunk = (parsedEventPayload as ChatStreamChunkPayload).text;
      if (typeof textChunk === 'string' && textChunk.length > 0) {
        streamCallbacks.onTextChunk(textChunk);
      }
      break;
    }
    case 'done':
      streamCallbacks.onComplete?.(
        parsedEventPayload as ChatStreamCompletionMetadata,
      );
      break;
    case 'error': {
      const errorPayload = parsedEventPayload as ChatApiErrorPayload;
      throw new ChatApiError(
        errorPayload.error?.message ?? '답변 생성 중 문제가 생겼습니다.',
        {
          errorCode: errorPayload.error?.code,
          isRetryable: errorPayload.error?.retryable,
        },
      );
    }
    default:
      break;
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

  const timedAbortController = createTimedAbortController(
    publicAppConfig.requestTimeoutMs,
    streamOptions.abortSignal,
  );

  try {
    const chatResponse = await fetch(`${chatApiBaseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: streamOptions.requestMessages }),
      signal: timedAbortController.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });

    if (!chatResponse.ok) {
      throw await readChatApiErrorResponse(chatResponse);
    }

    if (!isEventStreamResponse(chatResponse)) {
      throw new ChatApiError('챗봇 서버의 응답 형식이 올바르지 않습니다.', {
        errorCode: 'INVALID_CONTENT_TYPE',
        isRetryable: true,
      });
    }

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
    let hasReceivedCompletionEvent = false;
    let receivedResponseCharacterCount = 0;

    const streamCallbacks: Pick<
      ChatResponseStreamOptions,
      'onTextChunk' | 'onComplete'
    > = {
      onTextChunk: (textChunk) => {
        receivedResponseCharacterCount += textChunk.length;
        if (
          receivedResponseCharacterCount > publicAppConfig.maxResponseLength
        ) {
          timedAbortController.abort();
          throw new ChatApiError('답변이 허용된 길이를 초과했습니다.', {
            errorCode: 'RESPONSE_TOO_LARGE',
            isRetryable: true,
          });
        }

        streamOptions.onTextChunk(textChunk);
      },
      onComplete: (completionMetadata) => {
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
    if (timedAbortController.hasTimedOut()) {
      throw new ChatApiError('답변 시간이 초과됐습니다. 다시 시도해주세요.', {
        errorCode: 'REQUEST_TIMEOUT',
        isRetryable: true,
      });
    }

    throw requestError;
  } finally {
    timedAbortController.cleanup();
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

  const timedAbortController = createTimedAbortController(
    publicAppConfig.healthTimeoutMs,
    externalAbortSignal,
  );

  try {
    const healthResponse = await fetch(`${chatApiBaseUrl}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: timedAbortController.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });

    return healthResponse.ok;
  } catch {
    return false;
  } finally {
    timedAbortController.cleanup();
  }
}
