// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_HISTORY_STORAGE_KEY,
  LEGACY_CHAT_HISTORY_STORAGE_KEYS,
} from '@/constants/chat';
import { loadPersistedChatMessages } from './chat';

const legacyMessage = {
  id: 'legacy-message-1',
  role: 'user' as const,
  content: '이전 대화를 유지해 주세요.',
  createdAt: '2026-07-10T12:00:00.000Z',
  status: 'complete' as const,
};

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('chat history storage migration', () => {
  it('moves the previous-brand conversation record to the MiniChat key', () => {
    const previousStorageKey = LEGACY_CHAT_HISTORY_STORAGE_KEYS[0];
    window.localStorage.setItem(previousStorageKey, JSON.stringify([legacyMessage]));

    expect(loadPersistedChatMessages()).toEqual([
      expect.objectContaining({
        id: legacyMessage.id,
        content: legacyMessage.content,
        isWelcome: false,
      }),
    ]);
    expect(JSON.parse(window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY) ?? '[]')).toEqual([
      expect.objectContaining({ id: legacyMessage.id, content: legacyMessage.content }),
    ]);
  });

  it('drops an invalid persisted retry flag', () => {
    window.localStorage.setItem(
      CHAT_HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          ...legacyMessage,
          role: 'assistant',
          status: 'error',
          isRetryable: 'yes',
        },
      ]),
    );

    expect(loadPersistedChatMessages()).toEqual([
      expect.objectContaining({ isRetryable: undefined }),
    ]);
  });

  it('prefers the current MiniChat record when both current and legacy keys exist', () => {
    const currentMessage = { ...legacyMessage, id: 'current-message', content: '현재 대화' };
    window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify([currentMessage]));
    window.localStorage.setItem(
      LEGACY_CHAT_HISTORY_STORAGE_KEYS[0],
      JSON.stringify([legacyMessage]),
    );

    expect(loadPersistedChatMessages()).toEqual([
      expect.objectContaining({ id: currentMessage.id, content: currentMessage.content }),
    ]);
  });

  it('bounds persisted content and removes non-persistable message metadata', () => {
    window.localStorage.setItem(
      CHAT_HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          ...legacyMessage,
          id: 'u'.repeat(300),
          content: '가'.repeat(5_000),
          status: 'error',
          progressMessage: '남아 있으면 안 됨',
        },
        {
          ...legacyMessage,
          id: 'assistant-message',
          role: 'assistant',
          content: '나'.repeat(40_000),
          status: 'complete',
          errorCode: 'E'.repeat(200),
          statusMessage: '상'.repeat(1_000),
        },
        {
          ...legacyMessage,
          id: 'quota-message',
          role: 'assistant',
          messageKind: 'daily-quota-notice',
        },
      ]),
    );

    const restoredMessages = loadPersistedChatMessages();

    expect(restoredMessages).toHaveLength(2);
    expect(restoredMessages[0]).toMatchObject({
      role: 'user',
      status: 'complete',
      progressMessage: undefined,
      messageKind: 'standard',
    });
    expect(restoredMessages[0]?.id).toHaveLength(160);
    expect(restoredMessages[0]?.content).toHaveLength(4_000);
    expect(restoredMessages[1]?.content).toHaveLength(32_000);
    expect(restoredMessages[1]?.errorCode).toHaveLength(120);
    expect(restoredMessages[1]?.statusMessage).toHaveLength(600);
  });

  it('repairs duplicate identifiers and invalid timestamps from persisted history', () => {
    window.localStorage.setItem(
      CHAT_HISTORY_STORAGE_KEY,
      JSON.stringify([
        { ...legacyMessage, id: 'duplicate-id', createdAt: 'invalid-date' },
        {
          ...legacyMessage,
          id: 'duplicate-id',
          role: 'assistant',
          content: '중복 식별자 답변',
        },
        { ...legacyMessage, id: '   ', content: '빈 식별자 질문' },
      ]),
    );

    const restoredMessages = loadPersistedChatMessages();
    const restoredIds = restoredMessages.map((chatMessage) => chatMessage.id);

    expect(restoredMessages).toHaveLength(3);
    expect(new Set(restoredIds).size).toBe(restoredIds.length);
    expect(restoredIds.every((messageId) => messageId.trim().length > 0)).toBe(true);
    expect(
      restoredMessages.every(
        (chatMessage) => !Number.isNaN(new Date(chatMessage.createdAt).getTime()),
      ),
    ).toBe(true);
    expect(loadPersistedChatMessages()).toEqual(restoredMessages);
  });

  it('keeps restored messages available when normalized history cannot be written', () => {
    window.localStorage.setItem(
      CHAT_HISTORY_STORAGE_KEY,
      JSON.stringify([{ ...legacyMessage, id: '   ', createdAt: 'invalid-date' }]),
    );
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('storage blocked', 'QuotaExceededError');
      });

    expect(loadPersistedChatMessages()).toEqual([
      expect.objectContaining({
        role: 'user',
        content: legacyMessage.content,
        status: 'complete',
      }),
    ]);
    setItemSpy.mockRestore();
  });

});
