import type { OperatorSpec, ScenarioSpec, TraceStep } from '../src/core/types';
import { parseOperatorYaml } from '../src/core/yaml-io';
import { renderLegendHtml, renderRuleLegendHtml, renderStepsTableHtml } from '../src/render/html';
import { renderTimelineSvg } from '../src/render/timeline-svg';

/**
 * Framework-less web viewer: the 4-lane timeline plus the step-by-step execution trace.
 * It reads ONLY the operator YAML files (with their generated traces) — no operator code runs in
 * the browser. The full transition table, 6-tuple and rule details stay in the YAML and in the
 * generated Markdown / standalone HTML artifacts.
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

/** The native SVG tooltips are for the standalone files; the viewer links marbles to the trace instead. */
function withoutTooltips(svg: string): string {
  return svg.replace(/<title>[^<]*<\/title>/g, '');
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

let activeSteps: readonly TraceStep[] = [];

function clearHighlight(): void {
  document.querySelectorAll('tr.active').forEach((r) => r.classList.remove('active'));
  document.querySelectorAll('.timeline svg .hl').forEach((g) => g.classList.remove('hl'));
}

function highlightRule(ruleId: string): void {
  document.querySelectorAll(`#rules tr[data-rule="${CSS.escape(ruleId)}"]`).forEach((r) => r.classList.add('active'));
}

/** A step lights up its trace row, its lane elements and the rule it fired. */
function highlightStep(stepIndex: number): void {
  clearHighlight();
  const step = activeSteps[stepIndex];
  if (!step) return;
  document.querySelectorAll(`#steps tr[data-step="${stepIndex}"]`).forEach((r) => r.classList.add('active'));
  document.querySelectorAll(`.timeline svg [data-step="${stepIndex}"]`).forEach((g) => g.classList.add('hl'));
  highlightRule(step.rule);
}

/** A rule lights up every step (and lane element) that fired it. */
function highlightAllForRule(ruleId: string): void {
  clearHighlight();
  highlightRule(ruleId);
  activeSteps.forEach((step, index) => {
    if (step.rule !== ruleId) return;
    document.querySelectorAll(`#steps tr[data-step="${index}"]`).forEach((r) => r.classList.add('active'));
    document.querySelectorAll(`.timeline svg [data-step="${index}"]`).forEach((g) => g.classList.add('hl'));
  });
}

function wireHover(): void {
  const svg = document.querySelector<SVGSVGElement>('.timeline svg');
  if (svg) {
    svg.addEventListener('mouseover', (ev) => {
      const target = ev.target as Element | null;
      const g = target?.closest('[data-step]');
      if (g) highlightStep(Number(g.getAttribute('data-step')));
    });
    svg.addEventListener('mouseleave', clearHighlight);
  }
  document.querySelectorAll<HTMLTableRowElement>('#steps tr[data-step]').forEach((row) => {
    row.addEventListener('mouseover', () => highlightStep(Number(row.dataset.step)));
    row.addEventListener('mouseleave', clearHighlight);
  });
  document.querySelectorAll<HTMLTableRowElement>('#rules tr[data-rule]').forEach((row) => {
    row.addEventListener('mouseover', () => highlightAllForRule(row.dataset.rule ?? ''));
    row.addEventListener('mouseleave', clearHighlight);
  });
}

function render(): void {
  const spec = currentSpec();
  if (!spec) return;
  const scenario = spec.scenarios.find((s) => s.name === scenarioSelect.value) ?? spec.scenarios[0];
  if (!scenario) {
    $('timeline').innerHTML = '<div class="empty">This operator has no scenarios.</div>';
    $('steps').innerHTML = '';
    $('rules').innerHTML = '';
    return;
  }
  window.location.hash = `${spec.operator}/${scenario.name}`;
  const params = paramsLabel(spec, scenario);
  const steps = scenario.trace ?? [];
  activeSteps = steps;
  const frameWidth = Number(frameWidthInput.value);
  frameWidthLabel.textContent = frameWidth === 0 ? 'auto' : `${frameWidth}px`;

  if (steps.length === 0) {
    $('timeline').innerHTML = '<div class="empty">No generated trace for this scenario yet — run <code>npm run analyze</code>.</div>';
  } else {
    $('timeline').innerHTML = withoutTooltips(
      renderTimelineSvg(
        { operator: spec.operator, category: spec.category, params, scenario, steps },
        {
          showLegend: false,
          maxWidth: Math.max(600, $('timeline').clientWidth - 18),
          ...(frameWidth === 0 ? {} : { frameWidth }),
        },
      ),
    );
  }
  $('legend').innerHTML = renderLegendHtml(spec.category);
  $('steps').innerHTML = renderStepsTableHtml(steps);
  $('rules').innerHTML = renderRuleLegendHtml(spec, steps);
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
