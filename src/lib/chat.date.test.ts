import { describe, expect, it } from 'vitest';
import { formatConversationDate, getConversationDateKey } from './chat';

describe('conversation date formatting', () => {
  it('formats a conversation date without a hardcoded year', () => {
    const formattedDate = formatConversationDate(
      new Date('2031-07-21T12:00:00'),
    );

    expect(formattedDate).toContain('7월');
    expect(formattedDate).toContain('21일');
    expect(formattedDate).not.toContain('2031');
  });

  it('creates a stable local date key for message grouping', () => {
    expect(getConversationDateKey(new Date(2031, 6, 21, 12).toISOString())).toBe(
      '2031-07-21',
    );
  });

  it('returns an empty label for an invalid date', () => {
    expect(formatConversationDate(new Date('invalid'))).toBe('');
    expect(getConversationDateKey('invalid')).toBe('');
  });
});
