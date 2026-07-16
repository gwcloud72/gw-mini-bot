import { describe, expect, it } from 'vitest';
import { createChatMessage, toChatRequestMessages } from './chat';

describe('toChatRequestMessages', () => {
  it('keeps the newest conversation context within the character budget', () => {
    const requestMessages = toChatRequestMessages([
      createChatMessage('user', '가'.repeat(4_000)),
      createChatMessage('assistant', '나'.repeat(4_000)),
      createChatMessage('user', '다'.repeat(4_000)),
      createChatMessage('assistant', '라'.repeat(4_000)),
      createChatMessage('user', '최근 질문'),
    ]);

    expect(requestMessages).toHaveLength(3);
    expect(requestMessages[0]).toEqual({
      role: 'user',
      content: '다'.repeat(4_000),
    });
    expect(requestMessages[1]).toEqual({
      role: 'assistant',
      content: '라'.repeat(4_000),
    });
    expect(requestMessages[2]).toEqual({ role: 'user', content: '최근 질문' });
  });

  it('clips a long assistant answer to the Worker message limit', () => {
    const requestMessages = toChatRequestMessages([
      createChatMessage('user', '첫 질문'),
      createChatMessage('assistant', '가'.repeat(8_000)),
      createChatMessage('user', '이어지는 질문'),
    ]);

    expect(requestMessages[1]).toEqual({
      role: 'assistant',
      content: '가'.repeat(4_000),
    });
  });
});
