import {
  CHAT_HISTORY_STORAGE_KEY,
  LEGACY_CHAT_HISTORY_STORAGE_KEYS,
  MAX_CONTEXT_MESSAGE_COUNT,
  MAX_PERSISTED_MESSAGE_COUNT,
  WELCOME_MESSAGE_TEXT,
} from '@/constants/chat';
import type { ChatMessage, ChatRequestMessage, ChatRole } from '@/types/chat';

interface PersistedConversationRecord {
  serializedMessages: string;
  sourceStorageKey: string;
}

function createChatMessageId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createChatMessage(
  role: ChatRole,
  content: string,
  messageOptions: Partial<Pick<ChatMessage, 'status' | 'isWelcome' | 'errorCode' | 'messageKind'>> = {},
): ChatMessage {
  return {
    id: createChatMessageId(),
    role,
    content,
    createdAt: new Date().toISOString(),
    status: messageOptions.status ?? 'complete',
    isWelcome: messageOptions.isWelcome,
    errorCode: messageOptions.errorCode,
    messageKind: messageOptions.messageKind ?? 'standard',
  };
}

export function createWelcomeChatMessage(): ChatMessage {
  return createChatMessage('assistant', WELCOME_MESSAGE_TEXT, { isWelcome: true });
}

export function toChatRequestMessages(chatMessages: ChatMessage[]): ChatRequestMessage[] {
  return chatMessages
    .filter(
      (chatMessage) =>
        !chatMessage.isWelcome &&
        chatMessage.content.trim().length > 0 &&
        chatMessage.status !== 'error' &&
        chatMessage.status !== 'cancelled' &&
        chatMessage.messageKind !== 'daily-quota-notice',
    )
    .slice(-MAX_CONTEXT_MESSAGE_COUNT)
    .map(({ role, content }) => ({ role, content }));
}

function isPersistedChatMessage(candidateValue: unknown): candidateValue is ChatMessage {
  if (!candidateValue || typeof candidateValue !== 'object') {
    return false;
  }

  const candidateMessage = candidateValue as Partial<ChatMessage>;

  return (
    typeof candidateMessage.id === 'string' &&
    (candidateMessage.role === 'user' || candidateMessage.role === 'assistant') &&
    typeof candidateMessage.content === 'string' &&
    typeof candidateMessage.createdAt === 'string'
  );
}

function readPersistedConversation(): PersistedConversationRecord | null {
  const candidateStorageKeys = [CHAT_HISTORY_STORAGE_KEY, ...LEGACY_CHAT_HISTORY_STORAGE_KEYS];

  for (const sourceStorageKey of candidateStorageKeys) {
    const serializedMessages = window.localStorage.getItem(sourceStorageKey);
    if (serializedMessages) {
      return { serializedMessages, sourceStorageKey };
    }
  }

  return null;
}

export function loadPersistedChatMessages(): ChatMessage[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const persistedConversation = readPersistedConversation();
    if (!persistedConversation) {
      return [];
    }

    const parsedMessages: unknown = JSON.parse(persistedConversation.serializedMessages);
    if (!Array.isArray(parsedMessages)) {
      return [];
    }

    const restoredChatMessages = parsedMessages
      .filter(isPersistedChatMessage)
      .filter((chatMessage) => !chatMessage.isWelcome && chatMessage.content.trim().length > 0)
      .slice(-MAX_PERSISTED_MESSAGE_COUNT)
      .map((chatMessage) => ({
        ...chatMessage,
        status:
          chatMessage.status === 'streaming'
            ? ('cancelled' as const)
            : chatMessage.status === 'complete' ||
                chatMessage.status === 'error' ||
                chatMessage.status === 'cancelled'
              ? chatMessage.status
              : ('complete' as const),
        isWelcome: false,
      }));

    if (persistedConversation.sourceStorageKey !== CHAT_HISTORY_STORAGE_KEY) {
      window.localStorage.setItem(
        CHAT_HISTORY_STORAGE_KEY,
        JSON.stringify(restoredChatMessages),
      );
    }

    return restoredChatMessages;
  } catch {
    return [];
  }
}

export function savePersistedChatMessages(chatMessages: ChatMessage[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  const persistableChatMessages = chatMessages
    .filter((chatMessage) => !chatMessage.isWelcome)
    .filter((chatMessage) => chatMessage.messageKind !== 'daily-quota-notice')
    .filter((chatMessage) => chatMessage.content.trim().length > 0)
    .slice(-MAX_PERSISTED_MESSAGE_COUNT)
    .map((chatMessage) => ({
      ...chatMessage,
      status: chatMessage.status === 'streaming' ? ('cancelled' as const) : chatMessage.status,
    }));

  try {
    window.localStorage.setItem(
      CHAT_HISTORY_STORAGE_KEY,
      JSON.stringify(persistableChatMessages),
    );
  } catch {
    return;
  }
}

export function formatMessageTime(isoTimestamp: string): string {
  const messageDate = new Date(isoTimestamp);
  if (Number.isNaN(messageDate.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(messageDate);
}

export function formatConversationDate(conversationDate = new Date()): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(conversationDate);
}
