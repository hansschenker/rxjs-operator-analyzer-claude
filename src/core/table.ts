import type { OperatorSpec, RuleSpec, TraceStep } from './types';

export interface RuleFiring {
  readonly scenario: string;
  readonly frame: number;
}

export interface UnknownRule {
  readonly rule: string;
  readonly scenario: string;
  readonly frame: number;
}

export interface CoverageReport {
  /** Rule id -> every (scenario, frame) where it fired, in table order. */
  readonly byRule: ReadonlyMap<string, readonly RuleFiring[]>;
  /** Reachable rules of the table that never fired. */
  readonly unfired: readonly string[];
  /** Rule ids returned by the machine that are missing from the table. */
  readonly unknown: readonly UnknownRule[];
}

export interface ScenarioSteps {
  readonly scenario: string;
  readonly steps: readonly TraceStep[];
}

export function ruleById(spec: OperatorSpec): ReadonlyMap<string, RuleSpec> {
  return new Map(spec.mealy.transitions.map((r) => [r.id, r]));
}

export function computeCoverage(
  spec: OperatorSpec,
  results: readonly ScenarioSteps[],
): CoverageReport {
  const byRule = new Map<string, RuleFiring[]>();
  for (const rule of spec.mealy.transitions) byRule.set(rule.id, []);
  const unknown: UnknownRule[] = [];

  for (const { scenario, steps } of results) {
    for (const step of steps) {
      const firings = byRule.get(step.rule);
      if (firings) firings.push({ scenario, frame: step.frame });
      else unknown.push({ rule: step.rule, scenario, frame: step.frame });
    }
  }

  const unfired = spec.mealy.transitions
    .filter((r) => r.reachable !== false && (byRule.get(r.id) ?? []).length === 0)
    .map((r) => r.id);

  return { byRule, unfired, unknown };
}

/** Rules grouped by their input symbol, preserving table order. */
export function rulesByInput(spec: OperatorSpec): ReadonlyMap<string, readonly RuleSpec[]> {
  const groups = new Map<string, RuleSpec[]>();
  for (const rule of spec.mealy.transitions) {
    const list = groups.get(rule.input) ?? [];
    list.push(rule);
    groups.set(rule.input, list);
  }
  return groups;
}

/** The input symbol name without its parameter list: `value(v)` -> `value`. */
export function symbolName(symbol: string): string {
  const paren = symbol.indexOf('(');
  return (paren >= 0 ? symbol.slice(0, paren) : symbol).trim();
}
