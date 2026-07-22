import autumnAvatarUrl from '@/assets/seasons/autumn-avatar.png';
import autumnCharacterUrl from '@/assets/seasons/autumn-character.png';
import springAvatarUrl from '@/assets/seasons/spring-avatar.png';
import springCharacterUrl from '@/assets/seasons/spring-character.png';
import summerAvatarUrl from '@/assets/seasons/summer-avatar.png';
import summerCharacterUrl from '@/assets/seasons/summer-character.png';
import winterAvatarUrl from '@/assets/seasons/winter-avatar.png';
import winterCharacterUrl from '@/assets/seasons/winter-character.png';
import type { ChatSkinId } from '@/types/skin';

const SEASONAL_ASSET_URLS: Readonly<Record<ChatSkinId, readonly string[]>> = {
  spring: [springAvatarUrl, springCharacterUrl],
  summer: [summerAvatarUrl, summerCharacterUrl],
  autumn: [autumnAvatarUrl, autumnCharacterUrl],
  winter: [winterAvatarUrl, winterCharacterUrl],
};
const requestedAssetUrls = new Set<string>();
const loadingImages = new Map<string, HTMLImageElement>();

function requestImageAsset(assetUrl: string): void {
  if (requestedAssetUrls.has(assetUrl) || typeof Image !== 'function') {
    return;
  }

  requestedAssetUrls.add(assetUrl);
  const preloadImage = new Image();
  const handleImageLoad = () => loadingImages.delete(assetUrl);
  const handleImageError = () => {
    loadingImages.delete(assetUrl);
    requestedAssetUrls.delete(assetUrl);
  };
  preloadImage.decoding = 'async';
  preloadImage.addEventListener('load', handleImageLoad, { once: true });
  preloadImage.addEventListener('error', handleImageError, { once: true });
  loadingImages.set(assetUrl, preloadImage);
  preloadImage.src = assetUrl;
}

export function getSeasonalSkinAssetUrls(
  skinId: ChatSkinId,
): readonly string[] {
  return SEASONAL_ASSET_URLS[skinId];
}

export function preloadSeasonalSkinAssets(skinId: ChatSkinId): void {
  for (const assetUrl of getSeasonalSkinAssetUrls(skinId)) {
    requestImageAsset(assetUrl);
  }
}

export function scheduleSeasonalAssetPreload(
  activeSkinId: ChatSkinId,
): () => void {
  preloadSeasonalSkinAssets(activeSkinId);
  return () => undefined;
}
