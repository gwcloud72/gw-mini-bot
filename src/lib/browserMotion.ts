export const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

const FRAME_FALLBACK_DELAY_MS = 16;

interface LegacyMotionPreferenceListener {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
}

function getMotionPreferenceQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }

  return window.matchMedia(REDUCED_MOTION_MEDIA_QUERY);
}

export function isReducedMotionPreferred(): boolean {
  return getMotionPreferenceQuery()?.matches ?? false;
}

export function subscribeToMotionPreference(
  onPreferenceChange: (isReducedMotion: boolean) => void,
): () => void {
  const motionPreferenceQuery = getMotionPreferenceQuery();
  if (!motionPreferenceQuery) {
    return () => undefined;
  }

  const handleMotionPreferenceChange = (motionPreferenceEvent: MediaQueryListEvent) => {
    onPreferenceChange(motionPreferenceEvent.matches);
  };

  if (typeof motionPreferenceQuery.addEventListener === 'function') {
    motionPreferenceQuery.addEventListener('change', handleMotionPreferenceChange);
    return () => {
      motionPreferenceQuery.removeEventListener('change', handleMotionPreferenceChange);
    };
  }

  const legacyMotionPreferenceQuery =
    motionPreferenceQuery as MediaQueryList & LegacyMotionPreferenceListener;
  legacyMotionPreferenceQuery.addListener?.(handleMotionPreferenceChange);
  return () => {
    legacyMotionPreferenceQuery.removeListener?.(handleMotionPreferenceChange);
  };
}

export function requestVisualFrame(frameCallback: () => void): number {
  if (typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(frameCallback);
  }

  return window.setTimeout(frameCallback, FRAME_FALLBACK_DELAY_MS);
}

export function cancelVisualFrame(frameId: number): void {
  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
    return;
  }

  window.clearTimeout(frameId);
}

export function getMotionAwareScrollBehavior(
  preferredScrollBehavior: ScrollBehavior,
): ScrollBehavior {
  return isReducedMotionPreferred() ? 'auto' : preferredScrollBehavior;
}
