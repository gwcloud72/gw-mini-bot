import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelVisualFrame,
  getMotionAwareScrollBehavior,
  isReducedMotionPreferred,
  requestVisualFrame,
  subscribeToMotionPreference,
} from './browserMotion';

interface MotionQueryHarness {
  mediaQueryList: MediaQueryList;
  emitChange: (matches: boolean) => void;
  getListenerCount: () => number;
}

function createMotionQueryHarness(
  initialMatches: boolean,
  listenerMode: 'modern' | 'legacy',
): MotionQueryHarness {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let currentMatches = initialMatches;
  const mediaQueryList = {
    get matches() {
      return currentMatches;
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener:
      listenerMode === 'modern'
        ? (_eventName: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.add(listener);
          }
        : undefined,
    removeEventListener:
      listenerMode === 'modern'
        ? (_eventName: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.delete(listener);
          }
        : undefined,
    addListener:
      listenerMode === 'legacy'
        ? (listener: (event: MediaQueryListEvent) => void) => {
            listeners.add(listener);
          }
        : undefined,
    removeListener:
      listenerMode === 'legacy'
        ? (listener: (event: MediaQueryListEvent) => void) => {
            listeners.delete(listener);
          }
        : undefined,
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;

  return {
    mediaQueryList,
    emitChange: (matches) => {
      currentMatches = matches;
      const motionPreferenceEvent = { matches } as MediaQueryListEvent;
      for (const listener of listeners) {
        listener(motionPreferenceEvent);
      }
    },
    getListenerCount: () => listeners.size,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser motion compatibility', () => {
  it('uses the modern media query listener and removes it cleanly', () => {
    const motionQueryHarness = createMotionQueryHarness(false, 'modern');
    vi.stubGlobal('window', {
      matchMedia: () => motionQueryHarness.mediaQueryList,
    });
    const receivedPreferences: boolean[] = [];

    const unsubscribe = subscribeToMotionPreference((isReducedMotion) => {
      receivedPreferences.push(isReducedMotion);
    });
    motionQueryHarness.emitChange(true);
    unsubscribe();
    motionQueryHarness.emitChange(false);

    expect(receivedPreferences).toEqual([true]);
    expect(motionQueryHarness.getListenerCount()).toBe(0);
  });

  it('falls back to the legacy Safari media query listener', () => {
    const motionQueryHarness = createMotionQueryHarness(false, 'legacy');
    vi.stubGlobal('window', {
      matchMedia: () => motionQueryHarness.mediaQueryList,
    });
    const receivedPreferences: boolean[] = [];

    const unsubscribe = subscribeToMotionPreference((isReducedMotion) => {
      receivedPreferences.push(isReducedMotion);
    });
    motionQueryHarness.emitChange(true);
    unsubscribe();

    expect(receivedPreferences).toEqual([true]);
    expect(motionQueryHarness.getListenerCount()).toBe(0);
  });

  it('uses requestAnimationFrame when the browser provides it', () => {
    const requestAnimationFrame = vi.fn((frameCallback: () => void) => {
      void frameCallback;
      return 41;
    });
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('window', {
      requestAnimationFrame,
      cancelAnimationFrame,
    });

    const frameId = requestVisualFrame(() => undefined);
    cancelVisualFrame(frameId);

    expect(frameId).toBe(41);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(41);
  });

  it('falls back to a timer when requestAnimationFrame is unavailable', () => {
    const setTimeout = vi.fn((frameCallback: () => void) => {
      void frameCallback;
      return 17;
    });
    const clearTimeout = vi.fn();
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
    });

    const frameId = requestVisualFrame(() => undefined);
    cancelVisualFrame(frameId);

    expect(frameId).toBe(17);
    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(clearTimeout).toHaveBeenCalledWith(17);
  });

  it('disables smooth scrolling when reduced motion is enabled', () => {
    const motionQueryHarness = createMotionQueryHarness(true, 'modern');
    vi.stubGlobal('window', {
      matchMedia: () => motionQueryHarness.mediaQueryList,
    });

    expect(isReducedMotionPreferred()).toBe(true);
    expect(getMotionAwareScrollBehavior('smooth')).toBe('auto');
  });
});
