const graphemeSegmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('ko', { granularity: 'grapheme' })
    : null;

export function takeLeadingGraphemes(
  textValue: string,
  graphemeCount: number,
): [string, string] {
  if (graphemeCount <= 0) {
    return ['', textValue];
  }

  let endOffset = 0;
  let consumedGraphemeCount = 0;

  if (graphemeSegmenter) {
    for (const graphemeSegment of graphemeSegmenter.segment(textValue)) {
      endOffset = graphemeSegment.index + graphemeSegment.segment.length;
      consumedGraphemeCount += 1;

      if (consumedGraphemeCount >= graphemeCount) {
        break;
      }
    }
  } else {
    for (const textUnit of textValue) {
      endOffset += textUnit.length;
      consumedGraphemeCount += 1;

      if (consumedGraphemeCount >= graphemeCount) {
        break;
      }
    }
  }

  if (endOffset === 0 || endOffset >= textValue.length) {
    return [textValue, ''];
  }

  return [textValue.slice(0, endOffset), textValue.slice(endOffset)];
}
