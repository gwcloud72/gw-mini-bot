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

function hasCompleteAnimationFrameApi(): boolean {
  return (
    typeof window.requestAnimationFrame === 'function' &&
    typeof window.cancelAnimationFrame === 'function'
  );
}

function applyDocumentMotionPreference(isReducedMotion: boolean): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.motionPreference = isReducedMotion
    ? 'reduced'
    : 'full';
}

function applyDocumentVisibilityState(): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.pageVisibility =
    document.visibilityState === 'hidden' ? 'hidden' : 'visible';
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

  if (
    typeof motionPreferenceQuery.addEventListener === 'function' &&
    typeof motionPreferenceQuery.removeEventListener === 'function'
  ) {
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

export function bindDocumentMotionState(): () => void {
  if (typeof document === 'undefined') {
    return () => undefined;
  }

  applyDocumentMotionPreference(isReducedMotionPreferred());
  applyDocumentVisibilityState();

  const unsubscribeMotionPreference = subscribeToMotionPreference(
    applyDocumentMotionPreference,
  );
  const handleVisibilityChange = () => applyDocumentVisibilityState();
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    unsubscribeMotionPreference();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

export function requestVisualFrame(frameCallback: () => void): number {
  if (hasCompleteAnimationFrameApi()) {
    return window.requestAnimationFrame(frameCallback);
  }

  return window.setTimeout(frameCallback, FRAME_FALLBACK_DELAY_MS);
}

export function cancelVisualFrame(frameId: number): void {
  if (hasCompleteAnimationFrameApi()) {
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
