// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
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
});
