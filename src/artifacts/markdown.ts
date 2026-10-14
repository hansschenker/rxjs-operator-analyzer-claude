import { describeOutputs, outerLabel } from '../core/format';
import { parseMarble } from '../core/marble';
import { rulesByInput, type CoverageReport } from '../core/table';
import type { OperatorSpec, ScenarioSpec, TraceStep } from '../core/types';

/* ----------------------------------------------------------------------------
 * Shared helpers
 * ------------------------------------------------------------------------- */

export function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function code(value: string): string {
  return value === '' ? '' : `\`${value.replace(/`/g, 'ˋ')}\``;
}

export function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.map(cell).join(' | ')} |`;
  return [line(headers), `|${headers.map(() => '---').join('|')}|`, ...rows.map(line)].join('\n');
}

function paramsLabel(scenario: ScenarioSpec): string {
  return Object.entries(scenario.params)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ');
}

/* ----------------------------------------------------------------------------
 * Artifact 1: 6-tuple formal specification
 * ------------------------------------------------------------------------- */

export function renderSpecMarkdown(spec: OperatorSpec): string {
  const m = spec.mealy;
  const out: string[] = [];
  out.push(`# ${spec.operator} — Mealy 6-tuple formal specification`);
  out.push('');
  if (spec.source) {
    out.push(`**Baseline:** ${spec.source.package} ${spec.source.version} — ${code(spec.source.path)}  `);
  }
  out.push(`**Category:** ${spec.category}  `);
  out.push(`**Signature:** ${code(spec.signature)}`);
  out.push('');
  if (spec.description) {
    out.push(`> ${spec.description.trim().replace(/\n/g, '\n> ')}`);
    out.push('');
  }
  if (spec.parameters.length > 0) {
    out.push('## Parameters');
    out.push('');
    out.push(
      table(
        ['Name', 'Type', 'Default', 'Normalized', 'Description'],
        spec.parameters.map((p) => [
          code(p.name),
          code(p.type),
          p.default === undefined ? '' : code(p.default),
          p.normalized === undefined ? '' : code(p.normalized),
          p.description ?? '',
        ]),
      ),
    );
    out.push('');
  }

  out.push('## 1. State space — S');
  out.push('');
  out.push(code(m.stateSpace.notation));
  out.push('');
  if (m.stateSpace.description) {
    out.push(m.stateSpace.description.trim());
    out.push('');
  }
  if (m.stateSpace.components.length > 0) {
    out.push(
      table(
        ['Component', 'Type', 'Description'],
        m.stateSpace.components.map((c) => [code(c.name), code(c.type), c.description ?? '']),
      ),
    );
    out.push('');
  }
  if (m.stateSpace.invariants.length > 0) {
    out.push('**Invariants**');
    out.push('');
    for (const inv of m.stateSpace.invariants) out.push(`- ${inv}`);
    out.push('');
  }

  out.push('## 2. Initial state — S₀');
  out.push('');
  out.push(code(m.initialState.notation));
  out.push('');
  if (m.initialState.description) {
    out.push(m.initialState.description.trim());
    out.push('');
  }

  out.push('## 3. Input alphabet — Z');
  out.push('');
  out.push(`Z = { ${m.inputAlphabet.map((s) => s.symbol).join(', ')} }`);
  out.push('');
  out.push(table(['Symbol', 'Meaning'], m.inputAlphabet.map((s) => [code(s.symbol), s.description ?? ''])));
  out.push('');

  out.push('## 4. Output alphabet — A');
  out.push('');
  out.push(`A = { ${m.outputAlphabet.map((s) => s.symbol).join(', ')} }`);
  out.push('');
  out.push(table(['Symbol', 'Meaning'], m.outputAlphabet.map((s) => [code(s.symbol), s.description ?? ''])));
  out.push('');

  const groups = rulesByInput(spec);

  out.push('## 5. Transition function — T : S × Z → S');
  out.push('');
  for (const [input, rules] of groups) {
    out.push(`### T(s, ${input})`);
    out.push('');
    for (const r of rules) {
      const unreachable = r.reachable === false ? ' _(not reachable through the subscription protocol)_' : '';
      out.push(`- **${r.id}** — state ${code(r.state)}, when ${r.guard}:  T = ${code(r.next)}${unreachable}`);
    }
    out.push('');
  }

  out.push('## 6. Output function — G : S × Z → A*');
  out.push('');
  for (const [input, rules] of groups) {
    out.push(`### G(s, ${input})`);
    out.push('');
    for (const r of rules) {
      const word = r.outputs.length === 0 ? '[] (none)' : `[${r.outputs.join('; ')}]`;
      out.push(`- **${r.id}** — when ${r.guard}:  G = ${code(word)}`);
      if (r.note) out.push(`  - ${r.note}`);
    }
    out.push('');
  }

  if (spec.scenarios.length > 0) {
    out.push('## Scenarios');
    out.push('');
    out.push(
      table(
        ['Scenario', 'Parameters', 'Source', 'Expected (outer)', 'Rules fired'],
        spec.scenarios.map((s) => [
          s.name,
          code(paramsLabel(s)),
          code(s.source),
          s.expected === undefined ? '' : code(s.expected),
          s.trace ? [...new Set(s.trace.map((t) => t.rule))].join(' ') : '',
        ]),
      ),
    );
    out.push('');
  }
  return out.join('\n');
}

/* ----------------------------------------------------------------------------
 * Artifact 2: State Transition Table
 * ------------------------------------------------------------------------- */

export function renderTableMarkdown(spec: OperatorSpec, coverage?: CoverageReport): string {
  const headers = ['Rule', 'State s', 'Input z', 'Guard', 'T(s, z) → s′', 'G(s, z)', 'Evidence'];
  if (coverage) headers.push('Fired in');
  const rows = spec.mealy.transitions.map((r) => {
    const row = [
      r.reachable === false ? `${r.id} ⁽ᵘ⁾` : r.id,
      code(r.state),
      code(r.input),
      r.guard,
      code(r.next),
      r.outputs.length === 0 ? 'none' : code(r.outputs.join('; ')),
      r.evidence ?? '',
    ];
    if (coverage) {
      const firings = coverage.byRule.get(r.id) ?? [];
      const scenarios = [...new Set(firings.map((f) => f.scenario))];
      row.push(scenarios.length === 0 ? (r.reachable === false ? '— (unreachable)' : '**never**') : scenarios.join(', '));
    }
    return row;
  });
  const out: string[] = [];
  out.push(`# ${spec.operator} — State Transition Table`);
  out.push('');
  out.push(`One row per guarded (state, input) pair. T gives the next state, G the ordered output word. ⁽ᵘ⁾ = listed for totality, unreachable.`);
  out.push('');
  out.push(table(headers, rows));
  out.push('');
  if (coverage) {
    out.push('## Coverage');
    out.push('');
    const total = spec.mealy.transitions.filter((r) => r.reachable !== false).length;
    const fired = total - coverage.unfired.length;
    out.push(`- reachable rules: ${total}, fired by at least one scenario: ${fired}`);
    if (coverage.unfired.length > 0) out.push(`- **never fired:** ${coverage.unfired.join(', ')}`);
    if (coverage.unknown.length > 0) {
      out.push(`- **fired but missing from the table:** ${coverage.unknown.map((u) => `${u.rule} (${u.scenario} @${u.frame})`).join(', ')}`);
    }
    out.push('');
  }
  return out.join('\n');
}

/* ----------------------------------------------------------------------------
 * Artifact 3: Execution trace (step list + 4-lane column view)
 * ------------------------------------------------------------------------- */

export interface LaneRow {
  readonly lane: string;
  readonly cells: readonly string[];
}

/** The 4 lanes as frame-indexed columns (what the ASCII/Markdown trace shows). */
export function laneRows(scenario: ScenarioSpec, steps: readonly TraceStep[]): LaneRow[] {
  const source = parseMarble(scenario.source);
  const frames = Math.max(...source.map((e) => e.frame), ...steps.map((s) => s.frame), 0) + 1;
  const blank = (): string[] => Array.from({ length: frames }, () => '');
  const put = (row: string[], frame: number, value: string): void => {
    row[frame] = row[frame] ? `${row[frame]} ${value}` : value;
  };

  const timeline = Array.from({ length: frames }, (_, f) => String(f));
  const input = blank();
  for (const e of source) put(input, e.frame, e.letter);

  const rule = blank();
  const state = blank();
  const output = blank();
  const windows = new Map<string, string[]>();
  for (const s of steps) {
    put(rule, s.frame, s.rule);
    if (s.kind !== 'finalize' || !state[s.frame]) state[s.frame] = s.state;
    for (const o of s.outputs) {
      const label = outerLabel(o);
      if (label !== undefined) put(output, s.frame, label);
      if (o.window && (o.kind === 'windowNext' || o.kind === 'windowComplete' || o.kind === 'windowError')) {
        const row = windows.get(o.window) ?? blank();
        put(row, s.frame, o.kind === 'windowNext' ? (o.label ?? '') : o.kind === 'windowComplete' ? '|' : '#');
        windows.set(o.window, row);
      }
      if (o.window && o.kind === 'windowOpen' && !windows.has(o.window)) windows.set(o.window, blank());
    }
  }
  const rows: LaneRow[] = [
    { lane: '1 timeline', cells: timeline },
    { lane: '2 input', cells: input },
    { lane: '3 rule', cells: rule },
    { lane: '3 state', cells: state },
    { lane: '4 output', cells: output },
  ];
  for (const [id, cells] of windows) rows.push({ lane: `4 ${id}`, cells });
  return rows;
}

export function renderLaneTable(scenario: ScenarioSpec, steps: readonly TraceStep[]): string {
  const rows = laneRows(scenario, steps);
  const first = rows[0];
  if (!first) return '';
  return table(['lane', ...first.cells.map((c) => `f${c}`)], rows.map((r) => [r.lane, ...r.cells]));
}

/** Fixed-width text version of the lane table for terminals. */
export function renderLaneText(scenario: ScenarioSpec, steps: readonly TraceStep[]): string {
  const rows = laneRows(scenario, steps);
  const first = rows[0];
  if (!first) return '';
  const widths = first.cells.map((_, f) => Math.max(1, ...rows.map((r) => (r.cells[f] ?? '').length)));
  const laneW = Math.max(...rows.map((r) => r.lane.length));
  return rows
    .map((r) => `${r.lane.padEnd(laneW)} │ ${r.cells.map((c, f) => (c === '' ? '·' : c).padEnd(widths[f] ?? 1)).join(' ')}`)
    .join('\n');
}

export function renderTraceMarkdown(scenario: ScenarioSpec, params: string, steps: readonly TraceStep[]): string {
  const out: string[] = [];
  out.push(`## ${scenario.name} — ${code(params)}`);
  out.push('');
  if (scenario.title) {
    out.push(scenario.title);
    out.push('');
  }
  out.push(`- source: ${code(scenario.source)}`);
  if (scenario.expected !== undefined) {
    out.push(`- expected outer marble: ${code(scenario.expected)}${scenario.expectedValues ? ` with ${code(JSON.stringify(scenario.expectedValues))}` : ''}`);
  }
  out.push(`- rules fired: ${[...new Set(steps.map((s) => s.rule))].join(' → ')}`);
  out.push('');
  out.push('### Steps');
  out.push('');
  out.push(
    table(
      ['#', 'Frame', 'Input z', 'Rule', 'State after T(s, z)', 'Outputs G(s, z)'],
      steps.map((s, i) => [String(i), String(s.frame), code(s.input), s.rule, code(s.state), code(describeOutputs(s.outputs))]),
    ),
  );
  out.push('');
  out.push('### Lanes');
  out.push('');
  out.push(renderLaneTable(scenario, steps));
  out.push('');
  return out.join('\n');
}

export function renderTracesMarkdown(spec: OperatorSpec, traces: readonly { scenario: ScenarioSpec; params: string; steps: readonly TraceStep[] }[]): string {
  const out: string[] = [`# ${spec.operator} — Execution traces`, ''];
  out.push('Every scenario is simulated by the executable Mealy model; each step shows the input, the rule that fired, the state after T and the output word G.');
  out.push('');
  for (const t of traces) out.push(renderTraceMarkdown(t.scenario, t.params, t.steps));
  return out.join('\n');
}
