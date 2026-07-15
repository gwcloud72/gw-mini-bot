export interface ParsedSseEvent {
  event: string;
  data: string;
  id?: string;
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
      const parsedEvent = parseSseEventBlock(eventBlock);

      if (parsedEvent) {
        parsedEvents.push(parsedEvent);
      }
    }

    return parsedEvents;
  }

  flush(): ParsedSseEvent[] {
    const remainingEventBlock = this.eventBuffer.trim();
    this.eventBuffer = '';

    if (!remainingEventBlock) {
      return [];
    }

    const parsedEvent = parseSseEventBlock(remainingEventBlock);
    return parsedEvent ? [parsedEvent] : [];
  }
}
