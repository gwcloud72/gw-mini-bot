import { describe, expect, it } from 'vitest';
import { createStreamingTextPresenter } from './streamPresentation';

function createManualFrameScheduler() {
  const scheduledFrames = new Map<number, () => void>();
  let nextFrameId = 1;

  return {
    scheduler: {
      requestFrame: (frameCallback: () => void) => {
        const frameId = nextFrameId;
        nextFrameId += 1;
        scheduledFrames.set(frameId, frameCallback);
        return frameId;
      },
      cancelFrame: (frameId: number) => {
        scheduledFrames.delete(frameId);
      },
    },
    runNextFrame: () => {
      const nextFrameEntry = scheduledFrames.entries().next().value as
        | [number, () => void]
        | undefined;

      if (!nextFrameEntry) {
        return false;
      }

      const [frameId, frameCallback] = nextFrameEntry;
      scheduledFrames.delete(frameId);
      frameCallback();
      return true;
    },
    getScheduledFrameCount: () => scheduledFrames.size,
  };
}

describe('createStreamingTextPresenter', () => {
  it('combines every chunk received before paint into one visual frame', () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
    );

    presenter.enqueueText('안녕');
    presenter.enqueueText('하세요');

    expect(manualFrameScheduler.getScheduledFrameCount()).toBe(1);
    manualFrameScheduler.runNextFrame();
    expect(renderedFrames).toEqual(['안녕하세요']);
  });

  it('does not create an artificial multi-frame backlog for a large network burst', () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
    );
    const streamedText = '가'.repeat(2_400);

    presenter.enqueueText(streamedText);
    manualFrameScheduler.runNextFrame();

    expect(renderedFrames).toEqual([streamedText]);
    expect(manualFrameScheduler.getScheduledFrameCount()).toBe(0);
  });

  it('schedules a new frame only when text arrives after the previous paint', () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
    );

    presenter.enqueueText('첫 번째');
    manualFrameScheduler.runNextFrame();
    presenter.enqueueText('두 번째');
    manualFrameScheduler.runNextFrame();

    expect(renderedFrames).toEqual(['첫 번째', '두 번째']);
  });

  it('flushes pending text immediately when the response completes', () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
    );

    presenter.enqueueText('마지막 문장');
    presenter.flushText();

    expect(renderedFrames).toEqual(['마지막 문장']);
    expect(manualFrameScheduler.getScheduledFrameCount()).toBe(0);
  });

  it('does not emit text after disposal', () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
    );

    presenter.enqueueText('표시되지 않음');
    presenter.dispose();
    manualFrameScheduler.runNextFrame();

    expect(renderedFrames).toEqual([]);
  });
});
