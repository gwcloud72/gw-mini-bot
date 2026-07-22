// @vitest-environment jsdom

import { act, useEffect } from 'react';
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

type ChatSession = ReturnType<typeof useChatSession>;

interface ChatSessionProbeProps {
  onSessionChange: (chatSession: ChatSession) => void;
}

interface ChatSessionHarness {
  getCurrentSession: () => ChatSession;
}

let testRoot: Root | undefined;

function ChatSessionProbe({ onSessionChange }: ChatSessionProbeProps) {
  const chatSession = useChatSession();

  useEffect(() => {
    onSessionChange(chatSession);
  }, [chatSession, onSessionChange]);

  return null;
}

async function renderChatSession(): Promise<ChatSessionHarness> {
  let currentSession: ChatSession | undefined;
  const handleSessionChange = (nextSession: ChatSession) => {
    currentSession = nextSession;
  };
  const rootElement = document.createElement('div');
  document.body.appendChild(rootElement);
  testRoot = createRoot(rootElement);

  await act(async () => {
    testRoot?.render(
      <ChatSessionProbe onSessionChange={handleSessionChange} />,
    );
  });

  return {
    getCurrentSession: () => {
      if (!currentSession) {
        throw new Error('대화 세션 테스트 상태가 준비되지 않았습니다.');
      }

      return currentSession;
    },
  };
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

    const chatSessionHarness = await renderChatSession();
    expect(chatSessionHarness.getCurrentSession().connectionStatus).toBe('checking');

    await act(async () => {
      chatSessionHarness.getCurrentSession().sendChatMessage('연결 성공 질문');
    });
    await flushAsyncState();
    expect(chatSessionHarness.getCurrentSession().connectionStatus).toBe('online');

    resolveInitialHealthCheck(false);
    await flushAsyncState();
    expect(chatSessionHarness.getCurrentSession().connectionStatus).toBe('online');
  });

  it('ignores an older manual health result after a newer check succeeds', async () => {
    serviceMocks.checkChatApiHealth.mockResolvedValueOnce(true);
    const chatSessionHarness = await renderChatSession();
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

    void chatSessionHarness.getCurrentSession().refreshConnectionStatus();
    void chatSessionHarness.getCurrentSession().refreshConnectionStatus();
    resolveNewerCheck(true);
    await flushAsyncState();
    expect(chatSessionHarness.getCurrentSession().connectionStatus).toBe('online');

    resolveOlderCheck(false);
    await flushAsyncState();
    expect(chatSessionHarness.getCurrentSession().connectionStatus).toBe('online');
  });
});
