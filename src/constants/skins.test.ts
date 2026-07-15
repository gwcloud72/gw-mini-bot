import { describe, expect, it } from 'vitest';
import {
  CHAT_SKIN_DEFINITIONS,
  getSeasonalChatSkinId,
  isChatSkinId,
  migrateLegacyChatSkinId,
} from './skins';

describe('seasonal chat skins', () => {
  it.each([
    ['2026-03-01T12:00:00', 'spring'],
    ['2026-06-01T12:00:00', 'summer'],
    ['2026-09-01T12:00:00', 'autumn'],
    ['2026-12-01T12:00:00', 'winter'],
    ['2026-02-28T12:00:00', 'winter'],
  ] as const)('selects the seasonal default for %s', (dateText, expectedSkinId) => {
    expect(getSeasonalChatSkinId(new Date(dateText))).toBe(expectedSkinId);
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
