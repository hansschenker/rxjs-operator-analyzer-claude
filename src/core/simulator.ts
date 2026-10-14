import { describeInput, formatValue, toTraceOutput } from './format';
import { expectedLetters, formatMarble, parseMarble, type MarbleEvent } from './marble';
import type {
  DownstreamEvent,
  InputEvent,
  Machine,
  OutputEvent,
  SimulationResult,
  TraceStep,
} from './types';

export interface ScenarioInput {
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly source: string;
  readonly values?: Readonly<Record<string, unknown>>;
}

export interface SimulateOptions {
  /** Safety valve against machines that schedule timers forever. */
  readonly maxSteps?: number;
  /** Store `machine.snapshot(state)` on every step (default true). */
  readonly includeData?: boolean;
}

interface Queued {
  readonly frame: number;
  readonly order: number;
  readonly input: InputEvent;
  readonly timerId?: string;
}

/** Scheduled timers run after source events that share the same frame. */
const TIMER_ORDER_BASE = 1_000_000;

export function toInputEvent(
  event: MarbleEvent,
  values: Readonly<Record<string, unknown>>,
): InputEvent {
  switch (event.kind) {
    case 'value': {
      const value = Object.prototype.hasOwnProperty.call(values, event.letter)
        ? values[event.letter]
        : event.letter;
      return { kind: 'value', value, label: event.letter };
    }
    case 'complete':
      return { kind: 'complete' };
    case 'error': {
      const error = Object.prototype.hasOwnProperty.call(values, '#') ? values['#'] : 'error';
      return { kind: 'error', error, label: '#' };
    }
  }
}

function isTerminalOutput(outputs: readonly OutputEvent[]): boolean {
  return outputs.some((o) => o.kind === 'complete' || o.kind === 'error');
}

/**
 * Run a machine over a scenario's source marble and return the full trace.
 *
 * Protocol (mirrors an RxJS subscription):
 *   frame 0        `subscribe`  -> machine.initial()
 *   source frames  `value` / `complete` / `error` in marble order, timers after them in the same frame
 *   after a terminal input or terminal output, a synthetic `finalize` is delivered in the same frame
 */
export function simulate<S, P>(
  machine: Machine<S, P>,
  scenario: ScenarioInput,
  options: SimulateOptions = {},
): SimulationResult {
  const maxSteps = options.maxSteps ?? 10_000;
  const includeData = options.includeData ?? true;
  const params = machine.normalizeParams(scenario.params);
  const values = scenario.values ?? {};
  const marble = parseMarble(scenario.source);

  const queue: Queued[] = marble.map((e, i) => ({
    frame: e.frame,
    order: i,
    input: toInputEvent(e, values),
  }));
  let timerSeq = 0;

  const steps: TraceStep[] = [];
  const downstream: DownstreamEvent[] = [];

  const record = (
    frame: number,
    kind: TraceStep['kind'],
    input: string,
    rule: string,
    state: S,
    outputs: readonly OutputEvent[],
  ): void => {
    const step: TraceStep = {
      frame,
      kind,
      input,
      rule,
      state: machine.formatState(state, params),
      ...(includeData ? { data: machine.snapshot(state) } : {}),
      outputs: outputs.map(toTraceOutput),
    };
    steps.push(step);
    for (const event of outputs) downstream.push({ frame, event });
  };

  const init = machine.initial(params);
  let state = init.state;
  record(0, 'subscribe', 'subscribe', init.ruleId, state, init.outputs);

  let terminated = isTerminalOutput(init.outputs) || machine.isTerminal(state);
  let currentFrame = 0;

  while (!terminated && queue.length > 0) {
    queue.sort((a, b) => a.frame - b.frame || a.order - b.order);
    const next = queue.shift() as Queued;
    currentFrame = next.frame;

    const result = machine.step(state, next.input, params);
    state = result.state;
    record(next.frame, next.input.kind, describeInput(next.input), result.ruleId, state, result.outputs);

    if (result.cancel) {
      for (const id of result.cancel) {
        const idx = queue.findIndex((q) => q.timerId === id);
        if (idx >= 0) queue.splice(idx, 1);
      }
    }
    if (result.schedule) {
      for (const timer of result.schedule) {
        queue.push({
          frame: next.frame + timer.after,
          order: TIMER_ORDER_BASE + timerSeq++,
          input: { kind: 'timer', id: timer.id },
          timerId: timer.id,
        });
      }
    }

    terminated =
      next.input.kind === 'complete' ||
      next.input.kind === 'error' ||
      isTerminalOutput(result.outputs) ||
      machine.isTerminal(state);

    if (steps.length > maxSteps) {
      throw new Error(`simulation of ${scenario.name} exceeded ${maxSteps} steps`);
    }
  }

  if (terminated) {
    const fin = machine.step(state, { kind: 'finalize' }, params);
    state = fin.state;
    record(currentFrame, 'finalize', 'finalize', fin.ruleId, state, fin.outputs);
  }

  const { expected, expectedExact, expectedValues } = expectedFromDownstream(downstream);

  return {
    scenario: scenario.name,
    params: machine.describeParams(params),
    steps,
    downstream,
    expected,
    expectedExact,
    expectedValues,
  };
}

/** Outer-observable marble for the downstream events (emit / windowOpen / complete / error). */
export function expectedFromDownstream(downstream: readonly DownstreamEvent[]): {
  expected: string;
  expectedExact: boolean;
  expectedValues: Record<string, unknown>;
} {
  const letters = expectedLetters();
  const expectedValues: Record<string, unknown> = {};
  const marbleEvents: { frame: number; letter: string }[] = [];
  let n = 0;
  let exact = true;
  for (const { frame, event } of downstream) {
    switch (event.kind) {
      case 'emit':
      case 'windowOpen': {
        const letter = letters[n] ?? 'z';
        if (n >= letters.length) exact = false;
        n++;
        expectedValues[letter] = event.kind === 'emit' ? event.value : event.window;
        marbleEvents.push({ frame, letter });
        break;
      }
      case 'complete':
        marbleEvents.push({ frame, letter: '|' });
        break;
      case 'error':
        marbleEvents.push({ frame, letter: '#' });
        break;
      default:
        break;
    }
  }
  const formatted = formatMarble(marbleEvents);
  return {
    expected: formatted.marble,
    expectedExact: exact && formatted.exact,
    expectedValues,
  };
}

/** `frame label` lines for every output event, the comparison form used by the differential tests. */
export function downstreamLog(downstream: readonly DownstreamEvent[]): string[] {
  return downstream.map(({ frame, event }) => `${frame} ${logLabel(event)}`);
}

export function logLabel(event: OutputEvent): string {
  switch (event.kind) {
    case 'emit':
      return `next(${formatValue(event.value)})`;
    case 'complete':
      return 'complete';
    case 'error':
      return 'error';
    case 'windowOpen':
      return `open(${event.window})`;
    case 'windowNext':
      return `${event.window}.next(${formatValue(event.value)})`;
    case 'windowComplete':
      return `${event.window}.complete`;
    case 'windowError':
      return `${event.window}.error`;
  }
}
