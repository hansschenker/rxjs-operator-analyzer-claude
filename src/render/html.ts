import { describeOutputs, scenarioCaption } from '../core/format';
import type { OperatorSpec, ScenarioSpec, TraceStep } from '../core/types';
import { accentFor, theme, tokensCss } from './theme';

export interface StandaloneHtmlInput {
  readonly spec: OperatorSpec;
  readonly scenario: ScenarioSpec;
  readonly params: string;
  readonly steps: readonly TraceStep[];
  readonly svg: string;
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const pageCss = `${tokensCss}
* { box-sizing: border-box; }
body { margin: 0; background: var(--rxjs-color-background); color: var(--rxjs-color-text); font-family: var(--rxjs-font-sans); }
main { max-width: 1400px; margin: 0 auto; padding: 24px; }
h1 { font-family: var(--rxjs-font-mono); color: var(--rxjs-color-primary); font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 28px 0 8px; }
.meta { color: var(--rxjs-color-text-secondary); font-size: 13px; margin-bottom: 16px; }
.meta code, td code, .expected code { font-family: var(--rxjs-font-mono); background: var(--rxjs-color-primary-bg); padding: 1px 5px; border-radius: var(--rxjs-radius-sm); }
.timeline { background: var(--rxjs-color-surface); border: 1px solid var(--rxjs-color-border); border-radius: var(--rxjs-radius-lg); padding: 8px; overflow-x: auto; }
.timeline svg { display: block; max-width: none; }
table { border-collapse: collapse; width: 100%; font-size: 12.5px; background: var(--rxjs-color-surface); }
th, td { border: 1px solid var(--rxjs-color-border); padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: var(--rxjs-color-primary-bg); }
td.mono, th.mono { font-family: var(--rxjs-font-mono); white-space: nowrap; }
tr[data-rule], tr[data-step] { transition: background 120ms; }
tr.active { background: #fff3f8; outline: 2px solid var(--rxjs-color-primary); }
.badge { display: inline-block; font-family: var(--rxjs-font-mono); font-weight: 700; font-size: 11px; color: #fff; background: var(--rxjs-color-primary); border-radius: 999px; padding: 1px 8px; }
.badge.unreachable { background: var(--rxjs-color-text-secondary); }
.table-wrap { overflow-x: auto; }
svg [data-step] { cursor: pointer; }
svg .hl rect, svg .hl circle { filter: drop-shadow(0 0 3px rgba(194, 24, 91, 0.8)); }
`;

export const hoverScript = `(() => {
  const svg = document.querySelector('.timeline svg');
  if (!svg) return;
  const clear = () => {
    document.querySelectorAll('tr.active').forEach((r) => r.classList.remove('active'));
    svg.querySelectorAll('.hl').forEach((g) => g.classList.remove('hl'));
  };
  const activate = (step, rule) => {
    clear();
    if (rule) document.querySelectorAll('tr[data-rule="' + rule + '"]').forEach((r) => r.classList.add('active'));
    if (step !== null) document.querySelectorAll('tr[data-step="' + step + '"]').forEach((r) => r.classList.add('active'));
    if (step !== null) svg.querySelectorAll('[data-step="' + step + '"]').forEach((g) => g.classList.add('hl'));
  };
  svg.addEventListener('mouseover', (ev) => {
    const g = ev.target.closest('[data-step]');
    if (!g) return;
    const step = g.getAttribute('data-step');
    const row = document.querySelector('tr[data-step="' + step + '"]');
    activate(step, row ? row.getAttribute('data-rule') : g.getAttribute('data-rule'));
  });
  svg.addEventListener('mouseleave', clear);
  document.querySelectorAll('tr[data-step]').forEach((row) => {
    row.addEventListener('mouseover', () => activate(row.getAttribute('data-step'), row.getAttribute('data-rule')));
    row.addEventListener('mouseleave', clear);
  });
})();`;

export function renderRuleTableHtml(spec: OperatorSpec, firedRules?: ReadonlySet<string>): string {
  const rows = spec.mealy.transitions.map((r) => {
    const fired = firedRules ? (firedRules.has(r.id) ? '●' : '') : '';
    const cls = r.reachable === false ? 'badge unreachable' : 'badge';
    return `<tr data-rule="${esc(r.id)}">
<td class="mono"><span class="${cls}">${esc(r.id)}</span></td>
<td class="mono">${esc(r.state)}</td>
<td class="mono">${esc(r.input)}</td>
<td>${esc(r.guard)}</td>
<td class="mono">${esc(r.next)}</td>
<td class="mono">${r.outputs.length === 0 ? 'none' : esc(r.outputs.join('; '))}</td>
<td>${esc(r.evidence ?? '')}</td>
${firedRules ? `<td>${fired}</td>` : ''}
</tr>`;
  });
  return `<div class="table-wrap"><table>
<thead><tr><th>Rule</th><th>State s</th><th>Input z</th><th>Guard</th><th>T(s, z)</th><th>G(s, z)</th><th>Evidence</th>${firedRules ? '<th>Fired</th>' : ''}</tr></thead>
<tbody>${rows.join('\n')}</tbody></table></div>`;
}

/** The timeline legend as compact HTML (for pages that render the SVG with `showLegend: false`). */
export function renderLegendHtml(category: string): string {
  const accent = accentFor(category);
  const icon = (inner: string): string =>
    `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">${inner}</svg>`;
  const items: [string, string][] = [
    ['input value', icon(`<circle cx="9" cy="9" r="6.5" fill="${theme.primaryBg}" stroke="${accent}" stroke-width="1.5"/>`)],
    ['output value', icon(`<circle cx="9" cy="9" r="6.5" fill="${accent}"/>`)],
    ['window opened', icon(`<rect x="1.5" y="3" width="15" height="12" rx="6" fill="${theme.white}" stroke="${accent}" stroke-width="1.5" stroke-dasharray="3 2"/>`)],
    ['state segment', icon(`<rect x="1.5" y="3" width="15" height="12" rx="3" fill="${theme.primaryBg}" stroke="${accent}" stroke-width="1"/>`)],
    ['rule id', icon(`<rect x="1.5" y="4" width="15" height="10" rx="5" fill="${accent}"/>`)],
    ['complete', icon(`<line x1="9" y1="2" x2="9" y2="16" stroke="${theme.gray900}" stroke-width="3"/>`)],
    ['error', icon(`<g stroke="${theme.accent}" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="4" x2="14" y2="14"/><line x1="4" y1="14" x2="14" y2="4"/></g>`)],
    ['window lifetime', icon(`<line x1="2" y1="9" x2="16" y2="9" stroke="${theme.pink200}" stroke-width="4" stroke-linecap="round"/>`)],
  ];
  return `<ul class="legend">${items.map(([label, glyph]) => `<li>${glyph}<span>${esc(label)}</span></li>`).join('')}</ul>`;
}

/** Legend for a trace: only the rules it fired, in table order, with their T and G. */
export function renderRuleLegendHtml(spec: OperatorSpec, steps: readonly TraceStep[]): string {
  const fired = new Set(steps.map((s) => s.rule));
  const rules = spec.mealy.transitions.filter((r) => fired.has(r.id));
  if (rules.length === 0) return '';
  const rows = rules.map(
    (r) => `<tr data-rule="${esc(r.id)}">
<td class="mono"><span class="badge">${esc(r.id)}</span></td>
<td class="mono">${esc(r.input)}</td>
<td>${esc(r.guard)}</td>
<td class="mono">${esc(r.next)}</td>
<td class="mono">${r.outputs.length === 0 ? 'none' : esc(r.outputs.join('; '))}</td>
<td>${esc(r.note ?? '')}</td></tr>`,
  );
  return `<div class="table-wrap"><table>
<thead><tr><th>Rule</th><th>Input z</th><th>Guard</th><th>T(s, z) → next state</th><th>G(s, z) → outputs</th><th>Note</th></tr></thead>
<tbody>${rows.join('\n')}</tbody></table></div>`;
}

export function renderStepsTableHtml(steps: readonly TraceStep[]): string {
  const rows = steps.map(
    (s, i) => `<tr data-step="${i}" data-rule="${esc(s.rule)}">
<td class="mono">${i}</td><td class="mono">${s.frame}</td><td class="mono">${esc(s.input)}</td>
<td class="mono"><span class="badge">${esc(s.rule)}</span></td><td class="mono">${esc(s.state)}</td>
<td class="mono">${esc(describeOutputs(s.outputs))}</td></tr>`,
  );
  return `<div class="table-wrap"><table>
<thead><tr><th>#</th><th>Frame</th><th>Input</th><th>Rule</th><th>State after</th><th>Outputs G(s, z)</th></tr></thead>
<tbody>${rows.join('\n')}</tbody></table></div>`;
}

export function renderStandaloneHtml(input: StandaloneHtmlInput): string {
  const { spec, scenario, steps, svg } = input;
  const fired = new Set(steps.map((s) => s.rule));
  const expected = scenario.expected
    ? `<p class="expected">expected outer marble: <code>${esc(scenario.expected)}</code>${
        scenario.expectedValues
          ? ` with <code>${esc(JSON.stringify(scenario.expectedValues))}</code>`
          : ''
      }</p>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.params)} — ${esc(scenario.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>${pageCss}</style>
</head>
<body>
<main>
<h1>${esc(input.params)}</h1>
<div class="meta">
<div>${esc(scenarioCaption(input.params, scenario.title, scenario.name))}</div>
<div>Mealy 6-tuple analysis of <code>${esc(spec.operator)}</code> (${esc(spec.category)}) — ${
    spec.source ? `${esc(spec.source.package)} ${esc(spec.source.version)}, <code>${esc(spec.source.path)}</code>` : ''
  }</div>
<div>source marble: <code>${esc(scenario.source)}</code></div>
${expected}
</div>
<div class="timeline">${svg}</div>
<h2>Execution trace (step by step)</h2>
${renderStepsTableHtml(steps)}
<h2>State transition table (T and G)</h2>
${renderRuleTableHtml(spec, fired)}
</main>
<script>${hoverScript}</script>
</body>
</html>
`;
}
