import { isObservable, type OperatorFunction } from 'rxjs';
import { TestScheduler } from 'rxjs/testing';
import { formatValue } from '../core/format';
import { marbleLetters } from '../core/marble';
import type { ScenarioSpec } from '../core/types';

/**
 * Differential-testing harness: runs the REAL RxJS operator over a scenario under TestScheduler
 * and returns `"<frame> <event>"` lines in delivery order — the same format as `downstreamLog()`
 * produces from the Mealy model, so both can be compared with a single `toEqual`.
 */
export function realHistory(
  scenario: Pick<ScenarioSpec, 'source' | 'values'>,
  operator: OperatorFunction<unknown, unknown>,
  assertDeepEqual: (actual: unknown, expected: unknown) => void = (a, e) => {
    if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error('marble assertion failed');
  },
): string[] {
  const log: string[] = [];
  const values: Record<string, unknown> = {};
  for (const letter of marbleLetters(scenario.source)) {
    values[letter] = scenario.values?.[letter] ?? letter;
  }
  const scheduler = new TestScheduler(assertDeepEqual);
  scheduler.run(({ cold }) => {
    const now = (): number => scheduler.now();
    let windows = 0;
    cold(scenario.source, values).pipe(operator).subscribe({
      next: (value) => {
        if (isObservable(value)) {
          const id = `w${++windows}`;
          log.push(`${now()} open(${id})`);
          value.subscribe({
            next: (v) => log.push(`${now()} ${id}.next(${formatValue(v)})`),
            error: () => log.push(`${now()} ${id}.error`),
            complete: () => log.push(`${now()} ${id}.complete`),
          });
          return;
        }
        log.push(`${now()} next(${formatValue(value)})`);
      },
      error: () => log.push(`${now()} error`),
      complete: () => log.push(`${now()} complete`),
    });
  });
  return log;
}
