import {
  cancelVisualFrame,
  isReducedMotionPreferred,
  requestVisualFrame,
} from './browserMotion';
import { takeLeadingGraphemes } from './grapheme';

interface FrameScheduler {
  requestFrame: (frameCallback: () => void) => number;
  cancelFrame: (frameId: number) => void;
}

interface StreamingTextPresenterOptions {
  shouldAnimate?: () => boolean;
}

interface StreamingTextPresenter {
  enqueueText: (textChunk: string) => void;
  finishText: () => Promise<void>;
  dispose: () => void;
}

const SMALL_TEXT_BURST_LENGTH = 24;
const TARGET_DRAIN_FRAME_COUNT = 8;
const MIN_FRAME_GRAPHEME_COUNT = 8;
const MAX_FRAME_GRAPHEME_COUNT = 2_048;

const browserFrameScheduler: FrameScheduler = {
  requestFrame: requestVisualFrame,
  cancelFrame: cancelVisualFrame,
};

function shouldAnimateInCurrentDocument(): boolean {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return false;
  }

  return !isReducedMotionPreferred();
}

function getFrameGraphemeCount(bufferedTextLength: number): number {
  if (bufferedTextLength <= SMALL_TEXT_BURST_LENGTH) {
    return bufferedTextLength;
  }

  return Math.min(
    MAX_FRAME_GRAPHEME_COUNT,
    Math.max(
      MIN_FRAME_GRAPHEME_COUNT,
      Math.ceil(bufferedTextLength / TARGET_DRAIN_FRAME_COUNT),
    ),
  );
}

export function createStreamingTextPresenter(
  onTextFrame: (textFrame: string) => void,
  frameScheduler: FrameScheduler = browserFrameScheduler,
  presenterOptions: StreamingTextPresenterOptions = {},
): StreamingTextPresenter {
  const shouldAnimate =
    presenterOptions.shouldAnimate ?? shouldAnimateInCurrentDocument;
  let bufferedText = '';
  let frameGraphemeCount = 0;
  let scheduledFrameId: number | null = null;
  let isFinishing = false;
  let isDisposed = false;
  let finishPromise: Promise<void> | null = null;
  let resolveFinishPromise: (() => void) | null = null;

  const resolveFinishIfComplete = () => {
    if (!isFinishing || bufferedText.length > 0 || scheduledFrameId !== null) {
      return;
    }

    resolveFinishPromise?.();
    resolveFinishPromise = null;
  };

  const emitNextTextFrame = () => {
    scheduledFrameId = null;

    if (isDisposed || bufferedText.length === 0) {
      resolveFinishIfComplete();
      return;
    }

    const nextFrameGraphemeCount = shouldAnimate()
      ? frameGraphemeCount || getFrameGraphemeCount(bufferedText.length)
      : bufferedText.length;
    const [textFrame, remainingText] = takeLeadingGraphemes(
      bufferedText,
      nextFrameGraphemeCount,
    );
    bufferedText = remainingText;

    if (textFrame.length > 0) {
      onTextFrame(textFrame);
    }

    if (bufferedText.length > 0) {
      scheduledFrameId = frameScheduler.requestFrame(emitNextTextFrame);
      return;
    }

    frameGraphemeCount = 0;
    resolveFinishIfComplete();
  };

  const scheduleTextFrame = () => {
    if (isDisposed || scheduledFrameId !== null || bufferedText.length === 0) {
      return;
    }

    if (!shouldAnimate()) {
      emitNextTextFrame();
      return;
    }

    scheduledFrameId = frameScheduler.requestFrame(emitNextTextFrame);
  };

  return {
    enqueueText: (textChunk) => {
      if (isDisposed || isFinishing || textChunk.length === 0) {
        return;
      }

      bufferedText += textChunk;
      frameGraphemeCount = Math.max(
        frameGraphemeCount,
        getFrameGraphemeCount(bufferedText.length),
      );
      scheduleTextFrame();
    },
    finishText: () => {
      if (finishPromise) {
        return finishPromise;
      }

      isFinishing = true;
      finishPromise = new Promise<void>((resolve) => {
        resolveFinishPromise = resolve;
      });

      if (bufferedText.length === 0) {
        resolveFinishIfComplete();
        return finishPromise;
      }

      if (!shouldAnimate()) {
        if (scheduledFrameId !== null) {
          frameScheduler.cancelFrame(scheduledFrameId);
          scheduledFrameId = null;
        }
        emitNextTextFrame();
      } else {
        scheduleTextFrame();
      }

      return finishPromise;
    },
    dispose: () => {
      if (scheduledFrameId !== null) {
        frameScheduler.cancelFrame(scheduledFrameId);
      }

      scheduledFrameId = null;
      bufferedText = '';
      frameGraphemeCount = 0;
      isDisposed = true;
      resolveFinishPromise?.();
      resolveFinishPromise = null;
    },
  };
}
