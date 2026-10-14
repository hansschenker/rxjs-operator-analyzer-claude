import { describe, expect, it } from 'vitest';
import { renderSpecMarkdown, renderTableMarkdown, renderTraceMarkdown, renderLaneText } from '../src/artifacts/markdown';
import { renderTestFile } from '../src/artifacts/tests';
import { simulate } from '../src/core/simulator';
import { computeCoverage } from '../src/core/table';
import { parseOperatorYaml } from '../src/core/yaml-io';
import { bufferCountMachine } from '../src/machines/bufferCount';
import { debounceTimeMachine } from '../src/machines/debounceTime';
import { windowCountMachine } from '../src/machines/windowCount';
import { renderStandaloneHtml } from '../src/render/html';
import { renderTimelineSvg } from '../src/render/timeline-svg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const bufferSpec = parseOperatorYaml(readFileSync(join(__dirname, '..', 'operators', 'bufferCount.yaml'), 'utf8'));
const windowSpec = parseOperatorYaml(readFileSync(join(__dirname, '..', 'operators', 'windowCount.yaml'), 'utf8'));
const debounceSpec = parseOperatorYaml(readFileSync(join(__dirname, '..', 'operators', 'debounceTime.yaml'), 'utf8'));

/** Minimal well-formedness check: every opened tag is closed in order (SVG output is XML). */
function assertBalanced(xml: string): void {
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^<>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const [, closing, tag, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      expect(stack.pop(), `closing </${tag}>`).toBe(tag);
    } else {
      stack.push(tag as string);
    }
  }
  expect(stack).toEqual([]);
}

describe('renderTimelineSvg', () => {
  it('draws the four lanes for bufferCount(2, 1) with inputs, rule badges, states and outputs', () => {
    const scenario = bufferSpec.scenarios[0];
    if (!scenario) throw new Error('scenario missing');
    const result = simulate(bufferCountMachine, scenario);
    const svg = renderTimelineSvg({ operator: 'bufferCount', category: 'transformation', params: result.params, scenario, steps: result.steps });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    assertBalanced(svg);
    for (const label of ['1 · timeline', '2 · input', '3 · state', '4 · output']) expect(svg).toContain(label);
    expect(svg).toContain('>[a,b]<');
    expect(svg).toContain('>V2<');
    expect(svg).toContain('([[a]], 1)');
    expect(svg).not.toMatch(/NaN|undefined/);
    expect((svg.match(/data-step="/g) ?? []).length).toBeGreaterThanOrEqual(result.steps.length);
  });

  it('adds one sub-row per window for windowCount', () => {
    const scenario = windowSpec.scenarios[0];
    if (!scenario) throw new Error('scenario missing');
    const result = simulate(windowCountMachine, scenario);
    const svg = renderTimelineSvg({ operator: 'windowCount', category: 'transformation', params: result.params, scenario, steps: result.steps });
    assertBalanced(svg);
    expect(svg).toContain('4.1 · w1');
    expect(svg).toContain('4.5 · w5');
    expect(svg).toContain('>I0<');
  });

  it('draws internal timer firings in the input lane for time-based operators', () => {
    const scenario = debounceSpec.scenarios[0];
    if (!scenario) throw new Error('scenario missing');
    const result = simulate(debounceTimeMachine, scenario);
    const svg = renderTimelineSvg({ operator: 'debounceTime', category: 'filtering', params: result.params, scenario, steps: result.steps });
    assertBalanced(svg);
    expect(result.steps.some((s) => s.kind === 'timer')).toBe(true);
    expect(svg).toContain('>t1<');
    expect(svg).toContain('timer(t1) fires');
    expect(svg).toContain('>T1<');
    expect(svg).toContain('>T2<');
    expect(renderLaneText(scenario, result.steps)).toContain('timer(t1)');
  });

  it('honours a fixed frame width', () => {
    const scenario = bufferSpec.scenarios[1];
    if (!scenario) throw new Error('scenario missing');
    const result = simulate(bufferCountMachine, scenario);
    const narrow = renderTimelineSvg({ operator: 'bufferCount', category: 'transformation', params: result.params, scenario, steps: result.steps }, { frameWidth: 40 });
    const wide = renderTimelineSvg({ operator: 'bufferCount', category: 'transformation', params: result.params, scenario, steps: result.steps }, { frameWidth: 100 });
    const width = (svg: string): number => Number(/width="(\d+)"/.exec(svg)?.[1]);
    expect(width(wide)).toBeGreaterThan(width(narrow));
  });
});

describe('artifacts', () => {
  const results = bufferSpec.scenarios.map((s) => simulate(bufferCountMachine, s));
  const merged = { ...bufferSpec, scenarios: bufferSpec.scenarios.map((s, i) => ({ ...s, trace: results[i]?.steps, expected: results[i]?.expected })) };

  it('renders the 6-tuple specification', () => {
    const md = renderSpecMarkdown(merged);
    for (const h of ['## 1. State space — S', '## 2. Initial state — S₀', '## 3. Input alphabet — Z', '## 4. Output alphabet — A', '## 5. Transition function — T', '## 6. Output function — G']) {
      expect(md).toContain(h);
    }
    expect(md).toContain('**V2**');
  });

  it('renders the transition table with coverage', () => {
    const md = renderTableMarkdown(bufferSpec, computeCoverage(bufferSpec, results));
    expect(md).toContain('| Rule |');
    expect(md).toContain('overlapping-2-1');
    expect(md).toContain('X1 ⁽ᵘ⁾');
    expect(md).not.toContain('**never**');
  });

  it('renders the trace and lanes', () => {
    const scenario = merged.scenarios[0];
    const result = results[0];
    if (!scenario || !result) throw new Error('missing');
    const md = renderTraceMarkdown(scenario, result.params, result.steps);
    expect(md).toContain('### Steps');
    expect(md).toContain('| 3 state |');
    const text = renderLaneText(scenario, result.steps);
    expect(text.split('\n').length).toBe(5);
    expect(text).toContain('[a,b]');
  });

  it('renders standalone HTML with hover wiring', () => {
    const scenario = merged.scenarios[0];
    const result = results[0];
    if (!scenario || !result) throw new Error('missing');
    const svg = renderTimelineSvg({ operator: 'bufferCount', category: 'transformation', params: result.params, scenario, steps: result.steps });
    const html = renderStandaloneHtml({ spec: merged, scenario, params: result.params, steps: result.steps, svg });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('data-rule="V2"');
    expect(html).toContain('<script>');
  });

  it('generates a Jest-compatible test file', () => {
    const ts = renderTestFile(bufferSpec, results, { higherOrder: false });
    expect(ts).toContain("import { bufferCount, type OperatorFunction } from 'rxjs';");
    expect(ts).not.toContain("from 'vitest'");
    expect(ts).toContain('bufferCount(2, 1)');
    expect(ts).toContain('"3 next([a,b])"');
    expect(renderTestFile(bufferSpec, results, { higherOrder: false, runner: 'vitest' })).toContain("from 'vitest'");
  });
});
