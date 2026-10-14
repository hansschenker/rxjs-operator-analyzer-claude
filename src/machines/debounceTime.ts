import { formatValue } from '../core/format';
import type { InitialResult, InputEvent, Machine, StepContext, StepResult } from '../core/types';

/**
 * Executable Mealy machine for `debounceTime(dueTime)` — RxJS 7.8.2,
 * src/internal/operators/debounceTime.ts. Rule ids must match operators/debounceTime.yaml.
 *
 * S  = (lastValue: T | null, lastTime: ℕ | null, task: Timer | null) in phase active | completed | errored | finalized
 * S0 = (∅, ∅, ∅)
 *
 * Time unit: one frame = one virtual millisecond (TestScheduler run mode). RxJS 7 does not cancel the
 * timer on every value: a single task fires `dueTime` after the first value and re-schedules itself for
 * the remaining time when a newer value arrived meanwhile (rule T1), otherwise it emits (rule T2).
 */

export interface DebounceTimeParams {
  readonly dueTime: number;
}

export interface PendingValue {
  readonly value: unknown;
  readonly label: string;
}

export interface ActiveTask {
  readonly id: string;
  readonly dueAt: number;
}

export type DebounceTimeState =
  | {
      readonly phase: 'active';
      readonly lastValue: PendingValue | null;
      readonly lastTime: number | null;
      readonly task: ActiveTask | null;
      readonly seq: number;
    }
  | { readonly phase: 'completed'; readonly lastTime: number | null }
  | { readonly phase: 'errored'; readonly lastTime: number | null }
  | { readonly phase: 'finalized' };

function toNumber(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`debounceTime: parameter ${name} must be a finite number, got ${String(value)}`);
  }
  return value;
}

const fmt = (value: number | null): string => (value === null ? '∅' : String(value));

export const debounceTimeMachine: Machine<DebounceTimeState, DebounceTimeParams> = {
  operator: 'debounceTime',

  normalizeParams(raw): DebounceTimeParams {
    return { dueTime: toNumber('dueTime', raw.dueTime) };
  },

  describeParams(params): string {
    return `debounceTime(${params.dueTime})`;
  },

  initial(): InitialResult<DebounceTimeState> {
    return {
      ruleId: 'S0',
      state: { phase: 'active', lastValue: null, lastTime: null, task: null, seq: 1 },
      outputs: [],
    };
  },

  step(state, input: InputEvent, params, context: StepContext): StepResult<DebounceTimeState> {
    if (input.kind === 'finalize') {
      const cancel = state.phase === 'active' && state.task ? [state.task.id] : [];
      return { ruleId: 'F1', state: { phase: 'finalized' }, outputs: [], cancel };
    }
    if (state.phase !== 'active') {
      return { ruleId: 'X1', state, outputs: [] };
    }
    const now = context.now;
    switch (input.kind) {
      case 'value': {
        const lastValue: PendingValue = { value: input.value, label: formatValue(input.value) };
        if (state.task) {
          return {
            ruleId: 'V2',
            state: { ...state, lastValue, lastTime: now },
            outputs: [],
          };
        }
        const id = `t${state.seq}`;
        return {
          ruleId: 'V1',
          state: {
            phase: 'active',
            lastValue,
            lastTime: now,
            task: { id, dueAt: now + params.dueTime },
            seq: state.seq + 1,
          },
          outputs: [],
          schedule: [{ id, after: params.dueTime }],
        };
      }
      case 'timer': {
        if (!state.task || state.task.id !== input.id || state.lastTime === null || !state.lastValue) {
          return { ruleId: 'X1', state, outputs: [] };
        }
        const targetTime = state.lastTime + params.dueTime;
        if (now < targetTime) {
          const id = `t${state.seq}`;
          return {
            ruleId: 'T1',
            state: { ...state, task: { id, dueAt: targetTime }, seq: state.seq + 1 },
            outputs: [],
            schedule: [{ id, after: targetTime - now }],
          };
        }
        return {
          ruleId: 'T2',
          state: { ...state, lastValue: null, task: null },
          outputs: [{ kind: 'emit', value: state.lastValue.value, label: state.lastValue.label }],
        };
      }
      case 'complete': {
        if (state.task && state.lastValue) {
          return {
            ruleId: 'C1',
            state: { phase: 'completed', lastTime: state.lastTime },
            outputs: [
              { kind: 'emit', value: state.lastValue.value, label: state.lastValue.label },
              { kind: 'complete' },
            ],
            cancel: [state.task.id],
          };
        }
        return {
          ruleId: 'C2',
          state: { phase: 'completed', lastTime: state.lastTime },
          outputs: [{ kind: 'complete' }],
        };
      }
      case 'error':
        return {
          ruleId: 'E1',
          state: { phase: 'errored', lastTime: state.lastTime },
          outputs: [{ kind: 'error', error: input.error, label: input.label }],
          cancel: state.task ? [state.task.id] : [],
        };
    }
  },

  formatState(state): string {
    switch (state.phase) {
      case 'active':
        return `(${state.lastValue ? state.lastValue.label : '∅'}, ${fmt(state.lastTime)}, ${state.task ? `${state.task.id}@${state.task.dueAt}` : '∅'})`;
      case 'completed':
        return `(∅, ${fmt(state.lastTime)}, ∅) completed`;
      case 'errored':
        return `(∅, ${fmt(state.lastTime)}, ∅) errored`;
      case 'finalized':
        return '⊥ finalized';
    }
  },

  snapshot(state): unknown {
    switch (state.phase) {
      case 'active':
        return {
          phase: 'active',
          lastValue: state.lastValue ? state.lastValue.value : null,
          lastTime: state.lastTime,
          task: state.task ? { id: state.task.id, dueAt: state.task.dueAt } : null,
        };
      case 'completed':
      case 'errored':
        return { phase: state.phase, lastTime: state.lastTime };
      case 'finalized':
        return { phase: 'finalized' };
    }
  },

  isTerminal(state): boolean {
    return state.phase !== 'active';
  },
};
