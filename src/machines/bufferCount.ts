import { formatValue } from '../core/format';
import type { InitialResult, InputEvent, Machine, OutputEvent, StepResult } from '../core/types';

/**
 * Executable Mealy machine for `bufferCount(bufferSize, startBufferEvery)` — RxJS 7.8.2,
 * src/internal/operators/bufferCount.ts. Rule ids must match operators/bufferCount.yaml.
 *
 * S  = (buffers: T[][], count: ℕ) in phase active | completed | errored | finalized
 * S0 = ([], 0)
 */

export interface BufferCountParams {
  readonly bufferSize: number;
  /** Normalized: `startBufferEvery ?? bufferSize` (0 is kept as 0, exactly like the source). */
  readonly startBufferEvery: number;
  readonly rawStartBufferEvery: number | null;
}

export type BufferCountState =
  | {
      readonly phase: 'active';
      readonly buffers: ReadonlyArray<ReadonlyArray<unknown>>;
      readonly count: number;
    }
  | { readonly phase: 'completed'; readonly count: number }
  | { readonly phase: 'errored'; readonly count: number }
  | { readonly phase: 'finalized' };

function toNumber(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`bufferCount: parameter ${name} must be a finite number, got ${String(value)}`);
  }
  return value;
}

function emit(buffer: ReadonlyArray<unknown>): OutputEvent {
  return { kind: 'emit', value: [...buffer], label: formatValue(buffer) };
}

export const bufferCountMachine: Machine<BufferCountState, BufferCountParams> = {
  operator: 'bufferCount',

  normalizeParams(raw): BufferCountParams {
    const bufferSize = toNumber('bufferSize', raw.bufferSize);
    const rawStart = raw.startBufferEvery;
    const rawStartBufferEvery = rawStart === undefined || rawStart === null ? null : toNumber('startBufferEvery', rawStart);
    return {
      bufferSize,
      startBufferEvery: rawStartBufferEvery ?? bufferSize,
      rawStartBufferEvery,
    };
  },

  describeParams(params): string {
    return params.rawStartBufferEvery === null
      ? `bufferCount(${params.bufferSize})`
      : `bufferCount(${params.bufferSize}, ${params.rawStartBufferEvery})`;
  },

  initial(): InitialResult<BufferCountState> {
    return { ruleId: 'S0', state: { phase: 'active', buffers: [], count: 0 }, outputs: [] };
  },

  step(state, input: InputEvent, params): StepResult<BufferCountState> {
    if (input.kind === 'finalize') {
      return { ruleId: 'F1', state: { phase: 'finalized' }, outputs: [] };
    }
    if (state.phase !== 'active') {
      return { ruleId: 'X1', state, outputs: [] };
    }
    switch (input.kind) {
      case 'value': {
        const opens = state.count % params.startBufferEvery === 0;
        const withNew = opens ? [...state.buffers, []] : state.buffers;
        if (withNew.length === 0) {
          return {
            ruleId: 'V5',
            state: { phase: 'active', buffers: [], count: state.count + 1 },
            outputs: [],
          };
        }
        const appended = withNew.map((b) => [...b, input.value]);
        const full = appended.filter((b) => params.bufferSize <= b.length);
        const remaining = appended.filter((b) => b.length < params.bufferSize);
        const ruleId = opens ? (full.length > 0 ? 'V2' : 'V1') : full.length > 0 ? 'V4' : 'V3';
        return {
          ruleId,
          state: { phase: 'active', buffers: remaining, count: state.count + 1 },
          outputs: full.map(emit),
        };
      }
      case 'complete':
        return {
          ruleId: state.buffers.length > 0 ? 'C1' : 'C2',
          state: { phase: 'completed', count: state.count },
          outputs: [...state.buffers.map(emit), { kind: 'complete' }],
        };
      case 'error':
        return {
          ruleId: 'E1',
          state: { phase: 'errored', count: state.count },
          outputs: [{ kind: 'error', error: input.error, label: input.label }],
        };
      case 'timer':
        return { ruleId: 'X1', state, outputs: [] };
    }
  },

  formatState(state): string {
    switch (state.phase) {
      case 'active':
        return `([${state.buffers.map((b) => formatValue(b)).join(', ')}], ${state.count})`;
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
        return { phase: 'active', buffers: state.buffers.map((b) => [...b]), count: state.count };
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
