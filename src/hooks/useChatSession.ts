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
import type { ChatConnectionState, ChatMessage, ChatQuotaStatus } from '@/types/chat';

interface ChatSessionState {
  chatMessages: ChatMessage[];
  draftText: string;
  isStreaming: boolean;
  errorMessage: string | null;
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

  if (errorCause instanceof Error && errorCause.message) {
    return errorCause.message;
  }

  return '잠시 문제가 생겼습니다. 다시 한 번 보내주세요.';
}

export function useChatSession() {
  const [chatSessionState, setChatSessionState] = useState<ChatSessionState>(() => ({
    chatMessages: getInitialChatMessages(),
    draftText: '',
    isStreaming: false,
    errorMessage: null,
    connectionStatus: getChatApiBaseUrl() ? 'checking' : 'unconfigured',
    dailyQuotaResetAtEpochSeconds: null,
  }));

  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const isStreamActiveRef = useRef(false);

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

  const refreshConnectionStatus = useCallback(async () => {
    if (!getChatApiBaseUrl()) {
      setChatSessionState((currentState) => ({
        ...currentState,
        connectionStatus: 'unconfigured',
      }));
      return;
    }

    setChatSessionState((currentState) => ({
      ...currentState,
      connectionStatus: 'checking',
    }));

    const isChatApiOnline = await checkChatApiHealth();

    setChatSessionState((currentState) => ({
      ...currentState,
      connectionStatus: isChatApiOnline ? 'online' : 'offline',
    }));
  }, []);

  useEffect(() => {
    if (!getChatApiBaseUrl()) {
      return undefined;
    }

    const connectionCheckController = new AbortController();

    void checkChatApiHealth(connectionCheckController.signal).then((isChatApiOnline) => {
      if (!connectionCheckController.signal.aborted) {
        setChatSessionState((currentState) => ({
          ...currentState,
          connectionStatus: isChatApiOnline ? 'online' : 'offline',
        }));
      }
    });

    return () => connectionCheckController.abort();
  }, []);

  useEffect(
    () => () => {
      streamAbortControllerRef.current?.abort();
    },
    [],
  );

  const updateAssistantMessage = useCallback(
    (assistantMessageId: string, messageUpdater: (chatMessage: ChatMessage) => ChatMessage) => {
      setChatSessionState((currentState) => ({
        ...currentState,
        chatMessages: currentState.chatMessages.map((chatMessage) =>
          chatMessage.id === assistantMessageId ? messageUpdater(chatMessage) : chatMessage,
        ),
      }));
    },
    [],
  );

  const revealDailyQuotaNotice = useCallback((quotaStatus: ChatQuotaStatus) => {
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
  }, []);

  const streamAssistantResponse = useCallback(
    async (contextMessages: ChatMessage[], assistantMessageId: string) => {
      if (isStreamActiveRef.current) {
        return;
      }

      const streamAbortController = new AbortController();
      streamAbortControllerRef.current = streamAbortController;
      isStreamActiveRef.current = true;
      let hasReceivedTextChunk = false;
      let latestQuotaStatus: ChatQuotaStatus | undefined;

      setChatSessionState((currentState) => ({
        ...currentState,
        isStreaming: true,
        errorMessage: null,
      }));

      try {
        await streamChatResponse({
          requestMessages: toChatRequestMessages(contextMessages),
          abortSignal: streamAbortController.signal,
          onTextChunk: (textChunk) => {
            hasReceivedTextChunk = true;
            updateAssistantMessage(assistantMessageId, (chatMessage) => ({
              ...chatMessage,
              content: chatMessage.content + textChunk,
              status: 'streaming',
            }));
          },
          onComplete: () => {
            updateAssistantMessage(assistantMessageId, (chatMessage) => ({
              ...chatMessage,
              status: 'complete',
            }));
          },
          onQuotaStatus: (quotaStatus) => {
            latestQuotaStatus = quotaStatus;
          },
        });

        updateAssistantMessage(assistantMessageId, (chatMessage) => ({
          ...chatMessage,
          content:
            chatMessage.content ||
            '답변 내용이 비어 있습니다. 질문을 조금 바꿔 다시 보내주세요.',
          status: chatMessage.content ? 'complete' : 'error',
        }));
      } catch (responseError) {
        if (streamAbortController.signal.aborted) {
          updateAssistantMessage(assistantMessageId, (chatMessage) => ({
            ...chatMessage,
            content: chatMessage.content || '답변 생성을 중단했어요.',
            status: 'cancelled',
          }));
          return;
        }

        const userFacingErrorMessage = getUserFacingErrorMessage(responseError);
        const responseErrorCode =
          responseError instanceof ChatApiError ? responseError.errorCode : 'UNKNOWN_ERROR';
        const isDailyQuotaExceeded = responseErrorCode === 'DAILY_QUOTA_EXCEEDED';

        updateAssistantMessage(assistantMessageId, (chatMessage) => ({
          ...chatMessage,
          content: hasReceivedTextChunk ? chatMessage.content : userFacingErrorMessage,
          status: 'error',
          errorCode: responseErrorCode,
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
        } else {
          setChatSessionState((currentState) => ({
            ...currentState,
            errorMessage: userFacingErrorMessage,
          }));
        }
      } finally {
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
    },
    [revealDailyQuotaNotice, updateAssistantMessage],
  );

  const sendChatMessage = useCallback(
    (messageTextOverride?: string) => {
      const messageText = (messageTextOverride ?? chatSessionState.draftText)
        .trim()
        .slice(0, MAX_MESSAGE_INPUT_LENGTH);

      if (
        !messageText ||
        isStreamActiveRef.current ||
        chatSessionState.dailyQuotaResetAtEpochSeconds !== null
      ) {
        return;
      }

      const userMessage = createChatMessage('user', messageText);
      const assistantMessage = createChatMessage('assistant', '', { status: 'streaming' });
      const contextMessages = [...chatSessionState.chatMessages, userMessage];

      setChatSessionState((currentState) => ({
        ...currentState,
        chatMessages: [...contextMessages, assistantMessage],
        draftText: '',
        errorMessage: null,
      }));

      void streamAssistantResponse(contextMessages, assistantMessage.id);
    },
    [
      chatSessionState.chatMessages,
      chatSessionState.dailyQuotaResetAtEpochSeconds,
      chatSessionState.draftText,
      streamAssistantResponse,
    ],
  );

  const retryAssistantMessage = useCallback(
    (assistantMessageId: string) => {
      if (
        isStreamActiveRef.current ||
        chatSessionState.dailyQuotaResetAtEpochSeconds !== null
      ) {
        return;
      }

      const assistantMessageIndex = chatSessionState.chatMessages.findIndex(
        (chatMessage) =>
          chatMessage.id === assistantMessageId && chatMessage.role === 'assistant',
      );

      if (assistantMessageIndex <= 0) {
        return;
      }

      const contextMessages = chatSessionState.chatMessages.slice(0, assistantMessageIndex);
      const latestContextMessage = contextMessages.at(-1);
      if (latestContextMessage?.role !== 'user') {
        return;
      }

      const replacementAssistantMessage = createChatMessage('assistant', '', {
        status: 'streaming',
      });

      setChatSessionState((currentState) => ({
        ...currentState,
        chatMessages: [...contextMessages, replacementAssistantMessage],
        errorMessage: null,
      }));

      void streamAssistantResponse(contextMessages, replacementAssistantMessage.id);
    },
    [
      chatSessionState.chatMessages,
      chatSessionState.dailyQuotaResetAtEpochSeconds,
      streamAssistantResponse,
    ],
  );

  const stopAssistantResponse = useCallback(() => {
    streamAbortControllerRef.current?.abort();
  }, []);

  const resetConversation = useCallback(() => {
    streamAbortControllerRef.current?.abort();
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
        errorMessage: null,
      };
    });
  }, []);

  const setDraftText = useCallback((nextDraftText: string) => {
    setChatSessionState((currentState) => ({
      ...currentState,
      draftText: nextDraftText.slice(0, MAX_MESSAGE_INPUT_LENGTH),
    }));
  }, []);

  const dismissErrorMessage = useCallback(() => {
    setChatSessionState((currentState) => ({
      ...currentState,
      errorMessage: null,
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
    dismissErrorMessage,
  };
}
