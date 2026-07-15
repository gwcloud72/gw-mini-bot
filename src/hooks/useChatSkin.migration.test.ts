// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  CHAT_SKIN_STORAGE_KEY,
  LEGACY_CHAT_SKIN_STORAGE_KEYS,
} from '@/constants/skins';
import { loadInitialChatSkinId } from './useChatSkin';

afterEach(() => {
  window.localStorage.clear();
});

describe('chat skin storage migration', () => {
  it('reads the seasonal ID saved by the immediately previous release', () => {
    window.localStorage.setItem(LEGACY_CHAT_SKIN_STORAGE_KEYS[0], 'winter');

    expect(loadInitialChatSkinId()).toBe('winter');
  });

  it('maps the oldest named skin while preferring the current MiniChat key', () => {
    window.localStorage.setItem(LEGACY_CHAT_SKIN_STORAGE_KEYS[1], 'lilac');
    expect(loadInitialChatSkinId()).toBe('spring');

    window.localStorage.setItem(CHAT_SKIN_STORAGE_KEY, 'autumn');
    expect(loadInitialChatSkinId()).toBe('autumn');
  });
});
