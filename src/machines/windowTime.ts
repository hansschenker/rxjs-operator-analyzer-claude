import { formatValue } from '../core/format';
import type {
  InitialResult,
  InputEvent,
  Machine,
  OutputEvent,
  ScheduledInput,
  StepContext,
  StepResult,
} from '../core/types';

/**
 * Executable Mealy machine for `windowTime(windowTimeSpan, windowCreationInterval?, maxWindowSize?)` —
 * RxJS 7.8.2, src/internal/operators/windowTime.ts. Rule ids must match operators/windowTime.yaml.
 *
 * S  = (records: {window, seen, close timer}[], tick timer | null) in phase active | completed | errored | finalized
 * S0 = ([w1:0@span], tick@interval | null)
 *
 * Timer ids: `c<k>` closes window w<k> after windowTimeSpan; `i<n>` is the n-th creation-interval tick.
 * Time unit: one frame = one virtual millisecond.
 */

export interface WindowTimeParams {
  readonly windowTimeSpan: number;
  readonly windowCreationInterval: number | null;
  readonly maxWindowSize: number;
  /** `windowCreationInterval` absent or negative: the next window starts when the previous one closes. */
  readonly restartOnClose: boolean;
}

export interface WindowRecord {
  readonly id: string;
  readonly seen: number;
  readonly closeTimer: string;
  readonly closeAt: number;
}

export type WindowTimeState =
  | {
      readonly phase: 'active';
      readonly records: readonly WindowRecord[];
      readonly nextWindow: number;
      readonly tickTimer: string | null;
      readonly tickAt: number | null;
      readonly nextTick: number;
    }
  | { readonly phase: 'completed' }
  | { readonly phase: 'errored' }
  | { readonly phase: 'finalized' };

function toNumber(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`windowTime: parameter ${name} must be a finite number, got ${String(value)}`);
  }
  return value;
}

function allTimers(state: WindowTimeState): string[] {
  if (state.phase !== 'active') return [];
  return [...state.records.map((r) => r.closeTimer), ...(state.tickTimer ? [state.tickTimer] : [])];
}

export const windowTimeMachine: Machine<WindowTimeState, WindowTimeParams> = {
  operator: 'windowTime',

  normalizeParams(raw): WindowTimeParams {
    const windowTimeSpan = toNumber('windowTimeSpan', raw.windowTimeSpan);
    const rawInterval = raw.windowCreationInterval;
    const windowCreationInterval =
      rawInterval === undefined || rawInterval === null ? null : toNumber('windowCreationInterval', rawInterval);
    const rawMax = raw.maxWindowSize;
    const maxWindowSize = rawMax === undefined || rawMax === null ? Infinity : toNumber('maxWindowSize', rawMax) || Infinity;
    return {
      windowTimeSpan,
      windowCreationInterval,
      maxWindowSize,
      restartOnClose: !(windowCreationInterval !== null && windowCreationInterval >= 0),
    };
  },

  describeParams(params): string {
    if (Number.isFinite(params.maxWindowSize)) {
      return `windowTime(${params.windowTimeSpan}, ${params.windowCreationInterval ?? 'undefined'}, ${params.maxWindowSize})`;
    }
    if (params.windowCreationInterval !== null) {
      return `windowTime(${params.windowTimeSpan}, ${params.windowCreationInterval})`;
    }
    return `windowTime(${params.windowTimeSpan})`;
  },

  initial(params): InitialResult<WindowTimeState> {
    const schedule: ScheduledInput[] = [];
    let tickTimer: string | null = null;
    let tickAt: number | null = null;
    let nextTick = 1;
    if (!params.restartOnClose && params.windowCreationInterval !== null) {
      tickTimer = `i${nextTick}`;
      tickAt = params.windowCreationInterval;
      nextTick += 1;
      schedule.push({ id: tickTimer, after: params.windowCreationInterval });
    }
    const first: WindowRecord = { id: 'w1', seen: 0, closeTimer: 'c1', closeAt: params.windowTimeSpan };
    schedule.push({ id: first.closeTimer, after: params.windowTimeSpan });
    return {
      ruleId: 'I0',
      state: { phase: 'active', records: [first], nextWindow: 2, tickTimer, tickAt, nextTick },
      outputs: [{ kind: 'windowOpen', window: first.id }],
      schedule,
    };
  },

  step(state, input: InputEvent, params, context: StepContext): StepResult<WindowTimeState> {
    if (input.kind === 'finalize') {
      return { ruleId: 'F1', state: { phase: 'finalized' }, outputs: [], cancel: allTimers(state) };
    }
    if (state.phase !== 'active') {
      return { ruleId: 'X1', state, outputs: [] };
    }
    const now = context.now;
    let nextWindow = state.nextWindow;
    const openWindow = (): { record: WindowRecord; output: OutputEvent; timer: ScheduledInput } => {
      const k = nextWindow;
      nextWindow += 1;
      const record: WindowRecord = { id: `w${k}`, seen: 0, closeTimer: `c${k}`, closeAt: now + params.windowTimeSpan };
      return {
        record,
        output: { kind: 'windowOpen', window: record.id },
        timer: { id: record.closeTimer, after: params.windowTimeSpan },
      };
    };

    switch (input.kind) {
      case 'value': {
        const label = formatValue(input.value);
        const outputs: OutputEvent[] = [];
        const schedule: ScheduledInput[] = [];
        const cancel: string[] = [];
        let records = state.records;
        let closed = false;
        // The source loops over a copy (line 163): a window opened during the loop does not see this value.
        for (const record of state.records) {
          outputs.push({ kind: 'windowNext', window: record.id, value: input.value, label });
          const seen = record.seen + 1;
          if (params.maxWindowSize <= seen) {
            closed = true;
            outputs.push({ kind: 'windowComplete', window: record.id });
            cancel.push(record.closeTimer);
            records = records.filter((r) => r.id !== record.id);
            if (params.restartOnClose) {
              const opened = openWindow();
              records = [...records, opened.record];
              outputs.push(opened.output);
              schedule.push(opened.timer);
            }
          } else {
            records = records.map((r) => (r.id === record.id ? { ...r, seen } : r));
          }
        }
        const ruleId = state.records.length === 0 ? 'V3' : closed ? 'V2' : 'V1';
        return { ruleId, state: { ...state, records, nextWindow }, outputs, schedule, cancel };
      }
      case 'timer': {
        if (input.id === state.tickTimer) {
          const opened = openWindow();
          const tickTimer = `i${state.nextTick}`;
          const interval = params.windowCreationInterval ?? 0;
          // startWindow() arms the close timer first, then the tick re-arms itself (executeSchedule.ts:27-29).
          return {
            ruleId: 'TI1',
            state: {
              ...state,
              records: [...state.records, opened.record],
              nextWindow,
              tickTimer,
              tickAt: now + interval,
              nextTick: state.nextTick + 1,
            },
            outputs: [opened.output],
            schedule: [opened.timer, { id: tickTimer, after: interval }],
          };
        }
        const closing = state.records.find((r) => r.closeTimer === input.id);
        if (!closing) {
          return { ruleId: 'X1', state, outputs: [] };
        }
        const outputs: OutputEvent[] = [{ kind: 'windowComplete', window: closing.id }];
        let records = state.records.filter((r) => r.id !== closing.id);
        const schedule: ScheduledInput[] = [];
        if (params.restartOnClose) {
          const opened = openWindow();
          records = [...records, opened.record];
          outputs.push(opened.output);
          schedule.push(opened.timer);
          return { ruleId: 'TC1', state: { ...state, records, nextWindow }, outputs, schedule };
        }
        return { ruleId: 'TC2', state: { ...state, records }, outputs };
      }
      case 'complete':
        return {
          ruleId: 'C1',
          state: { phase: 'completed' },
          outputs: [
            ...state.records.map((r): OutputEvent => ({ kind: 'windowComplete', window: r.id })),
            { kind: 'complete' },
          ],
          cancel: allTimers(state),
        };
      case 'error':
        return {
          ruleId: 'E1',
          state: { phase: 'errored' },
          outputs: [
            ...state.records.map(
              (r): OutputEvent => ({ kind: 'windowError', window: r.id, error: input.error, label: input.label }),
            ),
            { kind: 'error', error: input.error, label: input.label },
          ],
          cancel: allTimers(state),
        };
    }
  },

  formatState(state): string {
    switch (state.phase) {
      case 'active': {
        const windows = state.records.map((r) => `${r.id}:${r.seen}@${r.closeAt}`).join(', ');
        return state.tickTimer ? `([${windows}], tick@${state.tickAt ?? '?'})` : `([${windows}])`;
      }
      case 'completed':
        return '(∅) completed';
      case 'errored':
        return '(∅) errored';
      case 'finalized':
        return '⊥ finalized';
    }
  },

  snapshot(state): unknown {
    switch (state.phase) {
      case 'active':
        return {
          phase: 'active',
          windows: state.records.map((r) => ({ id: r.id, seen: r.seen, closeAt: r.closeAt })),
          tick: state.tickAt,
        };
      default:
        return { phase: state.phase };
    }
  },

  isTerminal(state): boolean {
    return state.phase !== 'active';
  },
};
