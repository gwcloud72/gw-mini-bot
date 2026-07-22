import { describe, expect, it } from 'vitest';
import { SseParser, SseParserError } from './sse';

describe('SseParser', () => {
  it('parses events split across network chunks', () => {
    const sseParser = new SseParser();

    expect(sseParser.feed('event: chu')).toEqual([]);
    expect(sseParser.feed('nk\ndata: {"text":"안')).toEqual([]);
    expect(sseParser.feed('녕"}\n\n')).toEqual([
      {
        event: 'chunk',
        data: '{"text":"안녕"}',
        id: undefined,
      },
    ]);
  });

  it('supports CRLF and multiline data fields', () => {
    const sseParser = new SseParser();
    const parsedEvents = sseParser.feed(
      'event: note\r\ndata: first\r\ndata: second\r\n\r\n',
    );

    expect(parsedEvents[0]).toEqual({
      event: 'note',
      data: 'first\nsecond',
      id: undefined,
    });
  });

  it('supports lone CR and mixed line endings without splitting a CRLF pair', () => {
    const sseParser = new SseParser();

    expect(sseParser.feed('event: first\rdata: one\r\r')).toEqual([
      { event: 'first', data: 'one', id: undefined },
    ]);
    expect(sseParser.feed('event: second\r\ndata: two\r\n\n')).toEqual([
      { event: 'second', data: 'two', id: undefined },
    ]);
  });

  it('ignores keep-alive comments', () => {
    const sseParser = new SseParser();

    expect(sseParser.feed(': connected\n\n')).toEqual([]);
    expect(sseParser.flush()).toEqual([]);
  });

  it('handles a CRLF event boundary split after the second carriage return', () => {
    const sseParser = new SseParser();

    expect(sseParser.feed('event: chunk\r\ndata: {"text":"안녕"}\r')).toEqual([]);
    expect(sseParser.feed('\n\r\nevent: done\ndata: {}\n\n')).toEqual([
      { event: 'chunk', data: '{"text":"안녕"}', id: undefined },
      { event: 'done', data: '{}', id: undefined },
    ]);
  });

  it('rejects one unterminated SSE event that exceeds the buffer limit', () => {
    const sseParser = new SseParser({ maxBufferedCharacterCount: 32 });

    expect(() =>
      sseParser.feed(`event: chunk\ndata: ${'가'.repeat(40)}`),
    ).toThrowError('SSE event buffer exceeded the allowed size.');
  });


  it('rejects a completed event that exceeds the buffer limit', () => {
    const parser = new SseParser({ maxBufferedCharacterCount: 64 });

    expect(() =>
      parser.feed(`event: chunk\ndata: ${'가'.repeat(80)}\n\n`),
    ).toThrow(SseParserError);
  });

  it('accepts many complete events even when the incoming chunk is larger than the buffer limit', () => {
    const sseParser = new SseParser({ maxBufferedCharacterCount: 24 });
    const incomingChunk = Array.from(
      { length: 20 },
      (_, eventIndex) => `event: note\ndata: ${eventIndex}\n\n`,
    ).join('');

    expect(sseParser.feed(incomingChunk)).toHaveLength(20);
  });

});
