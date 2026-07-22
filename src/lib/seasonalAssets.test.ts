import { afterEach, describe, expect, it, vi } from 'vitest';

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
  it('loads only the active skin during application startup', async () => {
    const imageHarness = createImageHarness();
    vi.stubGlobal('Image', imageHarness.ImageConstructor);
    const seasonalAssets = await import('./seasonalAssets');

    const cancelPreload = seasonalAssets.scheduleSeasonalAssetPreload('spring');

    expect(imageHarness.requestedUrls).toEqual(
      seasonalAssets.getSeasonalSkinAssetUrls('spring'),
    );
    cancelPreload();
  });

  it('loads another skin when it is explicitly requested', async () => {
    const imageHarness = createImageHarness();
    vi.stubGlobal('Image', imageHarness.ImageConstructor);
    const seasonalAssets = await import('./seasonalAssets');

    seasonalAssets.scheduleSeasonalAssetPreload('winter');
    seasonalAssets.preloadSeasonalSkinAssets('summer');

    expect(new Set(imageHarness.requestedUrls)).toEqual(
      new Set([
        ...seasonalAssets.getSeasonalSkinAssetUrls('winter'),
        ...seasonalAssets.getSeasonalSkinAssetUrls('summer'),
      ]),
    );
  });

  it('allows an asset to be requested again after a preload error', async () => {
    const imageHarness = createImageHarness();
    vi.stubGlobal('Image', imageHarness.ImageConstructor);
    const seasonalAssets = await import('./seasonalAssets');
    const [failedAssetUrl] = seasonalAssets.getSeasonalSkinAssetUrls('autumn');

    seasonalAssets.preloadSeasonalSkinAssets('autumn');
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
