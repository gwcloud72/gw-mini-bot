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
    runEveryFrame: () => {
      let executedFrameCount = 0;
      while (scheduledFrames.size > 0) {
        const nextFrameEntry = scheduledFrames.entries().next().value as
          | [number, () => void]
          | undefined;
        if (!nextFrameEntry) {
          break;
        }
        const [frameId, frameCallback] = nextFrameEntry;
        scheduledFrames.delete(frameId);
        frameCallback();
        executedFrameCount += 1;
      }
      return executedFrameCount;
    },
    getScheduledFrameCount: () => scheduledFrames.size,
  };
}

describe('createStreamingTextPresenter', () => {
  it('combines small chunks received before paint into one visual frame', () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
      { shouldAnimate: () => true },
    );

    presenter.enqueueText('안녕');
    presenter.enqueueText('하세요');

    expect(manualFrameScheduler.getScheduledFrameCount()).toBe(1);
    manualFrameScheduler.runNextFrame();
    expect(renderedFrames).toEqual(['안녕하세요']);
  });

  it('reveals a large network burst progressively without leaving a long backlog', async () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
      { shouldAnimate: () => true },
    );
    const streamedText = '가'.repeat(2_400);

    presenter.enqueueText(streamedText);
    const finishPromise = presenter.finishText();
    const executedFrameCount = manualFrameScheduler.runEveryFrame();
    await finishPromise;

    expect(renderedFrames.length).toBeGreaterThan(1);
    expect(renderedFrames.join('')).toBe(streamedText);
    expect(executedFrameCount).toBeLessThanOrEqual(14);
    expect(manualFrameScheduler.getScheduledFrameCount()).toBe(0);
  });

  it('keeps the maximum response size within a short visual drain window', async () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
      { shouldAnimate: () => true },
    );
    const streamedText = '가'.repeat(32_000);

    presenter.enqueueText(streamedText);
    const finishPromise = presenter.finishText();
    const executedFrameCount = manualFrameScheduler.runEveryFrame();
    await finishPromise;

    expect(renderedFrames.join('')).toBe(streamedText);
    expect(executedFrameCount).toBeLessThanOrEqual(16);
  });

  it('keeps a grapheme cluster intact while revealing text', async () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
      { shouldAnimate: () => true },
    );
    const streamedText = '👨‍👩‍👧‍👦'.repeat(40);

    presenter.enqueueText(streamedText);
    const finishPromise = presenter.finishText();
    manualFrameScheduler.runEveryFrame();
    await finishPromise;

    expect(renderedFrames.join('')).toBe(streamedText);
    expect(
      renderedFrames.every((textFrame) =>
        Array.from(new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(textFrame))
          .every((segment) => segment.segment === '👨‍👩‍👧‍👦'),
      ),
    ).toBe(true);
  });

  it('emits every pending character at once when animation is disabled', async () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
      { shouldAnimate: () => false },
    );
    const streamedText = '가'.repeat(2_400);

    presenter.enqueueText(streamedText);
    const finishPromise = presenter.finishText();
    await finishPromise;

    expect(renderedFrames).toEqual([streamedText]);
    expect(manualFrameScheduler.getScheduledFrameCount()).toBe(0);
  });

  it('schedules a new frame only when text arrives after the previous paint', () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
      { shouldAnimate: () => true },
    );

    presenter.enqueueText('첫 번째');
    manualFrameScheduler.runNextFrame();
    presenter.enqueueText('두 번째');
    manualFrameScheduler.runNextFrame();

    expect(renderedFrames).toEqual(['첫 번째', '두 번째']);
  });

  it('returns the same completion promise when finish is requested repeatedly', async () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
      { shouldAnimate: () => true },
    );

    presenter.enqueueText('마지막 문장'.repeat(20));
    const firstFinishPromise = presenter.finishText();
    const secondFinishPromise = presenter.finishText();
    manualFrameScheduler.runEveryFrame();
    await firstFinishPromise;

    expect(secondFinishPromise).toBe(firstFinishPromise);
    expect(renderedFrames.join('')).toBe('마지막 문장'.repeat(20));
  });

  it('does not emit pending text after disposal', async () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
      { shouldAnimate: () => true },
    );

    presenter.enqueueText('표시되지 않음');
    const finishPromise = presenter.finishText();
    presenter.dispose();
    manualFrameScheduler.runEveryFrame();
    await finishPromise;

    expect(renderedFrames).toEqual([]);
    expect(manualFrameScheduler.getScheduledFrameCount()).toBe(0);
  });

  it('renders immediately when animation is disabled before a frame can run', () => {
    const renderedFrames: string[] = [];
    const manualFrameScheduler = createManualFrameScheduler();
    const presenter = createStreamingTextPresenter(
      (textFrame) => renderedFrames.push(textFrame),
      manualFrameScheduler.scheduler,
      { shouldAnimate: () => false },
    );

    presenter.enqueueText('숨겨진 탭에서도 즉시 정리');

    expect(renderedFrames).toEqual(['숨겨진 탭에서도 즉시 정리']);
    expect(manualFrameScheduler.getScheduledFrameCount()).toBe(0);
  });

});
