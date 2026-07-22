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

  it('removes a failed turn before sending the next user question', () => {
    const requestMessages = toChatRequestMessages([
      createChatMessage('user', '실패한 질문'),
      createChatMessage('assistant', '답변 서버가 잠시 응답하지 않습니다.', {
        status: 'error',
        errorCode: 'MODEL_UNAVAILABLE',
      }),
      createChatMessage('user', '새로운 질문'),
    ]);

    expect(requestMessages).toEqual([
      { role: 'user', content: '새로운 질문' },
    ]);
  });

  it('removes a quota-rejected turn before a later question', () => {
    const requestMessages = toChatRequestMessages([
      createChatMessage('user', '횟수 제한에 걸린 질문'),
      createChatMessage('assistant', '오늘 이용 가능한 횟수를 모두 사용했어요.', {
        status: 'error',
        errorCode: 'DAILY_QUOTA_EXCEEDED',
        messageKind: 'daily-quota-notice',
      }),
      createChatMessage('assistant', '한국 시간 자정부터 다시 대화할 수 있어요.', {
        messageKind: 'daily-quota-notice',
      }),
      createChatMessage('user', '다음 날 질문'),
    ]);

    expect(requestMessages).toEqual([{ role: 'user', content: '다음 날 질문' }]);
  });

  it('removes a cancelled turn before sending the next user question', () => {
    const requestMessages = toChatRequestMessages([
      createChatMessage('user', '중단한 질문'),
      createChatMessage('assistant', '답변 생성을 중단했어요.', {
        status: 'cancelled',
      }),
      createChatMessage('user', '다음 질문'),
    ]);

    expect(requestMessages).toEqual([{ role: 'user', content: '다음 질문' }]);
  });

  it('keeps the user question when retrying without the failed assistant message', () => {
    const requestMessages = toChatRequestMessages([
      createChatMessage('user', '다시 답변받을 질문'),
    ]);

    expect(requestMessages).toEqual([
      { role: 'user', content: '다시 답변받을 질문' },
    ]);
  });

  it('keeps only the newest unpaired user message', () => {
    const requestMessages = toChatRequestMessages([
      createChatMessage('user', '오래된 미완료 질문'),
      createChatMessage('user', '가장 최근 질문'),
    ]);

    expect(requestMessages).toEqual([
      { role: 'user', content: '가장 최근 질문' },
    ]);
  });
});
