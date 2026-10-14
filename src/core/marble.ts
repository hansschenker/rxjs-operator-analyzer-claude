/**
 * RxJS marble grammar subset (TestScheduler `run` mode semantics):
 *   `-`      one frame of silence
 *   `a`..`Z` a value at the current frame (one frame wide)
 *   `|`      completion, `#` error (one frame wide)
 *   `(abc|)` a group: every member at the frame of `(`; the group is `length + 2` frames wide
 *   `^`      subscription point: ignored, frames are counted from 0 at the first character
 *   spaces   ignored
 */

export type MarbleKind = 'value' | 'complete' | 'error';

export interface MarbleEvent {
  readonly frame: number;
  readonly kind: MarbleKind;
  readonly letter: string;
}

export class MarbleSyntaxError extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(`${message} (at position ${position})`);
    this.name = 'MarbleSyntaxError';
    this.position = position;
  }
}

export function parseMarble(marble: string): MarbleEvent[] {
  const events: MarbleEvent[] = [];
  let frame = 0;
  let groupStart = -1;
  let terminated = false;

  for (let i = 0; i < marble.length; i++) {
    const ch = marble.charAt(i);
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue;
    if (terminated) {
      throw new MarbleSyntaxError(`unexpected '${ch}' after terminal notification`, i);
    }

    switch (ch) {
      case '-':
        frame++;
        break;
      case '^':
        break;
      case '(':
        if (groupStart >= 0) throw new MarbleSyntaxError('nested group', i);
        groupStart = frame;
        frame++;
        break;
      case ')':
        if (groupStart < 0) throw new MarbleSyntaxError("')' without '('", i);
        groupStart = -1;
        frame++;
        break;
      case '|':
      case '#': {
        const at = groupStart >= 0 ? groupStart : frame;
        events.push({ frame: at, kind: ch === '|' ? 'complete' : 'error', letter: ch });
        frame++;
        if (groupStart < 0) terminated = true;
        break;
      }
      default: {
        if (!/[a-zA-Z0-9]/.test(ch)) {
          throw new MarbleSyntaxError(`unexpected character '${ch}'`, i);
        }
        const at = groupStart >= 0 ? groupStart : frame;
        events.push({ frame: at, kind: 'value', letter: ch });
        frame++;
      }
    }
  }
  if (groupStart >= 0) throw new MarbleSyntaxError('unclosed group', marble.length);
  return events;
}

export interface MarbleLetter {
  readonly frame: number;
  readonly letter: string;
}

export interface FormattedMarble {
  readonly marble: string;
  /** false when a group pushed the cursor past a later event, so the string cannot be frame-exact. */
  readonly exact: boolean;
}

/** Inverse of `parseMarble`: events sharing a frame become a `(...)` group. */
export function formatMarble(events: readonly MarbleLetter[]): FormattedMarble {
  const byFrame = new Map<number, string[]>();
  for (const e of events) {
    const list = byFrame.get(e.frame) ?? [];
    list.push(e.letter);
    byFrame.set(e.frame, list);
  }
  const frames = [...byFrame.keys()].sort((a, b) => a - b);
  let out = '';
  let cursor = 0;
  let exact = true;
  for (const f of frames) {
    if (f < cursor) exact = false;
    while (cursor < f) {
      out += '-';
      cursor++;
    }
    const letters = byFrame.get(f) ?? [];
    if (letters.length === 1) {
      out += letters[0];
      cursor++;
    } else {
      out += `(${letters.join('')})`;
      cursor += letters.length + 2;
    }
  }
  return { marble: out, exact };
}

/** Letters used for generated expected marbles: x, y, z, w, ... then upper case. Digits are avoided (time syntax). */
export function expectedLetters(): string[] {
  return [...'xyzwvutsrqponmlkjihgfedcba', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
}

export function lastFrame(events: readonly { frame: number }[]): number {
  return events.reduce((max, e) => Math.max(max, e.frame), 0);
}

/** Every distinct value letter of a marble string, in order of first appearance. */
export function marbleLetters(marble: string): string[] {
  const seen: string[] = [];
  for (const e of parseMarble(marble)) {
    if (e.kind === 'value' && !seen.includes(e.letter)) seen.push(e.letter);
  }
  return seen;
}
