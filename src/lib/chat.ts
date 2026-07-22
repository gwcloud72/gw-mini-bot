import {
  CHAT_HISTORY_STORAGE_KEY,
  LEGACY_CHAT_HISTORY_STORAGE_KEYS,
  MAX_CONTEXT_MESSAGE_COUNT,
  MAX_MESSAGE_INPUT_LENGTH,
  MAX_PERSISTED_MESSAGE_COUNT,
  MAX_RESPONSE_OUTPUT_LENGTH,
  WELCOME_MESSAGE_TEXT,
} from '@/constants/chat';
import type { ChatMessage, ChatRequestMessage, ChatRole } from '@/types/chat';

const MAX_CONTEXT_CHARACTER_COUNT = 10_000;

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
  messageOptions: Partial<
    Pick<
      ChatMessage,
      | 'status'
      | 'isWelcome'
      | 'errorCode'
      | 'isRetryable'
      | 'statusMessage'
      | 'progressMessage'
      | 'messageKind'
    >
  > = {},
): ChatMessage {
  return {
    id: createChatMessageId(),
    role,
    content,
    createdAt: new Date().toISOString(),
    status: messageOptions.status ?? 'complete',
    isWelcome: messageOptions.isWelcome,
    errorCode: messageOptions.errorCode,
    isRetryable: messageOptions.isRetryable,
    statusMessage: messageOptions.statusMessage,
    progressMessage: messageOptions.progressMessage,
    messageKind: messageOptions.messageKind ?? 'standard',
  };
}

export function createWelcomeChatMessage(): ChatMessage {
  return createChatMessage('assistant', WELCOME_MESSAGE_TEXT, { isWelcome: true });
}

function collectContextMessages(chatMessages: ChatMessage[]): ChatMessage[] {
  const contextMessages: ChatMessage[] = [];

  for (const chatMessage of chatMessages) {
    if (chatMessage.isWelcome || chatMessage.content.trim().length === 0) {
      continue;
    }

    if (
      chatMessage.role === 'assistant' &&
      (chatMessage.status === 'error' ||
        chatMessage.status === 'cancelled' ||
        chatMessage.messageKind === 'daily-quota-notice')
    ) {
      if (contextMessages.at(-1)?.role === 'user') {
        contextMessages.pop();
      }
      continue;
    }

    if (chatMessage.role === 'user') {
      if (contextMessages.at(-1)?.role === 'user') {
        contextMessages.pop();
      }
      contextMessages.push(chatMessage);
      continue;
    }

    if (contextMessages.at(-1)?.role === 'user') {
      contextMessages.push(chatMessage);
    }
  }

  return contextMessages;
}

export function toChatRequestMessages(chatMessages: ChatMessage[]): ChatRequestMessage[] {
  const eligibleMessages = collectContextMessages(chatMessages).slice(
    -MAX_CONTEXT_MESSAGE_COUNT,
  );
  const selectedMessages: ChatRequestMessage[] = [];
  let selectedCharacterCount = 0;

  for (let messageIndex = eligibleMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const chatMessage = eligibleMessages[messageIndex];
    if (!chatMessage) {
      continue;
    }

    const normalizedContent = chatMessage.content
      .trim()
      .slice(0, MAX_MESSAGE_INPUT_LENGTH);
    const nextCharacterCount = selectedCharacterCount + normalizedContent.length;

    if (
      selectedMessages.length > 0 &&
      nextCharacterCount > MAX_CONTEXT_CHARACTER_COUNT
    ) {
      break;
    }

    selectedMessages.push({ role: chatMessage.role, content: normalizedContent });
    selectedCharacterCount = nextCharacterCount;
  }

  const normalizedRequestMessages = selectedMessages.reverse();
  while (normalizedRequestMessages.at(0)?.role === 'assistant') {
    normalizedRequestMessages.shift();
  }

  return normalizedRequestMessages;
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

function normalizeOptionalText(
  candidateValue: unknown,
  maximumLength: number,
): string | undefined {
  return typeof candidateValue === 'string'
    ? candidateValue.slice(0, maximumLength)
    : undefined;
}

function createUniquePersistedMessageId(
  candidateId: string,
  usedMessageIds: Set<string>,
): string {
  let normalizedId = candidateId.trim().slice(0, 160);

  while (!normalizedId || usedMessageIds.has(normalizedId)) {
    normalizedId = createChatMessageId();
  }

  usedMessageIds.add(normalizedId);
  return normalizedId;
}

function normalizePersistedTimestamp(candidateTimestamp: string): string {
  const parsedTimestamp = new Date(candidateTimestamp);
  return Number.isNaN(parsedTimestamp.getTime())
    ? new Date().toISOString()
    : parsedTimestamp.toISOString();
}

function normalizePersistedChatMessage(
  chatMessage: ChatMessage,
  usedMessageIds: Set<string>,
): ChatMessage {
  const normalizedStatus =
    chatMessage.role === 'user'
      ? ('complete' as const)
      : chatMessage.status === 'streaming'
        ? ('cancelled' as const)
        : chatMessage.status === 'complete' ||
            chatMessage.status === 'error' ||
            chatMessage.status === 'cancelled'
          ? chatMessage.status
          : ('complete' as const);
  const maximumContentLength =
    chatMessage.role === 'user'
      ? MAX_MESSAGE_INPUT_LENGTH
      : MAX_RESPONSE_OUTPUT_LENGTH;

  return {
    id: createUniquePersistedMessageId(chatMessage.id, usedMessageIds),
    role: chatMessage.role,
    content: chatMessage.content.slice(0, maximumContentLength),
    createdAt: normalizePersistedTimestamp(chatMessage.createdAt),
    status: normalizedStatus,
    isWelcome: false,
    errorCode: normalizeOptionalText(chatMessage.errorCode, 120),
    isRetryable:
      typeof chatMessage.isRetryable === 'boolean'
        ? chatMessage.isRetryable
        : undefined,
    statusMessage: normalizeOptionalText(chatMessage.statusMessage, 600),
    progressMessage: undefined,
    messageKind: 'standard',
  };
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

    const usedMessageIds = new Set<string>();
    const restoredChatMessages = parsedMessages
      .filter(isPersistedChatMessage)
      .filter(
        (chatMessage) =>
          !chatMessage.isWelcome &&
          chatMessage.messageKind !== 'daily-quota-notice' &&
          chatMessage.content.trim().length > 0,
      )
      .slice(-MAX_PERSISTED_MESSAGE_COUNT)
      .map((chatMessage) =>
        normalizePersistedChatMessage(chatMessage, usedMessageIds),
      );

    const normalizedConversation = JSON.stringify(restoredChatMessages);
    if (
      persistedConversation.sourceStorageKey !== CHAT_HISTORY_STORAGE_KEY ||
      normalizedConversation !== persistedConversation.serializedMessages
    ) {
      try {
        window.localStorage.setItem(
          CHAT_HISTORY_STORAGE_KEY,
          normalizedConversation,
        );
      } catch {
        return restoredChatMessages;
      }
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

export function getConversationDateKey(isoTimestamp: string): string {
  const messageDate = new Date(isoTimestamp);
  if (Number.isNaN(messageDate.getTime())) {
    return '';
  }

  return [
    messageDate.getFullYear(),
    String(messageDate.getMonth() + 1).padStart(2, '0'),
    String(messageDate.getDate()).padStart(2, '0'),
  ].join('-');
}

export function formatConversationDate(conversationDate = new Date()): string {
  if (Number.isNaN(conversationDate.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(conversationDate);
}
