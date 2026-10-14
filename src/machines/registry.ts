import { bufferCount, debounceTime, windowCount, windowTime, type OperatorFunction } from 'rxjs';
import type { Machine } from '../core/types';
import { bufferCountMachine } from './bufferCount';
import { debounceTimeMachine } from './debounceTime';
import { windowCountMachine } from './windowCount';
import { windowTimeMachine } from './windowTime';

/** A machine with its type parameters erased, for registry and CLI use. */
export type AnyMachine = Machine<unknown, unknown>;

export interface RegistryEntry {
  readonly machine: AnyMachine;
  /** true when the real operator emits inner observables (windows). */
  readonly higherOrder: boolean;
  /** Builds the real RxJS operator from the scenario's raw params (for differential testing). */
  real(params: Readonly<Record<string, unknown>>): OperatorFunction<unknown, unknown>;
}

function numberOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === 'number' ? value : fallback;
}

const windowTimeRegistryEntry: RegistryEntry = {
  machine: windowTimeMachine as unknown as AnyMachine,
  higherOrder: true,
  real(params): OperatorFunction<unknown, unknown> {
    const span = numberOr(params.windowTimeSpan, 0);
    const interval = params.windowCreationInterval;
    const max = params.maxWindowSize;
    if (typeof max === 'number') {
      return windowTime<unknown>(span, typeof interval === 'number' ? interval : null, max);
    }
    if (typeof interval === 'number') return windowTime<unknown>(span, interval);
    return windowTime<unknown>(span);
  },
};

export const registry: Readonly<Record<string, RegistryEntry>> = {
  bufferCount: {
    machine: bufferCountMachine as unknown as AnyMachine,
    higherOrder: false,
    real(params): OperatorFunction<unknown, unknown> {
      return bufferCount<unknown>(
        numberOr(params.bufferSize, 0),
        numberOr(params.startBufferEvery, null),
      ) as OperatorFunction<unknown, unknown>;
    },
  },
  debounceTime: {
    machine: debounceTimeMachine as unknown as AnyMachine,
    higherOrder: false,
    real(params): OperatorFunction<unknown, unknown> {
      return debounceTime<unknown>(numberOr(params.dueTime, 0));
    },
  },
  windowCount: {
    machine: windowCountMachine as unknown as AnyMachine,
    higherOrder: true,
    real(params): OperatorFunction<unknown, unknown> {
      return windowCount<unknown>(
        numberOr(params.windowSize, 0),
        numberOr(params.startWindowEvery, 0),
      ) as OperatorFunction<unknown, unknown>;
    },
  },
  windowTime: windowTimeRegistryEntry,
};

export function getMachine(operator: string): RegistryEntry {
  const entry = registry[operator];
  if (!entry) {
    throw new Error(
      `no executable machine registered for operator "${operator}" (known: ${Object.keys(registry).join(', ')})`,
    );
  }
  return entry;
}

export function hasMachine(operator: string): boolean {
  return Object.prototype.hasOwnProperty.call(registry, operator);
}
