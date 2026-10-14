import { parseMarble } from './marble';
import { computeCoverage } from './table';
import type { Diagnostic, OperatorSpec, SimulationResult, TraceStep } from './types';

export interface ValidateOptions {
  /** Fresh simulation results; enables coverage and freshness checks. */
  readonly results?: readonly SimulationResult[];
  /** Operators with an executable machine; a spec without one gets a warning. */
  readonly knownOperators?: readonly string[];
}

const RESERVED_INPUTS = new Set(['subscribe']);

function symbolName(symbol: string): string {
  const paren = symbol.indexOf('(');
  return (paren >= 0 ? symbol.slice(0, paren) : symbol).trim();
}

/** Semantic checks on top of the structural zod schema. */
export function validateSpec(spec: OperatorSpec, options: ValidateOptions = {}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const error = (code: string, message: string, path?: string): void => {
    diagnostics.push({ severity: 'error', code, message, ...(path ? { path } : {}) });
  };
  const warning = (code: string, message: string, path?: string): void => {
    diagnostics.push({ severity: 'warning', code, message, ...(path ? { path } : {}) });
  };

  if (options.knownOperators && !options.knownOperators.includes(spec.operator)) {
    warning(
      'no-machine',
      `no executable machine for "${spec.operator}"; traces cannot be generated`,
      'operator',
    );
  }

  const inputSymbols = new Set(spec.mealy.inputAlphabet.map((s) => symbolName(s.symbol)));
  const seen = new Set<string>();
  spec.mealy.transitions.forEach((rule, i) => {
    const path = `mealy.transitions[${i}]`;
    if (seen.has(rule.id)) error('duplicate-rule', `duplicate rule id "${rule.id}"`, path);
    seen.add(rule.id);
    const input = symbolName(rule.input);
    if (!inputSymbols.has(input) && !RESERVED_INPUTS.has(input)) {
      error(
        'unknown-input',
        `rule ${rule.id} uses input "${rule.input}" which is not in the input alphabet Z`,
        path,
      );
    }
    if (rule.guard.trim() === '') warning('empty-guard', `rule ${rule.id} has an empty guard`, path);
    if (rule.next.trim() === '') error('empty-next', `rule ${rule.id} has no next state (T)`, path);
    if (!rule.evidence) warning('no-evidence', `rule ${rule.id} cites no source evidence`, path);
  });

  const key = (r: { input: string; state: string; guard: string }): string =>
    `${symbolName(r.input)}|${r.state}|${r.guard}`;
  const keys = new Map<string, string>();
  for (const rule of spec.mealy.transitions) {
    const k = key(rule);
    const other = keys.get(k);
    if (other) {
      error(
        'ambiguous-rule',
        `rules ${other} and ${rule.id} share the same (state, input, guard) and would be non-deterministic`,
      );
    }
    keys.set(k, rule.id);
  }

  const paramNames = new Set(spec.parameters.map((p) => p.name));
  const scenarioNames = new Set<string>();
  spec.scenarios.forEach((scenario, i) => {
    const path = `scenarios[${i}]`;
    if (scenarioNames.has(scenario.name)) {
      error('duplicate-scenario', `duplicate scenario name "${scenario.name}"`, path);
    }
    scenarioNames.add(scenario.name);
    try {
      parseMarble(scenario.source);
    } catch (e) {
      error('marble', `scenario "${scenario.name}": ${(e as Error).message}`, `${path}.source`);
    }
    for (const name of Object.keys(scenario.params)) {
      if (!paramNames.has(name)) {
        warning(
          'unknown-param',
          `scenario "${scenario.name}" sets parameter "${name}" which is not declared`,
          `${path}.params.${name}`,
        );
      }
    }
    if (!scenario.trace) {
      warning('no-trace', `scenario "${scenario.name}" has no generated trace; run analyze`, path);
    }
  });

  if (options.results) {
    const coverage = computeCoverage(spec, options.results);
    for (const u of coverage.unknown) {
      error(
        'unknown-rule',
        `machine fired rule "${u.rule}" (scenario "${u.scenario}", frame ${u.frame}) which is not in the transition table`,
      );
    }
    for (const id of coverage.unfired) {
      warning('unfired-rule', `rule ${id} never fires in any scenario`);
    }
    for (const result of options.results) {
      const scenario = spec.scenarios.find((s) => s.name === result.scenario);
      if (scenario?.trace && !sameTrace(scenario.trace, result.steps)) {
        warning('stale-trace', `scenario "${result.scenario}" has a stale trace; run analyze`);
      }
    }
  }

  return diagnostics;
}

export function sameTrace(a: readonly TraceStep[], b: readonly TraceStep[]): boolean {
  return JSON.stringify(a.map(normalizeStep)) === JSON.stringify(b.map(normalizeStep));
}

function normalizeStep(step: TraceStep): unknown {
  return {
    frame: step.frame,
    kind: step.kind,
    input: step.input,
    rule: step.rule,
    state: step.state,
    data: step.data ?? null,
    outputs: step.outputs.map((o) => ({
      kind: o.kind,
      label: o.label ?? null,
      window: o.window ?? null,
    })),
  };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = d.path ? ` (${d.path})` : '';
  return `${d.severity === 'error' ? 'ERROR' : 'WARN '} [${d.code}] ${d.message}${where}`;
}
