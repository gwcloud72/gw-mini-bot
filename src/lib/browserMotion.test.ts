import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindDocumentMotionState,
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

interface VisibilityHarness {
  documentValue: Document;
  setVisibility: (visibilityState: DocumentVisibilityState) => void;
  emitVisibilityChange: () => void;
  getListenerCount: () => number;
  dataset: DOMStringMap;
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

function createVisibilityHarness(
  initialVisibilityState: DocumentVisibilityState,
): VisibilityHarness {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  let currentVisibilityState = initialVisibilityState;
  const dataset = {} as DOMStringMap;
  const documentValue = {
    documentElement: { dataset },
    get visibilityState() {
      return currentVisibilityState;
    },
    addEventListener: (
      eventName: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (eventName === 'visibilitychange') {
        listeners.add(listener);
      }
    },
    removeEventListener: (
      eventName: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (eventName === 'visibilitychange') {
        listeners.delete(listener);
      }
    },
  } as unknown as Document;

  return {
    documentValue,
    setVisibility: (visibilityState) => {
      currentVisibilityState = visibilityState;
    },
    emitVisibilityChange: () => {
      const visibilityEvent = { type: 'visibilitychange' } as Event;
      for (const listener of listeners) {
        if (typeof listener === 'function') {
          listener(visibilityEvent);
        } else {
          listener.handleEvent(visibilityEvent);
        }
      }
    },
    getListenerCount: () => listeners.size,
    dataset,
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

  it('keeps document motion and page visibility attributes synchronized', () => {
    const motionQueryHarness = createMotionQueryHarness(false, 'modern');
    const visibilityHarness = createVisibilityHarness('visible');
    vi.stubGlobal('window', {
      matchMedia: () => motionQueryHarness.mediaQueryList,
    });
    vi.stubGlobal('document', visibilityHarness.documentValue);

    const releaseMotionState = bindDocumentMotionState();

    expect(visibilityHarness.dataset.motionPreference).toBe('full');
    expect(visibilityHarness.dataset.pageVisibility).toBe('visible');

    motionQueryHarness.emitChange(true);
    visibilityHarness.setVisibility('hidden');
    visibilityHarness.emitVisibilityChange();

    expect(visibilityHarness.dataset.motionPreference).toBe('reduced');
    expect(visibilityHarness.dataset.pageVisibility).toBe('hidden');

    releaseMotionState();

    expect(motionQueryHarness.getListenerCount()).toBe(0);
    expect(visibilityHarness.getListenerCount()).toBe(0);
  });

  it('uses requestAnimationFrame when both frame APIs are available', () => {
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

  it('uses the timer fallback when frame cancellation is unavailable', () => {
    const requestAnimationFrame = vi.fn(() => 41);
    const setTimeout = vi.fn(() => 23);
    const clearTimeout = vi.fn();
    vi.stubGlobal('window', {
      requestAnimationFrame,
      setTimeout,
      clearTimeout,
    });

    const frameId = requestVisualFrame(() => undefined);
    cancelVisualFrame(frameId);

    expect(frameId).toBe(23);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(clearTimeout).toHaveBeenCalledWith(23);
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
