// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  checkChatApiHealth: vi.fn(),
  streamChatResponse: vi.fn(),
}));

vi.mock('@/services/chatApi', () => {
  class ChatApiError extends Error {
    readonly errorCode: string;
    readonly isRetryable: boolean;
    readonly retryAfterSeconds?: number;
    readonly resetAtEpochSeconds?: number;

    constructor(
      message: string,
      options: {
        errorCode?: string;
        isRetryable?: boolean;
        retryAfterSeconds?: number;
        resetAtEpochSeconds?: number;
      } = {},
    ) {
      super(message);
      this.errorCode = options.errorCode ?? 'UNKNOWN_ERROR';
      this.isRetryable = options.isRetryable ?? false;
      this.retryAfterSeconds = options.retryAfterSeconds;
      this.resetAtEpochSeconds = options.resetAtEpochSeconds;
    }
  }

  return {
    ChatApiError,
    checkChatApiHealth: serviceMocks.checkChatApiHealth,
    getChatApiBaseUrl: () => 'https://worker.example',
    streamChatResponse: serviceMocks.streamChatResponse,
  };
});

import { useChatSession } from './useChatSession';

let testRoot: Root | undefined;
let latestSession: ReturnType<typeof useChatSession> | undefined;

function ChatSessionProbe() {
  latestSession = useChatSession();
  return null;
}

async function renderChatSession(): Promise<void> {
  const rootElement = document.createElement('div');
  document.body.appendChild(rootElement);
  testRoot = createRoot(rootElement);
  await act(async () => {
    testRoot?.render(<ChatSessionProbe />);
  });
}

async function flushAsyncState(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  latestSession = undefined;
  serviceMocks.checkChatApiHealth.mockReset();
  serviceMocks.streamChatResponse.mockReset();
  window.localStorage.clear();
});

afterEach(async () => {
  await act(async () => {
    testRoot?.unmount();
  });
  testRoot = undefined;
  document.body.replaceChildren();
});

describe('useChatSession connection checks', () => {
  it('keeps a successful chat connection online when an older health check finishes later', async () => {
    let resolveInitialHealthCheck!: (isOnline: boolean) => void;
    serviceMocks.checkChatApiHealth.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveInitialHealthCheck = resolve;
        }),
    );
    serviceMocks.streamChatResponse.mockImplementationOnce(
      async (streamOptions: {
        onProgress?: (progress: 'ready' | 'generating') => void;
      }) => {
        streamOptions.onProgress?.('ready');
      },
    );

    await renderChatSession();
    expect(latestSession?.connectionStatus).toBe('checking');

    await act(async () => {
      latestSession?.sendChatMessage('연결 성공 질문');
    });
    await flushAsyncState();
    expect(latestSession?.connectionStatus).toBe('online');

    resolveInitialHealthCheck(false);
    await flushAsyncState();
    expect(latestSession?.connectionStatus).toBe('online');
  });

  it('ignores an older manual health result after a newer check succeeds', async () => {
    serviceMocks.checkChatApiHealth.mockResolvedValueOnce(true);
    await renderChatSession();
    await flushAsyncState();

    let resolveOlderCheck!: (isOnline: boolean) => void;
    let resolveNewerCheck!: (isOnline: boolean) => void;
    serviceMocks.checkChatApiHealth
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveOlderCheck = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveNewerCheck = resolve;
          }),
      );

    void latestSession?.refreshConnectionStatus();
    void latestSession?.refreshConnectionStatus();
    resolveNewerCheck(true);
    await flushAsyncState();
    expect(latestSession?.connectionStatus).toBe('online');

    resolveOlderCheck(false);
    await flushAsyncState();
    expect(latestSession?.connectionStatus).toBe('online');
  });
});
