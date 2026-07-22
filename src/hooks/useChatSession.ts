import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_MESSAGE_INPUT_LENGTH } from '@/constants/chat';
import { CHAT_DAILY_QUOTA_NOTICE_MESSAGE } from '../../shared/quota';
import {
  createChatMessage,
  createWelcomeChatMessage,
  loadPersistedChatMessages,
  savePersistedChatMessages,
  toChatRequestMessages,
} from '@/lib/chat';
import {
  ChatApiError,
  checkChatApiHealth,
  getChatApiBaseUrl,
  streamChatResponse,
} from '@/services/chatApi';
import { createStreamingTextPresenter } from '@/lib/streamPresentation';
import type {
  ChatConnectionState,
  ChatMessage,
  ChatQuotaStatus,
  ChatStreamProgress,
} from '@/types/chat';

const STREAM_DELAY_NOTICE_MS = 8_000;

const STREAM_PROGRESS_MESSAGES: Record<ChatStreamProgress, string> = {
  ready: '답변 준비 중…',
  generating: '답변 작성 중…',
};

interface ChatSessionState {
  chatMessages: ChatMessage[];
  draftText: string;
  isStreaming: boolean;
  connectionStatus: ChatConnectionState;
  dailyQuotaResetAtEpochSeconds: number | null;
}

function getInitialChatMessages(): ChatMessage[] {
  return [createWelcomeChatMessage(), ...loadPersistedChatMessages()];
}

function createDailyQuotaNoticeMessage(): ChatMessage {
  return createChatMessage('assistant', CHAT_DAILY_QUOTA_NOTICE_MESSAGE, {
    messageKind: 'daily-quota-notice',
  });
}

function getQuotaResetAtEpochSeconds(quotaError: ChatApiError): number {
  if (quotaError.resetAtEpochSeconds) {
    return quotaError.resetAtEpochSeconds;
  }

  const retryAfterSeconds = quotaError.retryAfterSeconds ?? 60;
  return Math.floor(Date.now() / 1_000) + retryAfterSeconds;
}

function getUserFacingErrorMessage(errorCause: unknown): string {
  if (errorCause instanceof ChatApiError) {
    return errorCause.message;
  }

  return '잠시 문제가 생겼습니다. 다시 한 번 보내주세요.';
}

export function useChatSession() {
  const [chatSessionState, setChatSessionState] = useState<ChatSessionState>(
    () => ({
      chatMessages: getInitialChatMessages(),
      draftText: '',
      isStreaming: false,
      connectionStatus: getChatApiBaseUrl() ? 'checking' : 'unconfigured',
      dailyQuotaResetAtEpochSeconds: null,
    }),
  );

  const chatSessionStateRef = useRef(chatSessionState);
  chatSessionStateRef.current = chatSessionState;
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const isStreamActiveRef = useRef(false);
  const activeStreamSequenceRef = useRef(0);
  const connectionCheckSequenceRef = useRef(0);
  const connectionCheckAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (chatSessionState.isStreaming) {
      return;
    }

    savePersistedChatMessages(chatSessionState.chatMessages);
  }, [chatSessionState.chatMessages, chatSessionState.isStreaming]);

  useEffect(() => {
    const resetAtEpochSeconds =
      chatSessionState.dailyQuotaResetAtEpochSeconds;
    if (!resetAtEpochSeconds) {
      return undefined;
    }

    const clearExpiredDailyQuota = () => {
      setChatSessionState((currentState) => ({
        ...currentState,
        dailyQuotaResetAtEpochSeconds: null,
        chatMessages: currentState.chatMessages.filter(
          (chatMessage) => chatMessage.messageKind !== 'daily-quota-notice',
        ),
      }));
    };

    const millisecondsUntilReset = resetAtEpochSeconds * 1_000 - Date.now();
    if (millisecondsUntilReset <= 0) {
      clearExpiredDailyQuota();
      return undefined;
    }

    const quotaResetTimeoutId = window.setTimeout(
      clearExpiredDailyQuota,
      millisecondsUntilReset,
    );

    return () => window.clearTimeout(quotaResetTimeoutId);
  }, [chatSessionState.dailyQuotaResetAtEpochSeconds]);

  const markConnectionOnline = useCallback(() => {
    connectionCheckSequenceRef.current += 1;
    connectionCheckAbortControllerRef.current?.abort();
    connectionCheckAbortControllerRef.current = null;
    setChatSessionState((currentState) =>
      currentState.connectionStatus === 'online'
        ? currentState
        : { ...currentState, connectionStatus: 'online' },
    );
  }, []);

  const refreshConnectionStatus = useCallback(async () => {
    const checkSequence = connectionCheckSequenceRef.current + 1;
    connectionCheckSequenceRef.current = checkSequence;
    connectionCheckAbortControllerRef.current?.abort();

    if (!getChatApiBaseUrl()) {
      connectionCheckAbortControllerRef.current = null;
      setChatSessionState((currentState) => ({
        ...currentState,
        connectionStatus: 'unconfigured',
      }));
      return;
    }

    const connectionCheckController = new AbortController();
    connectionCheckAbortControllerRef.current = connectionCheckController;
    setChatSessionState((currentState) => ({
      ...currentState,
      connectionStatus: 'checking',
    }));

    const isChatApiOnline = await checkChatApiHealth(
      connectionCheckController.signal,
    );

    if (
      connectionCheckSequenceRef.current !== checkSequence ||
      connectionCheckController.signal.aborted
    ) {
      return;
    }

    connectionCheckAbortControllerRef.current = null;
    setChatSessionState((currentState) => ({
      ...currentState,
      connectionStatus: isChatApiOnline ? 'online' : 'offline',
    }));
  }, []);

  useEffect(() => {
    void refreshConnectionStatus();

    return () => {
      connectionCheckSequenceRef.current += 1;
      connectionCheckAbortControllerRef.current?.abort();
      connectionCheckAbortControllerRef.current = null;
    };
  }, [refreshConnectionStatus]);

  useEffect(
    () => () => {
      activeStreamSequenceRef.current += 1;
      streamAbortControllerRef.current?.abort();
      streamAbortControllerRef.current = null;
      isStreamActiveRef.current = false;
    },
    [],
  );

  const updateAssistantMessage = useCallback(
    (
      assistantMessageId: string,
      messageUpdater: (chatMessage: ChatMessage) => ChatMessage,
    ) => {
      setChatSessionState((currentState) => ({
        ...currentState,
        chatMessages: currentState.chatMessages.map((chatMessage) =>
          chatMessage.id === assistantMessageId
            ? messageUpdater(chatMessage)
            : chatMessage,
        ),
      }));
    },
    [],
  );

  const revealDailyQuotaNotice = useCallback(
    (quotaStatus: ChatQuotaStatus) => {
      setChatSessionState((currentState) => {
        const hasQuotaNotice = currentState.chatMessages.some(
          (chatMessage) => chatMessage.messageKind === 'daily-quota-notice',
        );

        return {
          ...currentState,
          dailyQuotaResetAtEpochSeconds: quotaStatus.resetAtEpochSeconds,
          chatMessages: hasQuotaNotice
            ? currentState.chatMessages
            : [...currentState.chatMessages, createDailyQuotaNoticeMessage()],
        };
      });
    },
    [],
  );

  const streamAssistantResponse = useCallback(
    async (contextMessages: ChatMessage[], assistantMessageId: string) => {
      if (isStreamActiveRef.current) {
        return;
      }

      const streamAbortController = new AbortController();
      const streamSequence = activeStreamSequenceRef.current + 1;
      activeStreamSequenceRef.current = streamSequence;
      streamAbortControllerRef.current = streamAbortController;
      isStreamActiveRef.current = true;

      const isCurrentStream = () =>
        activeStreamSequenceRef.current === streamSequence &&
        streamAbortControllerRef.current === streamAbortController;

      let hasReceivedTextChunk = false;
      let latestQuotaStatus: ChatQuotaStatus | undefined;
      const streamingTextPresenter = createStreamingTextPresenter(
        (textFrame) => {
          if (!isCurrentStream()) {
            return;
          }

          updateAssistantMessage(assistantMessageId, (chatMessage) => ({
            ...chatMessage,
            content: chatMessage.content + textFrame,
            status: 'streaming',
            isRetryable: undefined,
            statusMessage: undefined,
            progressMessage: undefined,
          }));
        },
      );
      const handlePresentationAbort = () => {
        streamingTextPresenter.dispose();
      };
      streamAbortController.signal.addEventListener(
        'abort',
        handlePresentationAbort,
        { once: true },
      );
      const delayedProgressTimeoutId = window.setTimeout(() => {
        if (
          hasReceivedTextChunk ||
          !isStreamActiveRef.current ||
          !isCurrentStream()
        ) {
          return;
        }

        updateAssistantMessage(assistantMessageId, (chatMessage) => ({
          ...chatMessage,
          progressMessage: '응답이 조금 늦어지고 있어요…',
        }));
      }, STREAM_DELAY_NOTICE_MS);

      setChatSessionState((currentState) => ({
        ...currentState,
        isStreaming: true,
      }));

      try {
        await streamChatResponse({
          requestMessages: toChatRequestMessages(contextMessages),
          abortSignal: streamAbortController.signal,
          onTextChunk: (textChunk) => {
            if (!isCurrentStream()) {
              return;
            }

            hasReceivedTextChunk = true;
            window.clearTimeout(delayedProgressTimeoutId);
            streamingTextPresenter.enqueueText(textChunk);
          },
          onProgress: (streamProgress) => {
            if (!isCurrentStream()) {
              return;
            }

            if (streamProgress === 'ready') {
              markConnectionOnline();
            }

            if (hasReceivedTextChunk) {
              return;
            }

            updateAssistantMessage(assistantMessageId, (chatMessage) => ({
              ...chatMessage,
              progressMessage: STREAM_PROGRESS_MESSAGES[streamProgress],
            }));
          },
          onQuotaStatus: (quotaStatus) => {
            if (isCurrentStream()) {
              latestQuotaStatus = quotaStatus;
            }
          },
        });

        if (!isCurrentStream()) {
          streamingTextPresenter.dispose();
          return;
        }

        await streamingTextPresenter.finishText();

        if (!isCurrentStream()) {
          return;
        }

        if (streamAbortController.signal.aborted) {
          updateAssistantMessage(assistantMessageId, (chatMessage) => ({
            ...chatMessage,
            content: chatMessage.content || '답변 생성을 중단했어요.',
            status: 'cancelled',
            isRetryable: undefined,
            statusMessage: undefined,
            progressMessage: undefined,
          }));
          return;
        }

        updateAssistantMessage(assistantMessageId, (chatMessage) => ({
          ...chatMessage,
          content: hasReceivedTextChunk
            ? chatMessage.content
            : '답변 내용이 비어 있습니다. 질문을 조금 바꿔 다시 보내주세요.',
          status: hasReceivedTextChunk ? 'complete' : 'error',
          isRetryable: hasReceivedTextChunk ? undefined : true,
          statusMessage: undefined,
          progressMessage: undefined,
        }));
      } catch (responseError) {
        if (!isCurrentStream()) {
          streamingTextPresenter.dispose();
          return;
        }

        if (streamAbortController.signal.aborted) {
          streamingTextPresenter.dispose();
          updateAssistantMessage(assistantMessageId, (chatMessage) => ({
            ...chatMessage,
            content: chatMessage.content || '답변 생성을 중단했어요.',
            status: 'cancelled',
            isRetryable: undefined,
            statusMessage: undefined,
            progressMessage: undefined,
          }));
          return;
        }

        await streamingTextPresenter.finishText();

        if (!isCurrentStream()) {
          return;
        }

        const userFacingErrorMessage = getUserFacingErrorMessage(responseError);
        const responseErrorCode =
          responseError instanceof ChatApiError
            ? responseError.errorCode
            : 'UNKNOWN_ERROR';
        const isDailyQuotaExceeded =
          responseErrorCode === 'DAILY_QUOTA_EXCEEDED';
        const isResponseRetryable =
          responseError instanceof ChatApiError
            ? responseError.isRetryable
            : true;

        if (responseErrorCode === 'NETWORK_ERROR') {
          setChatSessionState((currentState) => ({
            ...currentState,
            connectionStatus: 'offline',
          }));
        } else if (responseErrorCode === 'API_NOT_CONFIGURED') {
          setChatSessionState((currentState) => ({
            ...currentState,
            connectionStatus: 'unconfigured',
          }));
        }

        updateAssistantMessage(assistantMessageId, (chatMessage) => ({
          ...chatMessage,
          content: hasReceivedTextChunk
            ? chatMessage.content
            : userFacingErrorMessage,
          status: 'error',
          errorCode: responseErrorCode,
          isRetryable: isResponseRetryable,
          statusMessage: hasReceivedTextChunk
            ? userFacingErrorMessage
            : undefined,
          progressMessage: undefined,
          messageKind: isDailyQuotaExceeded
            ? 'daily-quota-notice'
            : 'standard',
        }));

        if (isDailyQuotaExceeded && responseError instanceof ChatApiError) {
          setChatSessionState((currentState) => ({
            ...currentState,
            dailyQuotaResetAtEpochSeconds:
              getQuotaResetAtEpochSeconds(responseError),
          }));
        }
      } finally {
        window.clearTimeout(delayedProgressTimeoutId);
        streamAbortController.signal.removeEventListener(
          'abort',
          handlePresentationAbort,
        );
        streamingTextPresenter.dispose();

        if (isCurrentStream()) {
          if (latestQuotaStatus?.remainingRequests === 0) {
            revealDailyQuotaNotice(latestQuotaStatus);
          }

          isStreamActiveRef.current = false;
          streamAbortControllerRef.current = null;
          setChatSessionState((currentState) => ({
            ...currentState,
            isStreaming: false,
          }));
        }
      }
    },
    [markConnectionOnline, revealDailyQuotaNotice, updateAssistantMessage],
  );

  const sendChatMessage = useCallback(
    (messageTextOverride?: string) => {
      const currentSessionState = chatSessionStateRef.current;
      const messageText = (
        messageTextOverride ?? currentSessionState.draftText
      )
        .trim()
        .slice(0, MAX_MESSAGE_INPUT_LENGTH);

      if (
        !messageText ||
        isStreamActiveRef.current ||
        currentSessionState.dailyQuotaResetAtEpochSeconds !== null
      ) {
        return;
      }

      const userMessage = createChatMessage('user', messageText);
      const assistantMessage = createChatMessage('assistant', '', {
        status: 'streaming',
        progressMessage: '서버에 연결 중…',
      });
      const contextMessages = [
        ...currentSessionState.chatMessages,
        userMessage,
      ];

      setChatSessionState((currentState) => ({
        ...currentState,
        chatMessages: [...contextMessages, assistantMessage],
        draftText: '',
      }));

      void streamAssistantResponse(contextMessages, assistantMessage.id);
    },
    [streamAssistantResponse],
  );

  const retryAssistantMessage = useCallback(
    (assistantMessageId: string) => {
      const currentSessionState = chatSessionStateRef.current;
      if (
        isStreamActiveRef.current ||
        currentSessionState.dailyQuotaResetAtEpochSeconds !== null
      ) {
        return;
      }

      const assistantMessageIndex = currentSessionState.chatMessages.findIndex(
        (chatMessage) =>
          chatMessage.id === assistantMessageId &&
          chatMessage.role === 'assistant',
      );

      if (assistantMessageIndex <= 0) {
        return;
      }

      const retryTargetMessage =
        currentSessionState.chatMessages[assistantMessageIndex];
      if (retryTargetMessage?.isRetryable === false) {
        return;
      }

      const contextMessages = currentSessionState.chatMessages.slice(
        0,
        assistantMessageIndex,
      );
      const latestContextMessage = contextMessages.at(-1);
      if (latestContextMessage?.role !== 'user') {
        return;
      }

      const replacementAssistantMessage = createChatMessage('assistant', '', {
        status: 'streaming',
        progressMessage: '서버에 연결 중…',
      });

      setChatSessionState((currentState) => ({
        ...currentState,
        chatMessages: [...contextMessages, replacementAssistantMessage],
      }));

      void streamAssistantResponse(
        contextMessages,
        replacementAssistantMessage.id,
      );
    },
    [streamAssistantResponse],
  );

  const stopAssistantResponse = useCallback(() => {
    streamAbortControllerRef.current?.abort();
  }, []);

  const resetConversation = useCallback(() => {
    activeStreamSequenceRef.current += 1;
    streamAbortControllerRef.current?.abort();
    streamAbortControllerRef.current = null;
    isStreamActiveRef.current = false;
    setChatSessionState((currentState) => {
      const quotaNoticeMessage = currentState.chatMessages.find(
        (chatMessage) => chatMessage.messageKind === 'daily-quota-notice',
      );

      return {
        ...currentState,
        chatMessages: [
          createWelcomeChatMessage(),
          ...(quotaNoticeMessage ? [quotaNoticeMessage] : []),
        ],
        draftText: '',
        isStreaming: false,
      };
    });
  }, []);

  const setDraftText = useCallback((nextDraftText: string) => {
    setChatSessionState((currentState) => ({
      ...currentState,
      draftText: nextDraftText.slice(0, MAX_MESSAGE_INPUT_LENGTH),
    }));
  }, []);

  const isDailyQuotaExhausted =
    chatSessionState.dailyQuotaResetAtEpochSeconds !== null;

  return {
    ...chatSessionState,
    isDailyQuotaExhausted,
    setDraftText,
    sendChatMessage,
    retryAssistantMessage,
    stopAssistantResponse,
    resetConversation,
    refreshConnectionStatus,
  };
}
