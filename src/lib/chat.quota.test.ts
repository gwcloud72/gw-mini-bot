// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { CHAT_HISTORY_STORAGE_KEY } from '@/constants/chat';
import {
  createChatMessage,
  savePersistedChatMessages,
  toChatRequestMessages,
} from './chat';

afterEach(() => {
  window.localStorage.clear();
});

describe('daily quota notice handling', () => {
  it('keeps the operational notice out of model context', () => {
    const userMessage = createChatMessage('user', '실제 질문');
    const assistantMessage = createChatMessage('assistant', '실제 답변');
    const quotaNotice = createChatMessage('assistant', '오늘은 여기까지예요.', {
      messageKind: 'daily-quota-notice',
    });

    expect(
      toChatRequestMessages([userMessage, assistantMessage, quotaNotice]),
    ).toEqual([
      { role: 'user', content: '실제 질문' },
      { role: 'assistant', content: '실제 답변' },
    ]);
  });

  it('does not persist the temporary quota notice in conversation history', () => {
    const userMessage = createChatMessage('user', '저장할 질문');
    const quotaNotice = createChatMessage('assistant', '자정 이후 다시 이용해 주세요.', {
      messageKind: 'daily-quota-notice',
    });

    savePersistedChatMessages([userMessage, quotaNotice]);

    expect(
      JSON.parse(window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY) ?? '[]'),
    ).toEqual([expect.objectContaining({ content: '저장할 질문' })]);
  });
});
