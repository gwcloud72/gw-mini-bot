export interface ParsedSseEvent {
  event: string;
  data: string;
  id?: string;
}

interface SseParserOptions {
  maxBufferedCharacterCount?: number;
}

const DEFAULT_MAX_BUFFERED_CHARACTER_COUNT = 256 * 1_024;

export class SseParserError extends Error {
  readonly errorCode = 'SSE_BUFFER_LIMIT_EXCEEDED';

  constructor() {
    super('SSE event buffer exceeded the allowed size.');
    this.name = 'SseParserError';
  }
}

function parseSseEventBlock(eventBlock: string): ParsedSseEvent | null {
  let eventName = 'message';
  let eventId: string | undefined;
  const eventDataLines: string[] = [];

  for (const eventLine of eventBlock.split(/\r\n|\r|\n/)) {
    if (!eventLine || eventLine.startsWith(':')) {
      continue;
    }

    const fieldSeparatorIndex = eventLine.indexOf(':');
    const fieldName =
      fieldSeparatorIndex === -1
        ? eventLine
        : eventLine.slice(0, fieldSeparatorIndex);
    let fieldValue =
      fieldSeparatorIndex === -1
        ? ''
        : eventLine.slice(fieldSeparatorIndex + 1);

    if (fieldValue.startsWith(' ')) {
      fieldValue = fieldValue.slice(1);
    }

    switch (fieldName) {
      case 'event':
        eventName = fieldValue || 'message';
        break;
      case 'data':
        eventDataLines.push(fieldValue);
        break;
      case 'id':
        eventId = fieldValue;
        break;
      default:
        break;
    }
  }

  if (
    eventDataLines.length === 0 &&
    eventName === 'message' &&
    eventId === undefined
  ) {
    return null;
  }

  return {
    event: eventName,
    data: eventDataLines.join('\n'),
    id: eventId,
  };
}

export class SseParser {
  private eventBuffer = '';
  private readonly maxBufferedCharacterCount: number;

  constructor(parserOptions: SseParserOptions = {}) {
    const configuredBufferLimit = parserOptions.maxBufferedCharacterCount;
    this.maxBufferedCharacterCount =
      typeof configuredBufferLimit === 'number' &&
      Number.isSafeInteger(configuredBufferLimit) &&
      configuredBufferLimit > 0
        ? configuredBufferLimit
        : DEFAULT_MAX_BUFFERED_CHARACTER_COUNT;
  }

  feed(textChunk: string): ParsedSseEvent[] {
    this.eventBuffer += textChunk;
    const parsedEvents: ParsedSseEvent[] = [];

    while (true) {
      const eventBoundary = this.eventBuffer.match(
        /(?:\r\n|\r(?!\n)|\n){2}/,
      );
      if (!eventBoundary || eventBoundary.index === undefined) {
        break;
      }

      const eventBlock = this.eventBuffer.slice(0, eventBoundary.index);
      this.eventBuffer = this.eventBuffer.slice(
        eventBoundary.index + eventBoundary[0].length,
      );
      if (eventBlock.length > this.maxBufferedCharacterCount) {
        this.eventBuffer = '';
        throw new SseParserError();
      }
      const parsedEvent = parseSseEventBlock(eventBlock);

      if (parsedEvent) {
        parsedEvents.push(parsedEvent);
      }
    }

    if (this.eventBuffer.length > this.maxBufferedCharacterCount) {
      this.eventBuffer = '';
      throw new SseParserError();
    }

    return parsedEvents;
  }

  flush(): ParsedSseEvent[] {
    const remainingEventBlock = this.eventBuffer.trim();
    this.eventBuffer = '';

    if (!remainingEventBlock) {
      return [];
    }

    if (remainingEventBlock.length > this.maxBufferedCharacterCount) {
      throw new SseParserError();
    }

    const parsedEvent = parseSseEventBlock(remainingEventBlock);
    return parsedEvent ? [parsedEvent] : [];
  }
}
