import { describe, expect, it } from 'vitest';
import { takeLeadingGraphemes } from './grapheme';

describe('takeLeadingGraphemes', () => {
  it('does not split a joined emoji sequence', () => {
    const familyEmoji = '👨‍👩‍👧‍👦';
    const [leadingText, remainingText] = takeLeadingGraphemes(
      `${familyEmoji}${familyEmoji}끝`,
      1,
    );

    expect(leadingText).toBe(familyEmoji);
    expect(remainingText).toBe(`${familyEmoji}끝`);
  });

  it('returns the whole string when the requested count is larger', () => {
    expect(takeLeadingGraphemes('안녕하세요', 20)).toEqual([
      '안녕하세요',
      '',
    ]);
  });
});
