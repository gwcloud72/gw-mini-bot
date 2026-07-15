import { describe, expect, it } from 'vitest';
import { SseParser } from './sse';

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
});
