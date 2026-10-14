import { describe, expect, it } from 'vitest';
import { downstreamLog, simulate } from '../src/core/simulator';
import type { Machine } from '../src/core/types';

/** Toy time-based machine: echo each value 2 frames later, dropping it if a newer value arrives (debounce-like). */
interface EchoState {
  readonly pending?: { readonly id: string; readonly value: unknown; readonly label: string };
  readonly seq: number;
  readonly phase: 'active' | 'done';
}

const echoMachine: Machine<EchoState, { delay: number }> = {
  operator: 'echo',
  normalizeParams: (raw) => ({ delay: typeof raw.delay === 'number' ? raw.delay : 2 }),
  describeParams: (p) => `echo(${p.delay})`,
  initial: () => ({ ruleId: 'S0', state: { seq: 0, phase: 'active' }, outputs: [] }),
  step(state, input, params) {
    switch (input.kind) {
      case 'value': {
        const id = `t${state.seq + 1}`;
        return {
          ruleId: state.pending ? 'V2' : 'V1',
          state: { pending: { id, value: input.value, label: input.label }, seq: state.seq + 1, phase: 'active' },
          outputs: [],
          schedule: [{ id, after: params.delay }],
          cancel: state.pending ? [state.pending.id] : [],
        };
      }
      case 'timer': {
        if (!state.pending || state.pending.id !== input.id) return { ruleId: 'T0', state, outputs: [] };
        return {
          ruleId: 'T1',
          state: { seq: state.seq, phase: 'active' },
          outputs: [{ kind: 'emit', value: state.pending.value, label: state.pending.label }],
        };
      }
      case 'complete':
        return {
          ruleId: 'C1',
          state: { seq: state.seq, phase: 'done' },
          outputs: [
            ...(state.pending ? [{ kind: 'emit' as const, value: state.pending.value, label: state.pending.label }] : []),
            { kind: 'complete' },
          ],
        };
      case 'error':
        return { ruleId: 'E1', state: { seq: state.seq, phase: 'done' }, outputs: [{ kind: 'error', error: input.error, label: '#' }] };
      case 'finalize':
        return { ruleId: 'F1', state: { seq: state.seq, phase: 'done' }, outputs: [] };
    }
  },
  formatState: (s) => (s.pending ? `pending(${s.pending.label})` : s.phase),
  snapshot: (s) => ({ pending: s.pending?.label ?? null, phase: s.phase }),
  isTerminal: (s) => s.phase === 'done',
};

/** Toy machine that arms a timer during subscribe (like windowTime's first close timer). */
const bootMachine: Machine<{ booted: boolean }, Record<string, never>> = {
  operator: 'boot',
  normalizeParams: () => ({}),
  describeParams: () => 'boot()',
  initial: () => ({ ruleId: 'S0', state: { booted: false }, outputs: [], schedule: [{ id: 'boot', after: 2 }] }),
  step(state, input) {
    switch (input.kind) {
      case 'timer':
        return { ruleId: 'B1', state: { booted: true }, outputs: [{ kind: 'emit', value: 'boot', label: 'boot' }] };
      case 'value':
        return { ruleId: 'V1', state, outputs: [{ kind: 'emit', value: input.value, label: input.label }] };
      case 'complete':
        return { ruleId: 'C1', state, outputs: [{ kind: 'complete' }] };
      case 'error':
        return { ruleId: 'E1', state, outputs: [{ kind: 'error', error: input.error, label: '#' }] };
      case 'finalize':
        return { ruleId: 'F1', state, outputs: [] };
    }
  },
  formatState: (s) => (s.booted ? 'booted' : 'booting'),
  snapshot: (s) => s,
  isTerminal: () => false,
};

describe('simulate', () => {
  it('runs timers armed during subscribe before source events of the same frame', () => {
    const result = simulate(bootMachine, { name: 't', params: {}, source: '--a|' });
    expect(downstreamLog(result.downstream)).toEqual(['2 next(boot)', '2 next(a)', '3 complete']);
    expect(result.steps.map((s) => s.input)).toEqual(['subscribe', 'timer(boot)', 'value(a)', 'complete', 'finalize']);
  });

  it('delivers scheduled timers after source events of the same frame and honours cancellation', () => {
    const result = simulate(echoMachine, { name: 't', params: {}, source: '-a-b---|' });
    expect(result.steps.map((s) => `${s.frame}:${s.input}:${s.rule}`)).toEqual([
      '0:subscribe:S0',
      '1:value(a):V1',
      '3:value(b):V2', // arrives in the same frame as timer t1 would fire; source first, t1 cancelled
      '5:timer(t2):T1',
      '7:complete:C1',
      '7:finalize:F1',
    ]);
    expect(downstreamLog(result.downstream)).toEqual(['5 next(b)', '7 complete']);
    expect(result.expected).toBe('-----x-|');
    expect(result.expectedValues).toEqual({ x: 'b' });
  });

  it('appends finalize after an error, dropping the pending timer', () => {
    const result = simulate(echoMachine, { name: 't', params: {}, source: '-a-#' });
    expect(result.steps.map((s) => s.input)).toEqual(['subscribe', 'value(a)', 'error(#)', 'finalize']);
    expect(result.steps.map((s) => s.frame)).toEqual([0, 1, 3, 3]);
    expect(result.expected).toBe('---#');
  });

  it('maps marble letters through the scenario values', () => {
    const result = simulate(echoMachine, { name: 't', params: {}, source: '-a---|', values: { a: 42 } });
    expect(downstreamLog(result.downstream)).toEqual(['3 next(42)', '5 complete']);
    expect(result.steps[1]?.state).toBe('pending(a)');
  });

  it('stores a serializable snapshot on every step', () => {
    const result = simulate(echoMachine, { name: 't', params: {}, source: '-a|' });
    for (const step of result.steps) expect(() => JSON.stringify(step)).not.toThrow();
    expect(result.steps[1]?.data).toEqual({ pending: 'a', phase: 'active' });
  });
});
