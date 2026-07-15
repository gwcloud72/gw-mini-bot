import { useCallback, useEffect, useState } from 'react';
import {
  CHAT_SKIN_STORAGE_KEY,
  LEGACY_CHAT_SKIN_STORAGE_KEYS,
  getChatSkinDefinition,
  getSeasonalChatSkinId,
  isChatSkinId,
  migrateLegacyChatSkinId,
} from '@/constants/skins';
import type { ChatSkinId } from '@/types/skin';

function readStoredChatSkinId(): ChatSkinId | null {
  const storedSkinId = window.localStorage.getItem(CHAT_SKIN_STORAGE_KEY);

  if (isChatSkinId(storedSkinId)) {
    return storedSkinId;
  }

  for (const legacyStorageKey of LEGACY_CHAT_SKIN_STORAGE_KEYS) {
    const legacyStoredSkinId = window.localStorage.getItem(legacyStorageKey);

    if (isChatSkinId(legacyStoredSkinId)) {
      return legacyStoredSkinId;
    }

    const migratedSkinId = migrateLegacyChatSkinId(legacyStoredSkinId);
    if (migratedSkinId) {
      return migratedSkinId;
    }
  }

  return null;
}

export function loadInitialChatSkinId(): ChatSkinId {
  if (typeof window === 'undefined') {
    return getSeasonalChatSkinId();
  }

  try {
    return readStoredChatSkinId() ?? getSeasonalChatSkinId();
  } catch {
    return getSeasonalChatSkinId();
  }
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

export function useChatSkin() {
  const [activeSkinId, setActiveSkinIdState] = useState<ChatSkinId>(
    loadInitialChatSkinId,
  );

  useEffect(() => {
    applyChatSkinToDocument(activeSkinId);

    try {
      window.localStorage.setItem(CHAT_SKIN_STORAGE_KEY, activeSkinId);
      for (const legacyStorageKey of LEGACY_CHAT_SKIN_STORAGE_KEYS) {
        window.localStorage.removeItem(legacyStorageKey);
      }
    } catch {
      return;
    }
  }, [activeSkinId]);

  const setActiveSkinId = useCallback((nextSkinId: ChatSkinId) => {
    setActiveSkinIdState(nextSkinId);
  }, []);

  return { activeSkinId, setActiveSkinId };
}
