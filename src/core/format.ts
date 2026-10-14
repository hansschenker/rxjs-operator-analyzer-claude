import type { InputEvent, OutputEvent, TraceOutput } from './types';

/** Compact, deterministic rendering of a value for marble labels and state strings. */
export function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(formatValue).join(',')}]`;
  if (value instanceof Error) return value.message || value.name;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function describeInput(input: InputEvent | 'subscribe'): string {
  if (input === 'subscribe') return 'subscribe';
  switch (input.kind) {
    case 'value':
      return `value(${input.label})`;
    case 'complete':
      return 'complete';
    case 'error':
      return `error(${input.label})`;
    case 'finalize':
      return 'finalize';
    case 'timer':
      return `timer(${input.id})`;
  }
}

export function toTraceOutput(event: OutputEvent): TraceOutput {
  switch (event.kind) {
    case 'emit':
      return { kind: 'emit', label: event.label };
    case 'complete':
      return { kind: 'complete' };
    case 'error':
      return { kind: 'error', label: event.label };
    case 'windowOpen':
      return { kind: 'windowOpen', window: event.window };
    case 'windowNext':
      return { kind: 'windowNext', window: event.window, label: event.label };
    case 'windowComplete':
      return { kind: 'windowComplete', window: event.window };
    case 'windowError':
      return { kind: 'windowError', window: event.window, label: event.label };
  }
}

/** Human-readable output word letter, e.g. `emit([a,b])`, `w1.next(a)`, `open(w2)`. */
export function describeOutput(output: TraceOutput): string {
  const label = output.label ?? '';
  const window = output.window ?? '';
  switch (output.kind) {
    case 'emit':
      return `emit(${label})`;
    case 'complete':
      return 'complete';
    case 'error':
      return `error(${label})`;
    case 'windowOpen':
      return `open(${window})`;
    case 'windowNext':
      return `${window}.next(${label})`;
    case 'windowComplete':
      return `${window}.complete`;
    case 'windowError':
      return `${window}.error(${label})`;
  }
}

export function describeOutputs(outputs: readonly TraceOutput[]): string {
  return outputs.length === 0 ? 'none' : outputs.map(describeOutput).join(', ');
}

/** Output letters as they appear on the outer (downstream) observable: `|`, `#`, or a value label. */
export function outerLabel(output: TraceOutput): string | undefined {
  switch (output.kind) {
    case 'emit':
      return output.label ?? '';
    case 'complete':
      return '|';
    case 'error':
      return '#';
    case 'windowOpen':
      return output.window ?? '';
    default:
      return undefined;
  }
}

/** Scenario caption without a repeated `params —` prefix (titles conventionally start with the call). */
export function scenarioCaption(params: string, title: string | undefined, name: string): string {
  const caption = title ?? name;
  const prefix = `${params} — `;
  return caption.startsWith(prefix) ? caption.slice(prefix.length) : caption;
}

/** Stable key for structural comparison of two output events (ignores raw values, keeps labels). */
export function outputKey(frame: number, output: TraceOutput): string {
  return `${frame} ${describeOutput(output)}`;
}
