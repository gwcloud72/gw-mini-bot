import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAT_SKIN_IDS } from '@/types/skin';

interface ImageHarness {
  requestedUrls: string[];
  ImageConstructor: typeof Image;
  emitError: (assetUrl: string) => void;
}

function createImageHarness(): ImageHarness {
  const requestedUrls: string[] = [];
  const imageByUrl = new Map<string, PreloadImage>();

  class PreloadImage {
    decoding = 'auto';
    private readonly listeners = new Map<
      string,
      Set<EventListenerOrEventListenerObject>
    >();

    addEventListener(
      eventName: string,
      listener: EventListenerOrEventListenerObject,
    ): void {
      const eventListeners = this.listeners.get(eventName) ?? new Set();
      eventListeners.add(listener);
      this.listeners.set(eventName, eventListeners);
    }

    emit(eventName: string): void {
      const emittedEvent = { type: eventName } as Event;
      for (const listener of this.listeners.get(eventName) ?? []) {
        if (typeof listener === 'function') {
          listener(emittedEvent);
        } else {
          listener.handleEvent(emittedEvent);
        }
      }
    }

    set src(assetUrl: string) {
      requestedUrls.push(assetUrl);
      imageByUrl.set(assetUrl, this);
    }
  }

  return {
    requestedUrls,
    ImageConstructor: PreloadImage as unknown as typeof Image,
    emitError: (assetUrl) => imageByUrl.get(assetUrl)?.emit('error'),
  };
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('seasonal asset preloading', () => {
  it('loads the active skin immediately and the remaining skins later', async () => {
    const imageHarness = createImageHarness();
    let scheduledPreload: (() => void) | undefined;
    const clearTimeout = vi.fn();
    vi.stubGlobal('Image', imageHarness.ImageConstructor);
    vi.stubGlobal('navigator', {
      connection: { saveData: false, effectiveType: '4g' },
    });
    vi.stubGlobal('window', {
      setTimeout: (callback: () => void) => {
        scheduledPreload = callback;
        return 91;
      },
      clearTimeout,
    });
    const seasonalAssets = await import('./seasonalAssets');

    const cancelPreload = seasonalAssets.scheduleSeasonalAssetPreload('spring');

    expect(imageHarness.requestedUrls).toEqual(
      seasonalAssets.getSeasonalSkinAssetUrls('spring'),
    );

    scheduledPreload?.();

    expect(new Set(imageHarness.requestedUrls).size).toBe(
      CHAT_SKIN_IDS.length * 2,
    );

    cancelPreload();
    expect(clearTimeout).toHaveBeenCalledWith(91);
  });

  it('does not preload inactive skins when data saver is enabled', async () => {
    const imageHarness = createImageHarness();
    const setTimeout = vi.fn(() => 29);
    vi.stubGlobal('Image', imageHarness.ImageConstructor);
    vi.stubGlobal('navigator', {
      connection: { saveData: true, effectiveType: '4g' },
    });
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout: vi.fn(),
    });
    const seasonalAssets = await import('./seasonalAssets');

    seasonalAssets.scheduleSeasonalAssetPreload('winter');

    expect(imageHarness.requestedUrls).toEqual(
      seasonalAssets.getSeasonalSkinAssetUrls('winter'),
    );
    expect(setTimeout).not.toHaveBeenCalled();
  });

  it('allows an asset to be requested again after a preload error', async () => {
    const imageHarness = createImageHarness();
    vi.stubGlobal('Image', imageHarness.ImageConstructor);
    const seasonalAssets = await import('./seasonalAssets');
    const [failedAssetUrl] = seasonalAssets.getSeasonalSkinAssetUrls('autumn');

    seasonalAssets.preloadSeasonalSkinAssets('autumn');
    imageHarness.emitError(failedAssetUrl!);
    seasonalAssets.preloadSeasonalSkinAssets('autumn');

    expect(
      imageHarness.requestedUrls.filter(
        (requestedAssetUrl) => requestedAssetUrl === failedAssetUrl,
      ),
    ).toHaveLength(2);
  });
});
