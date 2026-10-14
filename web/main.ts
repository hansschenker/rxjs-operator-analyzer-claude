import { describeOutputs, scenarioCaption } from '../src/core/format';
import type { OperatorSpec, RuleSpec, ScenarioSpec, TraceStep } from '../src/core/types';
import { parseOperatorYaml } from '../src/core/yaml-io';
import { renderRuleTableHtml, renderStepsTableHtml } from '../src/render/html';
import { renderTimelineSvg } from '../src/render/timeline-svg';

/**
 * Framework-less web viewer. It reads ONLY the operator YAML files (with their generated traces):
 * no operator code runs in the browser, which is the point — the YAML state transition table and
 * its traces are the complete analysis.
 */

const files = import.meta.glob('../operators/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const specs: OperatorSpec[] = Object.entries(files)
  .map(([path, text]) => {
    try {
      return parseOperatorYaml(text);
    } catch (e) {
      console.error(`cannot parse ${path}`, e);
      return undefined;
    }
  })
  .filter((s): s is OperatorSpec => s !== undefined)
  .sort((a, b) => a.operator.localeCompare(b.operator));

function $<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function paramsLabel(spec: OperatorSpec, scenario: ScenarioSpec): string {
  const args = spec.parameters.map((p) => scenario.params[p.name]).map((v) => (v === undefined ? undefined : JSON.stringify(v)));
  while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
  return `${spec.operator}(${args.map((a) => a ?? 'undefined').join(', ')})`;
}

const operatorSelect = $<HTMLSelectElement>('operator');
const scenarioSelect = $<HTMLSelectElement>('scenario');
const frameWidthInput = $<HTMLInputElement>('frame-width');
const frameWidthLabel = $<HTMLSpanElement>('frame-width-label');

function currentSpec(): OperatorSpec | undefined {
  return specs.find((s) => s.operator === operatorSelect.value);
}

function fillOperators(): void {
  operatorSelect.innerHTML = specs.map((s) => `<option value="${esc(s.operator)}">${esc(s.operator)}</option>`).join('');
}

function fillScenarios(spec: OperatorSpec, selected?: string): void {
  scenarioSelect.innerHTML = spec.scenarios
    .map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`)
    .join('');
  if (selected && spec.scenarios.some((s) => s.name === selected)) scenarioSelect.value = selected;
}

function renderTuple(spec: OperatorSpec): string {
  const m = spec.mealy;
  const list = (items: readonly { symbol: string; description?: string }[]): string =>
    `<ul>${items.map((i) => `<li><code>${esc(i.symbol)}</code>${i.description ? ` — ${esc(i.description)}` : ''}</li>`).join('')}</ul>`;
  return `
<article><h3>S — state space</h3><code>${esc(m.stateSpace.notation)}</code>${m.stateSpace.description ? `<p>${esc(m.stateSpace.description)}</p>` : ''}
<ul>${m.stateSpace.invariants.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></article>
<article><h3>S₀ — initial state</h3><code>${esc(m.initialState.notation)}</code>${m.initialState.description ? `<p>${esc(m.initialState.description)}</p>` : ''}</article>
<article><h3>Z — input alphabet</h3>${list(m.inputAlphabet)}</article>
<article><h3>A — output alphabet</h3>${list(m.outputAlphabet)}</article>
<article><h3>T and G</h3><p>${m.transitions.length} rules — see the State Transition Table above. T(s, z) is the “next” column, G(s, z) the “outputs” column.</p>
<p>Signature: <code>${esc(spec.signature)}</code></p>${spec.source ? `<p>Source: ${esc(spec.source.package)} ${esc(spec.source.version)} — <code>${esc(spec.source.path)}</code></p>` : ''}</article>`;
}

let activeSteps: readonly TraceStep[] = [];
let activeRules: readonly RuleSpec[] = [];

function showDetail(stepIndex: number | null, ruleId: string | null): void {
  const detail = $('detail');
  const step = stepIndex === null ? undefined : activeSteps[stepIndex];
  const rule = activeRules.find((r) => r.id === (ruleId ?? step?.rule));
  if (!step && !rule) {
    detail.innerHTML = 'Hover a marble, state segment or rule badge to see the transition (T) and output word (G).';
    return;
  }
  const parts: string[] = [];
  if (step) {
    parts.push(`<div><strong>frame ${step.frame}</strong> · input <code>${esc(step.input)}</code> → rule <span class="badge">${esc(step.rule)}</span></div>`);
    parts.push(`<div>state after T(s, z): <code>${esc(step.state)}</code></div>`);
    parts.push(`<div>output word G(s, z): <code>${esc(describeOutputs(step.outputs))}</code></div>`);
    if (step.data !== undefined) parts.push(`<pre>${esc(JSON.stringify(step.data))}</pre>`);
  }
  if (rule) {
    parts.push(`<div><strong>Rule ${esc(rule.id)}</strong> · state <code>${esc(rule.state)}</code> · input <code>${esc(rule.input)}</code></div>`);
    parts.push(`<div>guard: ${esc(rule.guard)}</div>`);
    parts.push(`<div>T: <code>${esc(rule.next)}</code> · G: <code>${esc(rule.outputs.length === 0 ? 'none' : rule.outputs.join('; '))}</code></div>`);
    if (rule.evidence) parts.push(`<div>evidence: ${esc(rule.evidence)}</div>`);
    if (rule.note) parts.push(`<div><em>${esc(rule.note)}</em></div>`);
  }
  detail.innerHTML = parts.join('');
}

function clearHighlight(): void {
  document.querySelectorAll('tr.active').forEach((r) => r.classList.remove('active'));
  document.querySelectorAll('.timeline svg .hl').forEach((g) => g.classList.remove('hl'));
}

function highlight(stepIndex: number | null, ruleId: string | null): void {
  clearHighlight();
  if (ruleId) document.querySelectorAll(`tr[data-rule="${CSS.escape(ruleId)}"]`).forEach((r) => r.classList.add('active'));
  if (stepIndex !== null) {
    document.querySelectorAll(`tr[data-step="${stepIndex}"]`).forEach((r) => r.classList.add('active'));
    document.querySelectorAll(`.timeline svg [data-step="${stepIndex}"]`).forEach((g) => g.classList.add('hl'));
  }
  showDetail(stepIndex, ruleId);
}

function wireHover(): void {
  const svg = document.querySelector<SVGSVGElement>('.timeline svg');
  if (svg) {
    svg.addEventListener('mouseover', (ev) => {
      const target = ev.target as Element | null;
      const g = target?.closest('[data-step]');
      if (!g) return;
      const stepIndex = Number(g.getAttribute('data-step'));
      const step = activeSteps[stepIndex];
      highlight(stepIndex, g.getAttribute('data-rule') ?? step?.rule ?? null);
    });
  }
  document.querySelectorAll<HTMLTableRowElement>('tr[data-step]').forEach((row) => {
    row.addEventListener('mouseover', () => highlight(Number(row.dataset.step), row.dataset.rule ?? null));
  });
  document.querySelectorAll<HTMLTableRowElement>('#rules tr[data-rule]').forEach((row) => {
    row.addEventListener('mouseover', () => highlight(null, row.dataset.rule ?? null));
  });
}

function render(): void {
  const spec = currentSpec();
  if (!spec) return;
  const scenario = spec.scenarios.find((s) => s.name === scenarioSelect.value) ?? spec.scenarios[0];
  if (!scenario) {
    $('timeline').innerHTML = '<div class="empty">This operator has no scenarios.</div>';
    return;
  }
  window.location.hash = `${spec.operator}/${scenario.name}`;
  const params = paramsLabel(spec, scenario);
  const steps = scenario.trace ?? [];
  activeSteps = steps;
  activeRules = spec.mealy.transitions;
  const frameWidth = Number(frameWidthInput.value);
  frameWidthLabel.textContent = frameWidth === 0 ? 'auto' : `${frameWidth}px`;

  $('meta').innerHTML = `<div><strong>${esc(params)}</strong> — ${esc(scenarioCaption(params, scenario.title, scenario.name))}</div>
<div>source marble <code>${esc(scenario.source)}</code>${scenario.expected !== undefined ? ` · expected outer marble <code>${esc(scenario.expected)}</code>` : ''}${scenario.expectedValues ? ` with <code>${esc(JSON.stringify(scenario.expectedValues))}</code>` : ''}</div>
${spec.description ? `<div>${esc(spec.description)}</div>` : ''}`;

  if (steps.length === 0) {
    $('timeline').innerHTML = '<div class="empty">No generated trace for this scenario yet — run <code>npm run analyze</code>.</div>';
  } else {
    $('timeline').innerHTML = renderTimelineSvg(
      { operator: spec.operator, category: spec.category, params, scenario, steps },
      frameWidth === 0 ? {} : { frameWidth },
    );
  }
  $('steps').innerHTML = renderStepsTableHtml(steps);
  $('rules').innerHTML = renderRuleTableHtml(spec, new Set(steps.map((s) => s.rule)));
  $('tuple').innerHTML = renderTuple(spec);
  showDetail(null, null);
  wireHover();
}

function init(): void {
  if (specs.length === 0) {
    $('timeline').innerHTML = '<div class="empty">No operator YAML files found in operators/.</div>';
    return;
  }
  fillOperators();
  const [hashOp, hashScenario] = window.location.hash.replace(/^#/, '').split('/');
  if (hashOp && specs.some((s) => s.operator === hashOp)) operatorSelect.value = hashOp;
  const spec = currentSpec();
  if (spec) fillScenarios(spec, hashScenario);
  operatorSelect.addEventListener('change', () => {
    const next = currentSpec();
    if (next) fillScenarios(next);
    render();
  });
  scenarioSelect.addEventListener('change', render);
  frameWidthInput.addEventListener('input', render);
  render();
}

init();
