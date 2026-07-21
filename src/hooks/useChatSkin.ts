import { useCallback, useEffect, useState } from 'react';
import {
  CHAT_SKIN_STORAGE_KEY,
  LEGACY_AUTO_SAVED_CHAT_SKIN_STORAGE_KEY,
  LEGACY_CHAT_SKIN_STORAGE_KEYS,
  createManualChatSkinPreference,
  getChatSkinDefinition,
  isChatSkinId,
  isChatSkinPreference,
  migrateLegacyChatSkinId,
  resolveChatSkinPreference,
} from '@/constants/skins';
import {
  preloadSeasonalSkinAssets,
  scheduleSeasonalAssetPreload,
} from '@/lib/seasonalAssets';
import type { ChatSkinId, ChatSkinPreference } from '@/types/skin';

function parseStoredChatSkinPreference(
  storedValue: string,
): ChatSkinPreference | null {
  try {
    const parsedValue: unknown = JSON.parse(storedValue);

    if (isChatSkinPreference(parsedValue)) {
      return parsedValue;
    }
  } catch {
    return null;
  }

  return null;
}

function readStoredChatSkinPreference(): ChatSkinPreference | null {
  const currentStoredValue = window.localStorage.getItem(CHAT_SKIN_STORAGE_KEY);
  if (currentStoredValue) {
    const currentPreference = parseStoredChatSkinPreference(currentStoredValue);
    if (currentPreference) {
      return currentPreference;
    }
  }

  for (const legacyStorageKey of LEGACY_CHAT_SKIN_STORAGE_KEYS) {
    const legacyStoredValue = window.localStorage.getItem(legacyStorageKey);
    if (!legacyStoredValue) {
      continue;
    }

    if (legacyStorageKey === LEGACY_AUTO_SAVED_CHAT_SKIN_STORAGE_KEY) {
      return { mode: 'auto' };
    }

    if (isChatSkinId(legacyStoredValue)) {
      return createManualChatSkinPreference(legacyStoredValue);
    }

    const migratedSkinId = migrateLegacyChatSkinId(legacyStoredValue);
    if (migratedSkinId) {
      return createManualChatSkinPreference(migratedSkinId);
    }
  }

  return null;
}

export function loadInitialChatSkinPreference(): ChatSkinPreference {
  if (typeof window === 'undefined') {
    return { mode: 'auto' };
  }

  try {
    return readStoredChatSkinPreference() ?? { mode: 'auto' };
  } catch {
    return { mode: 'auto' };
  }
}

export function loadInitialChatSkinId(referenceDate = new Date()): ChatSkinId {
  return resolveChatSkinPreference(
    loadInitialChatSkinPreference(),
    referenceDate,
  );
}

function applyChatSkinToDocument(activeSkinId: ChatSkinId): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.skin = activeSkinId;
  const themeColorMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  themeColorMeta?.setAttribute(
    'content',
    getChatSkinDefinition(activeSkinId).themeColor,
  );
}

function getMillisecondsUntilNextLocalMidnight(
  referenceDate = new Date(),
): number {
  const nextLocalMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() + 1,
  );

  return Math.max(
    1_000,
    nextLocalMidnight.getTime() - referenceDate.getTime() + 100,
  );
}

export function useChatSkin() {
  const [skinPreference, setSkinPreference] = useState<ChatSkinPreference>(
    loadInitialChatSkinPreference,
  );
  const [automaticSkinReferenceTimestamp, setAutomaticSkinReferenceTimestamp] =
    useState(() => Date.now());
  const activeSkinId = resolveChatSkinPreference(
    skinPreference,
    new Date(automaticSkinReferenceTimestamp),
  );
  const isAutomaticSkin = skinPreference.mode === 'auto';

  useEffect(() => scheduleSeasonalAssetPreload(activeSkinId), [activeSkinId]);

  useEffect(() => {
    applyChatSkinToDocument(activeSkinId);

    try {
      window.localStorage.setItem(
        CHAT_SKIN_STORAGE_KEY,
        JSON.stringify(skinPreference),
      );
      for (const legacyStorageKey of LEGACY_CHAT_SKIN_STORAGE_KEYS) {
        window.localStorage.removeItem(legacyStorageKey);
      }
    } catch {
      return;
    }
  }, [activeSkinId, skinPreference]);

  useEffect(() => {
    if (!isAutomaticSkin) {
      return undefined;
    }

    let nextMidnightTimeoutId: number | undefined;

    const scheduleNextLocalMidnightRefresh = () => {
      if (nextMidnightTimeoutId !== undefined) {
        window.clearTimeout(nextMidnightTimeoutId);
      }

      nextMidnightTimeoutId = window.setTimeout(() => {
        setAutomaticSkinReferenceTimestamp(Date.now());
        scheduleNextLocalMidnightRefresh();
      }, getMillisecondsUntilNextLocalMidnight());
    };

    const refreshAutomaticSkin = () => {
      setAutomaticSkinReferenceTimestamp(Date.now());
      scheduleNextLocalMidnightRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshAutomaticSkin();
      }
    };

    scheduleNextLocalMidnightRefresh();
    window.addEventListener('focus', refreshAutomaticSkin);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (nextMidnightTimeoutId !== undefined) {
        window.clearTimeout(nextMidnightTimeoutId);
      }
      window.removeEventListener('focus', refreshAutomaticSkin);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAutomaticSkin]);

  const setActiveSkinId = useCallback((nextSkinId: ChatSkinId) => {
    preloadSeasonalSkinAssets(nextSkinId);
    setSkinPreference(createManualChatSkinPreference(nextSkinId));
  }, []);

  const setAutomaticSkin = useCallback(() => {
    const currentTimestamp = Date.now();
    preloadSeasonalSkinAssets(
      resolveChatSkinPreference({ mode: 'auto' }, new Date(currentTimestamp)),
    );
    setAutomaticSkinReferenceTimestamp(currentTimestamp);
    setSkinPreference({ mode: 'auto' });
  }, []);

  return {
    activeSkinId,
    isAutomaticSkin,
    setActiveSkinId,
    setAutomaticSkin,
  };
}
