import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TestScheduler } from 'rxjs/testing';
import { downstreamLog, simulate } from '../src/core/simulator';
import { computeCoverage } from '../src/core/table';
import type { OperatorSpec } from '../src/core/types';
import { hasErrors, sameTrace, validateSpec } from '../src/core/validate';
import { parseOperatorYaml } from '../src/core/yaml-io';
import { getMachine, registry } from '../src/machines/registry';
import { realHistory } from '../src/testing/real-rxjs';

const operatorsDir = join(__dirname, '..', 'operators');
const specs: OperatorSpec[] = readdirSync(operatorsDir)
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => parseOperatorYaml(readFileSync(join(operatorsDir, f), 'utf8')));

describe.each(specs.map((spec) => [spec.operator, spec] as const))('%s', (_name, spec) => {
  const { machine, real, higherOrder } = getMachine(spec.operator);
  const results = spec.scenarios.map((scenario) => simulate(machine, scenario));

  it('has a registered executable machine', () => {
    expect(Object.keys(registry)).toContain(spec.operator);
  });

  it('validates without errors', () => {
    const diagnostics = validateSpec(spec, { results, knownOperators: Object.keys(registry) });
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(hasErrors(diagnostics)).toBe(false);
  });

  it('fires every reachable rule of the transition table and no unknown rule', () => {
    const coverage = computeCoverage(spec, results);
    expect(coverage.unknown).toEqual([]);
    expect(coverage.unfired).toEqual([]);
  });

  it('keeps the stored YAML traces in sync with the model', () => {
    for (const scenario of spec.scenarios) {
      const result = results.find((r) => r.scenario === scenario.name);
      expect(result, scenario.name).toBeDefined();
      if (!result) continue;
      expect(scenario.trace, `${scenario.name} has a trace (run analyze)`).toBeDefined();
      if (scenario.trace) expect(sameTrace(scenario.trace, result.steps), scenario.name).toBe(true);
      expect(scenario.expected, scenario.name).toBe(result.expected);
    }
  });

  describe.each(spec.scenarios.map((s) => [s.name, s] as const))('scenario %s', (_scenarioName, scenario) => {
    const result = results.find((r) => r.scenario === scenario.name);

    it('model history equals the real RxJS operator history (differential test)', () => {
      expect(result).toBeDefined();
      if (!result) return;
      const actual = realHistory(scenario, real(scenario.params), (a, e) => expect(a).toEqual(e));
      expect(actual).toEqual(downstreamLog(result.downstream));
    });

    it('expected outer marble matches TestScheduler.expectObservable', () => {
      if (!result || higherOrder || !result.expectedExact) return;
      const scheduler = new TestScheduler((a, e) => expect(a).toEqual(e));
      scheduler.run(({ cold, expectObservable }) => {
        const values: Record<string, unknown> = {};
        for (const letter of scenario.source.replace(/[^a-zA-Z]/g, '')) values[letter] = scenario.values?.[letter] ?? letter;
        expectObservable(cold(scenario.source, values).pipe(real(scenario.params))).toBe(result.expected, result.expectedValues);
      });
    });
  });
});
