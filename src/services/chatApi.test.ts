import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MINICHAT_STREAM_PROTOCOL_HEADER,
  MINICHAT_STREAM_PROTOCOL_VERSION,
} from '../../shared/protocol';
import {
  checkChatApiHealth,
  getChatApiBaseUrl,
  streamChatResponse,
} from './chatApi';

const requestMessages = [{ role: 'user' as const, content: '테스트 질문' }];

function stubValidApiEnvironment(): void {
  vi.stubEnv('VITE_API_BASE_URL', 'https://worker.example');
  vi.stubEnv('VITE_API_ORIGIN', 'https://worker.example');
  vi.stubEnv('VITE_APP_ENVIRONMENT', 'production');
  vi.stubEnv('VITE_REQUEST_TIMEOUT_MS', '90000');
  vi.stubEnv('VITE_HEALTH_TIMEOUT_MS', '5000');
  vi.stubEnv('VITE_MAX_MESSAGE_LENGTH', '4000');
  vi.stubEnv('VITE_MAX_RESPONSE_LENGTH', '32000');
  vi.stubEnv('VITE_MAX_CONTEXT_MESSAGES', '24');
  vi.stubEnv('VITE_MAX_PERSISTED_MESSAGES', '60');
}

function createProtocolHeaders(
  contentType = 'text/event-stream',
): Record<string, string> {
  return {
    'Content-Type': contentType,
    [MINICHAT_STREAM_PROTOCOL_HEADER]: MINICHAT_STREAM_PROTOCOL_VERSION,
  };
}

function createReadyEvent(
  protocolVersion: string = MINICHAT_STREAM_PROTOCOL_VERSION,
): string {
  return [
    'event: ready',
    `data: ${JSON.stringify({ requestId: 'req-1', protocolVersion })}`,
    '',
    '',
  ].join('\n');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('streamChatResponse', () => {
  it('delivers normalized chunks and completion metadata', async () => {
    stubValidApiEnvironment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          [
            ': connected',
            '',
            createReadyEvent(),
            'event: status',
            'data: {"phase":"generating"}',
            '',
            'event: chunk',
            'data: {"text":"안녕"}',
            '',
            'event: chunk',
            'data: {"text":"하세요"}',
            '',
            'event: done',
            'data: {"finishReason":"STOP","usage":{"totalTokenCount":8}}',
            '',
          ].join('\n'),
          {
            headers: {
              ...createProtocolHeaders(),
              'X-RateLimit-Limit': '10',
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': '1783782000',
            },
          },
        ),
      ),
    );

    const receivedTextChunks: string[] = [];
    let receivedFinishReason: string | undefined;
    let receivedRemainingRequests: number | undefined;
    const receivedProgressStates: string[] = [];

    await streamChatResponse({
      requestMessages,
      abortSignal: new AbortController().signal,
      onTextChunk: (textChunk) => receivedTextChunks.push(textChunk),
      onComplete: (completionMetadata) => {
        receivedFinishReason = completionMetadata.finishReason;
      },
      onQuotaStatus: (quotaStatus) => {
        receivedRemainingRequests = quotaStatus.remainingRequests;
      },
      onProgress: (streamProgress) => {
        receivedProgressStates.push(streamProgress);
      },
    });

    expect(receivedTextChunks.join('')).toBe('안녕하세요');
    expect(receivedFinishReason).toBe('STOP');
    expect(receivedRemainingRequests).toBe(0);
    expect(receivedProgressStates).toEqual(['ready', 'generating']);
    expect(fetch).toHaveBeenCalledWith(
      'https://worker.example/api/chat',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: expect.objectContaining({
          [MINICHAT_STREAM_PROTOCOL_HEADER]:
            MINICHAT_STREAM_PROTOCOL_VERSION,
        }),
      }),
    );
  });

  it('rejects a stream that closes without a done event', async () => {
    stubValidApiEnvironment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          `${createReadyEvent()}event: chunk\ndata: {"text":"일부 답변"}\n\n`,
          { headers: createProtocolHeaders() },
        ),
      ),
    );

    await expect(
      streamChatResponse({
        requestMessages,
        abortSignal: new AbortController().signal,
        onTextChunk: () => undefined,
      }),
    ).rejects.toMatchObject({ errorCode: 'INCOMPLETE_STREAM', isRetryable: true });
  });

  it('rejects a stream that omits the ready event', async () => {
    stubValidApiEnvironment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('', {
          headers: createProtocolHeaders(),
        }),
      ),
    );

    await expect(
      streamChatResponse({
        requestMessages,
        abortSignal: new AbortController().signal,
        onTextChunk: () => undefined,
      }),
    ).rejects.toMatchObject({ errorCode: 'MISSING_READY_EVENT' });
  });

  it('rejects response data sent before the ready event', async () => {
    stubValidApiEnvironment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          'event: chunk\ndata: {"text":"순서 오류"}\n\nevent: done\ndata: {}\n\n',
          { headers: createProtocolHeaders() },
        ),
      ),
    );

    await expect(
      streamChatResponse({
        requestMessages,
        abortSignal: new AbortController().signal,
        onTextChunk: () => undefined,
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_STREAM_SEQUENCE' });
  });

  it('rejects a mismatched ready-event protocol version', async () => {
    stubValidApiEnvironment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(`${createReadyEvent('0')}event: done\ndata: {}\n\n`, {
          headers: createProtocolHeaders(),
        }),
      ),
    );

    await expect(
      streamChatResponse({
        requestMessages,
        abortSignal: new AbortController().signal,
        onTextChunk: () => undefined,
      }),
    ).rejects.toMatchObject({ errorCode: 'INCOMPATIBLE_CHAT_PROTOCOL' });
  });

  it('rejects a duplicate ready event', async () => {
    stubValidApiEnvironment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          `${createReadyEvent()}${createReadyEvent()}event: done\ndata: {}\n\n`,
          { headers: createProtocolHeaders() },
        ),
      ),
    );

    await expect(
      streamChatResponse({
        requestMessages,
        abortSignal: new AbortController().signal,
        onTextChunk: () => undefined,
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_STREAM_SEQUENCE' });
  });

  it('preserves retry metadata from a rate-limit response', async () => {
    stubValidApiEnvironment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'DAILY_QUOTA_EXCEEDED',
              message:
                '오늘 이용 가능한 10회를 모두 사용했어요. 임시 운영 중이라 한국 시간 자정부터 다시 대화할 수 있어요.',
              retryable: true,
              retryAfterSeconds: 43_200,
            },
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '43200',
              'X-RateLimit-Reset': '1783782000',
            },
          },
        ),
      ),
    );

    await expect(
      streamChatResponse({
        requestMessages,
        abortSignal: new AbortController().signal,
        onTextChunk: () => undefined,
      }),
    ).rejects.toMatchObject({
      errorCode: 'DAILY_QUOTA_EXCEEDED',
      statusCode: 429,
      isRetryable: true,
      retryAfterSeconds: 43_200,
      resetAtEpochSeconds: 1_783_782_000,
    });
  });

  it('rejects a successful response from an incompatible Worker protocol', async () => {
    stubValidApiEnvironment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('event: done\ndata: {}\n\n', {
          headers: {
            'Content-Type': 'text/event-stream',
            [MINICHAT_STREAM_PROTOCOL_HEADER]: '0',
          },
        }),
      ),
    );

    await expect(
      streamChatResponse({
        requestMessages,
        abortSignal: new AbortController().signal,
        onTextChunk: () => undefined,
      }),
    ).rejects.toMatchObject({
      errorCode: 'INCOMPATIBLE_CHAT_PROTOCOL',
      isRetryable: true,
    });
  });

  it('fails closed when the API origin pin does not match', () => {
    stubValidApiEnvironment();
    vi.stubEnv('VITE_API_ORIGIN', 'https://other.example');

    expect(getChatApiBaseUrl()).toBeNull();
  });

  it('rejects successful responses that are not SSE', async () => {
    stubValidApiEnvironment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('{"ok":true}', {
          headers: createProtocolHeaders('application/json'),
        }),
      ),
    );

    await expect(
      streamChatResponse({
        requestMessages,
        abortSignal: new AbortController().signal,
        onTextChunk: () => undefined,
      }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_CONTENT_TYPE' });
  });

  it('aborts a response that exceeds the public response limit', async () => {
    stubValidApiEnvironment();
    vi.stubEnv('VITE_MAX_RESPONSE_LENGTH', '4000');
    const oversizedText = '가'.repeat(4_001);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          `${createReadyEvent()}event: chunk\ndata: ${JSON.stringify({
            text: oversizedText,
          })}\n\n`,
          { headers: createProtocolHeaders() },
        ),
      ),
    );

    await expect(
      streamChatResponse({
        requestMessages,
        abortSignal: new AbortController().signal,
        onTextChunk: () => undefined,
      }),
    ).rejects.toMatchObject({ errorCode: 'RESPONSE_TOO_LARGE' });
  });
});

describe('checkChatApiHealth', () => {
  it('accepts a matching protocol header and response body', async () => {
    stubValidApiEnvironment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            service: 'minichat-api',
            protocolVersion: MINICHAT_STREAM_PROTOCOL_VERSION,
          }),
          { headers: createProtocolHeaders('application/json') },
        ),
      ),
    );

    await expect(checkChatApiHealth()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://worker.example/api/health',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
      }),
    );
  });

  it('rejects a mismatched protocol body even when the header matches', async () => {
    stubValidApiEnvironment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: true, protocolVersion: '0' }),
          { headers: createProtocolHeaders('application/json') },
        ),
      ),
    );

    await expect(checkChatApiHealth()).resolves.toBe(false);
  });
});
