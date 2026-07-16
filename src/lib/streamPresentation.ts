import { cancelVisualFrame, requestVisualFrame } from './browserMotion';

interface FrameScheduler {
  requestFrame: (frameCallback: () => void) => number;
  cancelFrame: (frameId: number) => void;
}

interface StreamingTextPresenter {
  enqueueText: (textChunk: string) => void;
  flushText: () => void;
  dispose: () => void;
}

const browserFrameScheduler: FrameScheduler = {
  requestFrame: requestVisualFrame,
  cancelFrame: cancelVisualFrame,
};

export function createStreamingTextPresenter(
  onTextFrame: (textFrame: string) => void,
  frameScheduler: FrameScheduler = browserFrameScheduler,
): StreamingTextPresenter {
  let bufferedText = '';
  let scheduledFrameId: number | null = null;
  let isDisposed = false;

  const emitBufferedText = () => {
    scheduledFrameId = null;

    if (isDisposed || bufferedText.length === 0) {
      return;
    }

    const textFrame = bufferedText;
    bufferedText = '';
    onTextFrame(textFrame);
  };

  const scheduleTextFrame = () => {
    if (isDisposed || scheduledFrameId !== null || bufferedText.length === 0) {
      return;
    }

    scheduledFrameId = frameScheduler.requestFrame(emitBufferedText);
  };

  return {
    enqueueText: (textChunk) => {
      if (isDisposed || textChunk.length === 0) {
        return;
      }

      bufferedText += textChunk;
      scheduleTextFrame();
    },
    flushText: () => {
      if (scheduledFrameId !== null) {
        frameScheduler.cancelFrame(scheduledFrameId);
      }

      emitBufferedText();
    },
    dispose: () => {
      if (scheduledFrameId !== null) {
        frameScheduler.cancelFrame(scheduledFrameId);
      }

      scheduledFrameId = null;
      bufferedText = '';
      isDisposed = true;
    },
  };
}
