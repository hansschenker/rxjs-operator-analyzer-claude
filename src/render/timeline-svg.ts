import { outerLabel, scenarioCaption } from '../core/format';
import { lastFrame, parseMarble, type MarbleEvent } from '../core/marble';
import type { TraceStep } from '../core/types';
import { accentFor, theme } from './theme';

/**
 * 4-lane timeline renderer (pure: trace in, SVG string out).
 *
 *   lane 1  timeline  — WHEN: the frame axis
 *   lane 2  input     — WHAT & WHEN: source value / complete / error marbles
 *   lane 3  state     — HANDLING STATE: the machine state as a segment per transition, badge = rule id
 *   lane 4  output    — RESULT: downstream emissions; higher-order operators get one sub-row per window
 */

export interface TimelineInput {
  readonly operator: string;
  readonly category: string;
  readonly params: string;
  readonly scenario: { readonly name: string; readonly title?: string; readonly source: string };
  readonly steps: readonly TraceStep[];
}

export interface RenderOptions {
  /** Fixed frame width in px; omitted = automatic (40..110 depending on label density). */
  readonly frameWidth?: number;
  /** Upper bound for the total width in automatic mode (default 1360 px); labels get truncated instead. */
  readonly maxWidth?: number;
  readonly showLegend?: boolean;
  readonly showTitle?: boolean;
}

const DEFAULT_MAX_WIDTH = 1360;

interface Attrs {
  [key: string]: string | number | undefined;
}

const PAD_L = 16;
const PAD_R = 28;
const PAD_T = 14;
const PAD_B = 14;
const GUTTER = 150;
const TITLE_H = 50;
const LANE_GAP = 6;
const H_TIMELINE = 34;
const H_INPUT = 56;
const H_STATE = 78;
const H_OUTPUT = 56;
const H_WINDOW = 42;
const H_LEGEND = 36;
const STACK_DY = 26;
const R = 12;
const MONO_CHAR = 6.6; // px per character at 11px Roboto Mono
const MONO_CHAR_SMALL = 6.0;

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function el(tag: string, attrs: Attrs, children: readonly string[] | string = ''): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join('');
  const inner = Array.isArray(children) ? children.join('') : children;
  return inner === '' ? `<${tag}${a}/>` : `<${tag}${a}>${inner}</${tag}>`;
}

function text(x: number, y: number, content: string, attrs: Attrs = {}): string {
  return el('text', { x, y, ...attrs }, esc(content));
}

function pillWidth(label: string, charW = MONO_CHAR): number {
  return Math.max(2 * R, Math.round(label.length * charW + 14));
}

function truncate(label: string, maxPx: number, charW: number): string {
  const maxChars = Math.floor(maxPx / charW);
  if (label.length <= maxChars) return label;
  return maxChars <= 1 ? '…' : `${label.slice(0, Math.max(1, maxChars - 1))}…`;
}

interface OuterItem {
  readonly frame: number;
  readonly label: string;
  readonly kind: 'emit' | 'complete' | 'error' | 'windowOpen';
  readonly step: number;
}

/** Lane 2 item: a source marble event or an internal timer firing (both are inputs of Z). */
interface Lane2Item {
  readonly frame: number;
  readonly kind: 'value' | 'complete' | 'error' | 'timer';
  readonly label: string;
  readonly step: number;
}

function collectLane2(source: readonly MarbleEvent[], steps: readonly TraceStep[]): Lane2Item[] {
  const items: Lane2Item[] = source.map((e) => {
    const wanted = e.kind === 'value' ? `value(${e.letter})` : e.kind;
    let step = steps.findIndex((s) => s.frame === e.frame && s.kind === e.kind && s.input === wanted);
    if (step < 0) step = steps.findIndex((s) => s.frame === e.frame && s.kind === e.kind);
    return { frame: e.frame, kind: e.kind, label: e.letter, step };
  });
  steps.forEach((s, index) => {
    if (s.kind === 'timer') {
      items.push({ frame: s.frame, kind: 'timer', label: s.input.replace(/^timer\((.*)\)$/, '$1'), step: index });
    }
  });
  const rank = (i: Lane2Item): number => (i.kind === 'timer' ? 1 : 0);
  return items.sort((a, b) => a.frame - b.frame || rank(a) - rank(b));
}

interface WindowEvent {
  readonly frame: number;
  readonly kind: 'next' | 'complete' | 'error';
  readonly label: string;
  readonly step: number;
}

interface WindowRow {
  readonly id: string;
  readonly openFrame: number;
  closeFrame?: number;
  closeKind?: 'complete' | 'error';
  readonly events: WindowEvent[];
}

interface StateSegment {
  readonly frame: number;
  readonly endFrame: number | undefined;
  readonly steps: readonly { readonly index: number; readonly step: TraceStep }[];
}

function collectOuter(steps: readonly TraceStep[]): OuterItem[] {
  const items: OuterItem[] = [];
  steps.forEach((step, index) => {
    for (const o of step.outputs) {
      const label = outerLabel(o);
      if (label === undefined) continue;
      if (o.kind === 'emit' || o.kind === 'complete' || o.kind === 'error' || o.kind === 'windowOpen') {
        items.push({ frame: step.frame, label, kind: o.kind, step: index });
      }
    }
  });
  return items;
}

function collectWindows(steps: readonly TraceStep[]): WindowRow[] {
  const rows = new Map<string, WindowRow>();
  const ensure = (id: string, frame: number): WindowRow => {
    let row = rows.get(id);
    if (!row) {
      row = { id, openFrame: frame, events: [] };
      rows.set(id, row);
    }
    return row;
  };
  steps.forEach((step, index) => {
    for (const o of step.outputs) {
      if (!o.window) continue;
      const row = ensure(o.window, step.frame);
      switch (o.kind) {
        case 'windowNext':
          row.events.push({ frame: step.frame, kind: 'next', label: o.label ?? '', step: index });
          break;
        case 'windowComplete':
          row.closeFrame = step.frame;
          row.closeKind = 'complete';
          row.events.push({ frame: step.frame, kind: 'complete', label: '|', step: index });
          break;
        case 'windowError':
          row.closeFrame = step.frame;
          row.closeKind = 'error';
          row.events.push({ frame: step.frame, kind: 'error', label: '#', step: index });
          break;
        default:
          break;
      }
    }
  });
  return [...rows.values()];
}

function segments(steps: readonly TraceStep[]): StateSegment[] {
  const groups: { index: number; step: TraceStep }[][] = [];
  steps.forEach((step, index) => {
    const last = groups[groups.length - 1];
    if (last && last[0] && last[0].step.frame === step.frame) last.push({ index, step });
    else groups.push([{ index, step }]);
  });
  return groups.map((group, i) => {
    const first = group[0] as { index: number; step: TraceStep };
    const nextGroup = groups[i + 1];
    const nextFirst = nextGroup?.[0];
    return { frame: first.step.frame, endFrame: nextFirst?.step.frame, steps: group };
  });
}

function minGap(frames: readonly number[]): number {
  const sorted = [...new Set(frames)].sort((a, b) => a - b);
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < sorted.length; i++) {
    gap = Math.min(gap, (sorted[i] as number) - (sorted[i - 1] as number));
  }
  return gap === Number.POSITIVE_INFINITY ? 1 : Math.max(1, gap);
}

function autoFrameWidth(
  lane2: readonly Lane2Item[],
  outer: readonly OuterItem[],
  windows: readonly WindowRow[],
  segs: readonly StateSegment[],
): number {
  let required = 40;
  const consider = (labels: readonly string[], frames: readonly number[], charW: number): void => {
    if (labels.length === 0) return;
    const widest = Math.max(...labels.map((l) => pillWidth(l, charW)));
    required = Math.max(required, Math.ceil((widest + 10) / minGap(frames)));
  };
  consider(
    lane2.map((e) => e.label),
    lane2.map((e) => e.frame),
    MONO_CHAR,
  );
  consider(
    outer.map((o) => o.label),
    outer.map((o) => o.frame),
    MONO_CHAR,
  );
  for (const w of windows) {
    consider(
      w.events.map((e) => e.label),
      w.events.map((e) => e.frame),
      MONO_CHAR_SMALL,
    );
  }
  const stateLabels = segs.map((s) => stateLabelFor(s));
  const stateFrames = segs.map((s) => s.frame);
  if (stateLabels.length > 1) {
    const widest = Math.max(...stateLabels.map((l) => l.length * MONO_CHAR_SMALL + 16));
    required = Math.max(required, Math.ceil(widest / minGap(stateFrames)));
  }
  return Math.min(110, Math.max(40, required));
}

function stateLabelFor(segment: StateSegment): string {
  const informative = [...segment.steps].reverse().find((s) => s.step.kind !== 'finalize');
  return (informative ?? segment.steps[segment.steps.length - 1])?.step.state ?? '';
}

function stackIndexes<T extends { readonly frame: number }>(items: readonly T[]): Map<T, number> {
  const seen = new Map<number, number>();
  const result = new Map<T, number>();
  for (const item of items) {
    const n = seen.get(item.frame) ?? 0;
    result.set(item, n);
    seen.set(item.frame, n + 1);
  }
  return result;
}

function maxStack(indexes: ReadonlyMap<unknown, number>): number {
  let max = 0;
  for (const v of indexes.values()) max = Math.max(max, v + 1);
  return Math.max(1, max);
}

export function renderTimelineSvg(input: TimelineInput, options: RenderOptions = {}): string {
  const accent = accentFor(input.category);
  const source = parseMarble(input.scenario.source);
  const lane2 = collectLane2(source, input.steps);
  const outer = collectOuter(input.steps);
  const windows = collectWindows(input.steps);
  const segs = segments(input.steps);
  const showLegend = options.showLegend ?? true;
  const showTitle = options.showTitle ?? true;

  const frames = Math.max(lastFrame(source), lastFrame(input.steps), lastFrame(outer)) + 2;
  const perFrameCap = Math.floor(((options.maxWidth ?? DEFAULT_MAX_WIDTH) - PAD_L - GUTTER - PAD_R) / frames);
  const FW = options.frameWidth ?? Math.max(40, Math.min(autoFrameWidth(lane2, outer, windows, segs), perFrameCap));
  const x0 = PAD_L + GUTTER;
  const xEnd = x0 + frames * FW;
  const timeX = (f: number): number => x0 + f * FW + FW / 2;
  const width = xEnd + PAD_R;

  const inputStack = stackIndexes(lane2);
  const outerStack = stackIndexes(outer);
  const hInput = H_INPUT + (maxStack(inputStack) - 1) * STACK_DY;
  const hOutput = H_OUTPUT + (maxStack(outerStack) - 1) * STACK_DY;

  let y = PAD_T + (showTitle ? TITLE_H : 0);
  const lanes: { top: number; height: number }[] = [];
  const addLane = (height: number): { top: number; height: number } => {
    const lane = { top: y, height };
    lanes.push(lane);
    y += height + LANE_GAP;
    return lane;
  };
  const laneTimeline = addLane(H_TIMELINE);
  const laneInput = addLane(hInput);
  const laneState = addLane(H_STATE);
  const laneOutput = addLane(hOutput);
  const windowLanes = windows.map(() => addLane(H_WINDOW));
  const legendTop = y;
  const height = y + (showLegend ? H_LEGEND : 0) + PAD_B;

  const parts: string[] = [];

  // Background
  parts.push(el('rect', { x: 0, y: 0, width, height, fill: theme.white }));

  // Title
  if (showTitle) {
    const title = `${input.params}`;
    const subtitle = scenarioCaption(input.params, input.scenario.title, input.scenario.name);
    parts.push(
      text(PAD_L, PAD_T + 20, title, {
        'font-family': theme.fontMono,
        'font-size': 16,
        'font-weight': 700,
        fill: accent,
      }),
    );
    parts.push(
      text(PAD_L, PAD_T + 38, subtitle, {
        'font-family': theme.fontSans,
        'font-size': 12,
        fill: theme.gray600,
      }),
    );
    parts.push(
      text(width - PAD_R, PAD_T + 20, `source: ${input.scenario.source}`, {
        'font-family': theme.fontMono,
        'font-size': 11,
        fill: theme.gray700,
        'text-anchor': 'end',
      }),
    );
  }

  // Lane backgrounds + gutter labels
  const gutter = (
    lane: { top: number; height: number },
    index: number,
    name: string,
    caption: string,
    mono = false,
  ): void => {
    parts.push(
      el('rect', {
        x: PAD_L,
        y: lane.top,
        width: width - PAD_L - PAD_R,
        height: lane.height,
        fill: index % 2 === 0 ? theme.white : theme.gray50,
        stroke: theme.gray200,
        'stroke-width': 1,
        rx: 4,
      }),
    );
    parts.push(
      text(PAD_L + 10, lane.top + 18, name, {
        'font-family': mono ? theme.fontMono : theme.fontSans,
        'font-size': 12,
        'font-weight': 700,
        fill: theme.gray900,
      }),
    );
    parts.push(
      text(PAD_L + 10, lane.top + 32, caption, {
        'font-family': theme.fontSans,
        'font-size': 10,
        fill: theme.gray600,
      }),
    );
  };
  gutter(laneTimeline, 0, '1 · timeline', 'when (frames)');
  gutter(laneInput, 1, '2 · input', 'what & when (source)');
  gutter(laneState, 2, '3 · state', 'handling state · rule');
  gutter(laneOutput, 3, '4 · output', windows.length > 0 ? 'result (outer stream)' : 'resulting values');
  windows.forEach((w, i) => {
    gutter(windowLanes[i] as { top: number; height: number }, 4 + i, `4.${i + 1} · ${w.id}`, 'window values', true);
  });

  // Vertical frame guides at every step frame
  const guideFrames = [...new Set(input.steps.map((s) => s.frame))];
  const lastLane = windowLanes.length > 0 ? (windowLanes[windowLanes.length - 1] as { top: number; height: number }) : laneOutput;
  for (const f of guideFrames) {
    parts.push(
      el('line', {
        x1: timeX(f),
        y1: laneInput.top,
        x2: timeX(f),
        y2: lastLane.top + lastLane.height,
        stroke: theme.gray300,
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      }),
    );
  }

  // Lane 1: timeline axis
  {
    const cy = laneTimeline.top + laneTimeline.height / 2 + 2;
    parts.push(
      el('line', { x1: x0, y1: cy, x2: xEnd + 6, y2: cy, stroke: theme.gray700, 'stroke-width': 1.5 }),
    );
    parts.push(
      el('path', {
        d: `M ${xEnd + 6} ${cy - 4} L ${xEnd + 14} ${cy} L ${xEnd + 6} ${cy + 4} Z`,
        fill: theme.gray700,
      }),
    );
    const every = FW >= 22 ? 1 : 5;
    for (let f = 0; f < frames; f++) {
      const x = timeX(f);
      parts.push(el('line', { x1: x, y1: cy - 4, x2: x, y2: cy + 4, stroke: theme.gray700, 'stroke-width': 1 }));
      if (f % every === 0) {
        parts.push(
          text(x, cy - 8, String(f), {
            'font-family': theme.fontMono,
            'font-size': 10,
            fill: theme.gray700,
            'text-anchor': 'middle',
          }),
        );
      }
    }
  }

  const completeGlyph = (x: number, cy: number, size = 14, color = theme.gray900): string =>
    el('line', { x1: x, y1: cy - size, x2: x, y2: cy + size, stroke: color, 'stroke-width': 3 });
  const errorGlyph = (x: number, cy: number, size = 9): string =>
    el('g', { stroke: theme.accent, 'stroke-width': 3, 'stroke-linecap': 'round' }, [
      el('line', { x1: x - size, y1: cy - size, x2: x + size, y2: cy + size }),
      el('line', { x1: x - size, y1: cy + size, x2: x + size, y2: cy - size }),
    ]);
  const marble = (
    x: number,
    cy: number,
    label: string,
    style: 'input' | 'output' | 'window' | 'inner',
    titleText: string,
    attrs: Attrs,
  ): string => {
    const charW = style === 'inner' ? MONO_CHAR_SMALL : MONO_CHAR;
    const r = style === 'inner' ? 10 : R;
    const w = label.length <= 2 ? 2 * r : pillWidth(label, charW);
    const fill = style === 'output' ? accent : style === 'window' ? theme.white : style === 'inner' ? theme.white : theme.primaryBg;
    const stroke = style === 'window' ? accent : style === 'inner' ? theme.pink300 : accent;
    const color = style === 'output' ? theme.white : theme.gray900;
    const shape =
      w === 2 * r
        ? el('circle', { cx: x, cy, r, fill, stroke, 'stroke-width': 1.5, 'stroke-dasharray': style === 'window' ? '4 2' : undefined })
        : el('rect', { x: x - w / 2, y: cy - r, width: w, height: 2 * r, rx: r, fill, stroke, 'stroke-width': 1.5, 'stroke-dasharray': style === 'window' ? '4 2' : undefined });
    return el('g', attrs, [
      el('title', {}, esc(titleText)),
      shape,
      text(x, cy + 4, label, {
        'font-family': theme.fontMono,
        'font-size': style === 'inner' ? 10 : 11,
        'font-weight': style === 'output' ? 700 : 400,
        fill: color,
        'text-anchor': 'middle',
      }),
    ]);
  };

  const timerGlyph = (x: number, cy: number, label: string): string =>
    el('g', {}, [
      el('circle', { cx: x, cy, r: 10, fill: theme.white, stroke: theme.gray600, 'stroke-width': 1.5, 'stroke-dasharray': '3 2' }),
      text(x, cy + 3, label, {
        'font-family': theme.fontMono,
        'font-size': 9,
        fill: theme.gray800,
        'text-anchor': 'middle',
      }),
    ]);

  // Lane 2: source marbles and internal timer firings
  {
    const cy0 = laneInput.top + 30;
    for (const e of lane2) {
      const x = timeX(e.frame);
      const cy = cy0 + (inputStack.get(e) ?? 0) * STACK_DY;
      const attrs: Attrs = { class: e.kind === 'timer' ? 'timer' : 'input', 'data-frame': e.frame, 'data-step': e.step >= 0 ? e.step : undefined };
      switch (e.kind) {
        case 'value':
          parts.push(marble(x, cy, e.label, 'input', `frame ${e.frame}: value(${e.label})`, attrs));
          break;
        case 'timer':
          parts.push(el('g', attrs, [el('title', {}, `frame ${e.frame}: timer(${e.label}) fires`), timerGlyph(x, cy, e.label)]));
          break;
        case 'complete':
          parts.push(el('g', attrs, [el('title', {}, `frame ${e.frame}: complete`), completeGlyph(x, cy)]));
          break;
        case 'error':
          parts.push(el('g', attrs, [el('title', {}, `frame ${e.frame}: error`), errorGlyph(x, cy)]));
          break;
      }
    }
  }

  // Lane 3: state segments with rule badges
  {
    const boxTop = laneState.top + 32;
    const boxH = 26;
    for (const seg of segs) {
      const sx = seg.frame === 0 ? x0 + 2 : timeX(seg.frame);
      const ex = seg.endFrame === undefined ? xEnd : timeX(seg.endFrame) - 2;
      const terminal = seg.steps.some((s) => s.step.kind === 'complete' || s.step.kind === 'error' || s.step.kind === 'finalize');
      const label = stateLabelFor(seg);
      const segW = Math.max(8, ex - sx);
      const shown = truncate(label, segW - 10, MONO_CHAR_SMALL);
      const first = seg.steps[0] as { index: number; step: TraceStep };
      const titleText = seg.steps
        .map((s) => `frame ${s.step.frame} · ${s.step.input} · rule ${s.step.rule} → ${s.step.state}`)
        .join('\n');
      const badges: string[] = [];
      let bx = sx + 2;
      for (const s of seg.steps) {
        const bw = Math.round(s.step.rule.length * 6 + 10);
        badges.push(
          el('g', { class: 'rule-badge', 'data-step': s.index, 'data-rule': s.step.rule }, [
            el('title', {}, esc(`${s.step.input} → rule ${s.step.rule}`)),
            el('rect', { x: bx, y: laneState.top + 10, width: bw, height: 16, rx: 8, fill: s.step.kind === 'finalize' ? theme.gray600 : accent }),
            text(bx + bw / 2, laneState.top + 22, s.step.rule, {
              'font-family': theme.fontMono,
              'font-size': 9,
              'font-weight': 700,
              fill: theme.white,
              'text-anchor': 'middle',
            }),
          ]),
        );
        bx += bw + 4;
      }
      parts.push(
        el('g', { class: 'state', 'data-step': first.index, 'data-rule': first.step.rule, 'data-frame': seg.frame }, [
          el('title', {}, esc(titleText)),
          el('rect', {
            x: sx,
            y: boxTop,
            width: segW,
            height: boxH,
            rx: 5,
            fill: terminal ? theme.gray100 : theme.primaryBg,
            stroke: terminal ? theme.gray500 : accent,
            'stroke-width': 1,
            'stroke-dasharray': terminal ? '4 3' : undefined,
          }),
          text(sx + 6, boxTop + 17, shown, {
            'font-family': theme.fontMono,
            'font-size': 10,
            fill: theme.gray900,
          }),
          ...badges,
        ]),
      );
    }
  }

  // Lane 4: outer outputs
  {
    const cy0 = laneOutput.top + 30;
    for (const item of outer) {
      const x = timeX(item.frame);
      const cy = cy0 + (outerStack.get(item) ?? 0) * STACK_DY;
      const attrs: Attrs = { class: 'output', 'data-frame': item.frame, 'data-step': item.step };
      switch (item.kind) {
        case 'emit':
          parts.push(marble(x, cy, item.label, 'output', `frame ${item.frame}: emit(${item.label})`, attrs));
          break;
        case 'windowOpen':
          parts.push(marble(x, cy, item.label, 'window', `frame ${item.frame}: open(${item.label})`, attrs));
          break;
        case 'complete':
          parts.push(el('g', attrs, [el('title', {}, `frame ${item.frame}: complete`), completeGlyph(x, cy)]));
          break;
        case 'error':
          parts.push(el('g', attrs, [el('title', {}, `frame ${item.frame}: error`), errorGlyph(x, cy)]));
          break;
      }
    }
  }

  // Window sub-rows
  windows.forEach((w, i) => {
    const lane = windowLanes[i] as { top: number; height: number };
    const cy = lane.top + lane.height / 2 + 2;
    const sx = timeX(w.openFrame);
    const ex = w.closeFrame === undefined ? xEnd : timeX(w.closeFrame);
    parts.push(
      el('line', {
        x1: sx,
        y1: cy,
        x2: ex,
        y2: cy,
        stroke: theme.pink200,
        'stroke-width': 4,
        'stroke-linecap': 'round',
        'stroke-dasharray': w.closeFrame === undefined ? '6 4' : undefined,
      }),
    );
    parts.push(el('circle', { cx: sx, cy, r: 4, fill: accent }));
    for (const e of w.events) {
      const x = timeX(e.frame);
      const attrs: Attrs = { class: 'window-event', 'data-frame': e.frame, 'data-step': e.step };
      if (e.kind === 'next') {
        parts.push(marble(x, cy, e.label, 'inner', `frame ${e.frame}: ${w.id}.next(${e.label})`, attrs));
      } else if (e.kind === 'complete') {
        parts.push(el('g', attrs, [el('title', {}, `frame ${e.frame}: ${w.id}.complete`), completeGlyph(x, cy, 11)]));
      } else {
        parts.push(el('g', attrs, [el('title', {}, `frame ${e.frame}: ${w.id}.error`), errorGlyph(x, cy, 7)]));
      }
    }
  });

  // Legend
  if (showLegend) {
    const cy = legendTop + 20;
    let lx = PAD_L + 10;
    const item = (glyph: string, label: string, advance: number): void => {
      parts.push(glyph);
      parts.push(
        text(lx + 18, cy + 4, label, { 'font-family': theme.fontSans, 'font-size': 10, fill: theme.gray700 }),
      );
      lx += advance;
    };
    item(el('circle', { cx: lx + 4, cy, r: 7, fill: theme.primaryBg, stroke: accent, 'stroke-width': 1.5 }), 'input value', 88);
    item(el('circle', { cx: lx + 4, cy, r: 7, fill: theme.white, stroke: theme.gray600, 'stroke-width': 1.5, 'stroke-dasharray': '3 2' }), 'timer fires', 84);
    item(el('circle', { cx: lx + 4, cy, r: 7, fill: accent }), 'output value', 94);
    item(el('rect', { x: lx - 4, y: cy - 7, width: 16, height: 14, rx: 7, fill: theme.white, stroke: accent, 'stroke-width': 1.5, 'stroke-dasharray': '4 2' }), 'window opened', 104);
    item(el('rect', { x: lx - 4, y: cy - 7, width: 16, height: 14, rx: 4, fill: theme.primaryBg, stroke: accent, 'stroke-width': 1 }), 'state segment', 100);
    item(el('rect', { x: lx - 4, y: cy - 7, width: 16, height: 14, rx: 7, fill: accent }), 'rule id', 72);
    item(completeGlyph(lx + 4, cy, 7), 'complete', 76);
    item(errorGlyph(lx + 4, cy, 5), 'error', 60);
    item(el('line', { x1: lx - 4, y1: cy, x2: lx + 12, y2: cy, stroke: theme.pink200, 'stroke-width': 4, 'stroke-linecap': 'round' }), 'window lifetime', 100);
  }

  return el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      'font-family': theme.fontSans,
      'data-operator': input.operator,
      'data-scenario': input.scenario.name,
    },
    parts,
  );
}
