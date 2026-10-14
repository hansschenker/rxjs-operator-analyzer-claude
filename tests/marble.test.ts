import { describe, expect, it } from 'vitest';
import { formatMarble, marbleLetters, MarbleSyntaxError, parseMarble } from '../src/core/marble';

describe('parseMarble', () => {
  it('places values, completion and errors on frames', () => {
    expect(parseMarble('-a-b-|')).toEqual([
      { frame: 1, kind: 'value', letter: 'a' },
      { frame: 3, kind: 'value', letter: 'b' },
      { frame: 5, kind: 'complete', letter: '|' },
    ]);
    expect(parseMarble('a#')).toEqual([
      { frame: 0, kind: 'value', letter: 'a' },
      { frame: 1, kind: 'error', letter: '#' },
    ]);
  });

  it('puts every member of a group on the frame of "(" and makes the group length+2 frames wide', () => {
    expect(parseMarble('(ab)-c|')).toEqual([
      { frame: 0, kind: 'value', letter: 'a' },
      { frame: 0, kind: 'value', letter: 'b' },
      { frame: 5, kind: 'value', letter: 'c' },
      { frame: 6, kind: 'complete', letter: '|' },
    ]);
    expect(parseMarble('--(a|)')).toEqual([
      { frame: 2, kind: 'value', letter: 'a' },
      { frame: 2, kind: 'complete', letter: '|' },
    ]);
  });

  it('ignores whitespace and the subscription marker', () => {
    expect(parseMarble('^ -a- |')).toEqual(parseMarble('-a-|'));
  });

  it('rejects malformed input', () => {
    expect(() => parseMarble('(a')).toThrow(MarbleSyntaxError);
    expect(() => parseMarble('((a))')).toThrow(MarbleSyntaxError);
    expect(() => parseMarble('a|b')).toThrow(MarbleSyntaxError);
    expect(() => parseMarble('a$')).toThrow(MarbleSyntaxError);
  });

  it('lists distinct value letters in order', () => {
    expect(marbleLetters('-a-b-a-(cd)|')).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('formatMarble', () => {
  it('round-trips canonical marbles', () => {
    for (const m of ['-a-b-|', '---x-y-(w|)', 'a', '--#', '(ab)-c|']) {
      const events = parseMarble(m);
      expect(formatMarble(events)).toEqual({ marble: m, exact: true });
    }
  });

  it('flags marbles a group cannot express exactly', () => {
    const formatted = formatMarble([
      { frame: 3, letter: 'x' },
      { frame: 3, letter: 'y' },
      { frame: 5, letter: 'z' },
    ]);
    expect(formatted.marble).toBe('---(xy)z');
    expect(formatted.exact).toBe(false);
  });
});
