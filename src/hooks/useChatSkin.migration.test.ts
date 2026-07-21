// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  CHAT_SKIN_STORAGE_KEY,
  LEGACY_AUTO_SAVED_CHAT_SKIN_STORAGE_KEY,
  LEGACY_CHAT_SKIN_STORAGE_KEYS,
} from '@/constants/skins';
import {
  loadInitialChatSkinId,
  loadInitialChatSkinPreference,
} from './useChatSkin';

function createDateForMonth(yearNumber: number, monthNumber: number): Date {
  return new Date(yearNumber, monthNumber - 1, 15, 12);
}

afterEach(() => {
  window.localStorage.clear();
});

describe('chat skin storage migration', () => {
  it('uses automatic seasonal selection when no preference is stored', () => {
    const summerDate = createDateForMonth(2030, 7);

    expect(loadInitialChatSkinPreference()).toEqual({ mode: 'auto' });
    expect(loadInitialChatSkinId(summerDate)).toBe('summer');
  });

  it('restores the current automatic preference format', () => {
    window.localStorage.setItem(
      CHAT_SKIN_STORAGE_KEY,
      JSON.stringify({ mode: 'auto' }),
    );

    expect(loadInitialChatSkinPreference()).toEqual({ mode: 'auto' });
  });

  it('restores the current manual preference format', () => {
    window.localStorage.setItem(
      CHAT_SKIN_STORAGE_KEY,
      JSON.stringify({ mode: 'manual', skinId: 'autumn' }),
    );

    expect(loadInitialChatSkinPreference()).toEqual({
      mode: 'manual',
      skinId: 'autumn',
    });
  });

  it('resets the ambiguous auto-saved legacy value to automatic mode', () => {
    window.localStorage.setItem(
      LEGACY_AUTO_SAVED_CHAT_SKIN_STORAGE_KEY,
      'spring',
    );

    expect(loadInitialChatSkinPreference()).toEqual({ mode: 'auto' });
    expect(loadInitialChatSkinId(createDateForMonth(2030, 7))).toBe('summer');
  });

  it('keeps explicit named legacy choices as manual preferences', () => {
    window.localStorage.setItem(LEGACY_CHAT_SKIN_STORAGE_KEYS[1], 'winter');
    expect(loadInitialChatSkinPreference()).toEqual({
      mode: 'manual',
      skinId: 'winter',
    });

    window.localStorage.clear();
    window.localStorage.setItem(LEGACY_CHAT_SKIN_STORAGE_KEYS[2], 'lilac');
    expect(loadInitialChatSkinPreference()).toEqual({
      mode: 'manual',
      skinId: 'spring',
    });
  });

  it('prefers the current preference key over legacy storage', () => {
    window.localStorage.setItem(
      CHAT_SKIN_STORAGE_KEY,
      JSON.stringify({ mode: 'manual', skinId: 'autumn' }),
    );
    window.localStorage.setItem(LEGACY_CHAT_SKIN_STORAGE_KEYS[1], 'winter');

    expect(loadInitialChatSkinPreference()).toEqual({
      mode: 'manual',
      skinId: 'autumn',
    });
  });
});
