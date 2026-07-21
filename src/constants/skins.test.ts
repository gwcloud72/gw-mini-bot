import { describe, expect, it } from 'vitest';
import {
  CHAT_SKIN_DEFINITIONS,
  getChatSkinPeriodLabel,
  getSeasonalChatSkinId,
  isChatSkinId,
  migrateLegacyChatSkinId,
  resolveChatSkinPreference,
} from './skins';

function createDateForMonth(yearNumber: number, monthNumber: number): Date {
  return new Date(yearNumber, monthNumber - 1, 15, 12);
}

describe('seasonal chat skins', () => {
  it.each([
    [2024, 1, 'winter'],
    [2025, 3, 'spring'],
    [2027, 6, 'summer'],
    [2029, 9, 'autumn'],
    [2031, 12, 'winter'],
  ] as const)(
    'selects %s-%s as %s without depending on a fixed year',
    (yearNumber, monthNumber, expectedSkinId) => {
      expect(
        getSeasonalChatSkinId(
          createDateForMonth(yearNumber, monthNumber),
        ),
      ).toBe(expectedSkinId);
    },
  );

  it('maps every calendar month to one seasonal skin', () => {
    const monthlySkinIds = Array.from({ length: 12 }, (_, monthIndex) =>
      getSeasonalChatSkinId(createDateForMonth(2033, monthIndex + 1)),
    );

    expect(monthlySkinIds).toEqual([
      'winter',
      'winter',
      'spring',
      'spring',
      'spring',
      'summer',
      'summer',
      'summer',
      'autumn',
      'autumn',
      'autumn',
      'winter',
    ]);
  });

  it('derives every displayed period from the same month range', () => {
    expect(
      CHAT_SKIN_DEFINITIONS.map((skinDefinition) =>
        getChatSkinPeriodLabel(skinDefinition),
      ),
    ).toEqual(['3–5월', '6–8월', '9–11월', '12–2월']);
  });

  it('resolves automatic and manual preferences independently', () => {
    const summerDate = createDateForMonth(2035, 7);

    expect(resolveChatSkinPreference({ mode: 'auto' }, summerDate)).toBe(
      'summer',
    );
    expect(
      resolveChatSkinPreference(
        { mode: 'manual', skinId: 'winter' },
        summerDate,
      ),
    ).toBe('winter');
  });

  it('keeps every public skin identifier unique', () => {
    const skinIds = CHAT_SKIN_DEFINITIONS.map(
      (skinDefinition) => skinDefinition.id,
    );

    expect(new Set(skinIds).size).toBe(skinIds.length);
    expect(skinIds.every(isChatSkinId)).toBe(true);
  });

  it('migrates the three legacy skins to the closest season', () => {
    expect(migrateLegacyChatSkinId('apricot')).toBe('autumn');
    expect(migrateLegacyChatSkinId('lilac')).toBe('spring');
    expect(migrateLegacyChatSkinId('forest')).toBe('summer');
    expect(migrateLegacyChatSkinId('unknown')).toBeNull();
  });
});
