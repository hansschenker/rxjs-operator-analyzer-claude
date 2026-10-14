import { formatValue } from '../core/format';
import type { InitialResult, InputEvent, Machine, OutputEvent, StepResult } from '../core/types';

/**
 * Executable Mealy machine for `windowCount(windowSize, startWindowEvery)` — RxJS 7.8.2,
 * src/internal/operators/windowCount.ts. Rule ids must match operators/windowCount.yaml.
 *
 * S  = (windows: Subject[], count: ℕ) in phase active | completed | errored | finalized
 * S0 = ([w1], 0) and the first window is emitted on subscribe (rule I0).
 */

export interface WindowCountParams {
  readonly windowSize: number;
  readonly rawStartWindowEvery: number;
  /** Normalized: `startWindowEvery > 0 ? startWindowEvery : windowSize`. */
  readonly startEvery: number;
}

export type WindowCountState =
  | {
      readonly phase: 'active';
      readonly windows: readonly string[];
      readonly nextId: number;
      readonly count: number;
    }
  | { readonly phase: 'completed'; readonly count: number }
  | { readonly phase: 'errored'; readonly count: number }
  | { readonly phase: 'finalized' };

function toNumber(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`windowCount: parameter ${name} must be a finite number, got ${String(value)}`);
  }
  return value;
}

export const windowCountMachine: Machine<WindowCountState, WindowCountParams> = {
  operator: 'windowCount',

  normalizeParams(raw): WindowCountParams {
    const windowSize = toNumber('windowSize', raw.windowSize);
    const rawStart = raw.startWindowEvery;
    const rawStartWindowEvery =
      rawStart === undefined || rawStart === null ? 0 : toNumber('startWindowEvery', rawStart);
    return {
      windowSize,
      rawStartWindowEvery,
      startEvery: rawStartWindowEvery > 0 ? rawStartWindowEvery : windowSize,
    };
  },

  describeParams(params): string {
    return params.rawStartWindowEvery === 0
      ? `windowCount(${params.windowSize})`
      : `windowCount(${params.windowSize}, ${params.rawStartWindowEvery})`;
  },

  initial(): InitialResult<WindowCountState> {
    return {
      ruleId: 'I0',
      state: { phase: 'active', windows: ['w1'], nextId: 2, count: 0 },
      outputs: [{ kind: 'windowOpen', window: 'w1' }],
    };
  },

  step(state, input: InputEvent, params): StepResult<WindowCountState> {
    if (input.kind === 'finalize') {
      return { ruleId: 'F1', state: { phase: 'finalized' }, outputs: [] };
    }
    if (state.phase !== 'active') {
      return { ruleId: 'X1', state, outputs: [] };
    }
    switch (input.kind) {
      case 'value': {
        const outputs: OutputEvent[] = state.windows.map((window) => ({
          kind: 'windowNext',
          window,
          value: input.value,
          label: formatValue(input.value),
        }));
        const c = state.count - params.windowSize + 1;
        const closes = c >= 0 && c % params.startEvery === 0 && state.windows.length > 0;
        let windows = state.windows;
        if (closes) {
          outputs.push({ kind: 'windowComplete', window: windows[0] as string });
          windows = windows.slice(1);
        }
        const count = state.count + 1;
        const opens = count % params.startEvery === 0;
        let nextId = state.nextId;
        if (opens) {
          const id = `w${nextId}`;
          nextId += 1;
          windows = [...windows, id];
          outputs.push({ kind: 'windowOpen', window: id });
        }
        const ruleId =
          state.windows.length === 0
            ? opens
              ? 'V6'
              : 'V5'
            : closes
              ? opens
                ? 'V4'
                : 'V2'
              : opens
                ? 'V3'
                : 'V1';
        return { ruleId, state: { phase: 'active', windows, nextId, count }, outputs };
      }
      case 'complete':
        return {
          ruleId: 'C1',
          state: { phase: 'completed', count: state.count },
          outputs: [
            ...state.windows.map((window): OutputEvent => ({ kind: 'windowComplete', window })),
            { kind: 'complete' },
          ],
        };
      case 'error':
        return {
          ruleId: 'E1',
          state: { phase: 'errored', count: state.count },
          outputs: [
            ...state.windows.map(
              (window): OutputEvent => ({
                kind: 'windowError',
                window,
                error: input.error,
                label: input.label,
              }),
            ),
            { kind: 'error', error: input.error, label: input.label },
          ],
        };
      case 'timer':
        return { ruleId: 'X1', state, outputs: [] };
    }
  },

  formatState(state): string {
    switch (state.phase) {
      case 'active':
        return `([${state.windows.join(', ')}], ${state.count})`;
      case 'completed':
        return `(∅, ${state.count}) completed`;
      case 'errored':
        return `(∅, ${state.count}) errored`;
      case 'finalized':
        return '⊥ finalized';
    }
  },

  snapshot(state): unknown {
    switch (state.phase) {
      case 'active':
        return { phase: 'active', windows: [...state.windows], count: state.count };
      case 'completed':
      case 'errored':
        return { phase: state.phase, count: state.count };
      case 'finalized':
        return { phase: 'finalized' };
    }
  },

  isTerminal(state): boolean {
    return state.phase !== 'active';
  },
};
