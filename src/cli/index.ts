import { Command } from 'commander';
import { basename, join, relative, resolve } from 'node:path';
import {
  renderLaneText,
  renderSpecMarkdown,
  renderTableMarkdown,
  renderTraceMarkdown,
  renderTracesMarkdown,
} from '../artifacts/markdown';
import { renderTestFile, type TestRunner } from '../artifacts/tests';
import { describeOutputs, scenarioCaption } from '../core/format';
import { simulate } from '../core/simulator';
import { computeCoverage, type CoverageReport } from '../core/table';
import type { OperatorSpec, ScenarioSpec, SimulationResult } from '../core/types';
import { formatDiagnostic, hasErrors, sameTrace, validateSpec } from '../core/validate';
import { safeParseOperatorYaml, updateScenarioResults } from '../core/yaml-io';
import { getMachine, hasMachine, registry } from '../machines/registry';
import { readText, readTextIfExists, resolveOperatorFiles, toPosix, writeText } from '../node/files';
import { renderStandaloneHtml } from '../render/html';
import { renderTimelineSvg } from '../render/timeline-svg';
import { VERSION } from '../version';

interface Loaded {
  readonly file: string;
  readonly text: string;
  readonly spec: OperatorSpec;
}

interface Analysis {
  readonly results: readonly SimulationResult[];
  /** The spec with fresh `expected` / `expectedValues` / `trace` merged into every scenario. */
  readonly merged: OperatorSpec;
  readonly coverage: CoverageReport;
}

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};
const warn = (message: string): void => {
  process.stderr.write(`${message}\n`);
};
const rel = (path: string): string => toPosix(relative(process.cwd(), path)) || '.';

function fail(message: string): never {
  warn(`error: ${message}`);
  process.exit(1);
}

function loadFiles(args: readonly string[]): Loaded[] {
  let files: string[];
  try {
    files = resolveOperatorFiles(args);
  } catch (e) {
    return fail((e as Error).message);
  }
  if (files.length === 0) fail('no operator YAML files found');
  const loaded: Loaded[] = [];
  for (const file of files) {
    const text = readText(file);
    const parsed = safeParseOperatorYaml(text);
    if (!parsed.ok) {
      warn(`${rel(file)}: invalid operator definition`);
      for (const issue of parsed.issues) warn(`  ${formatDiagnostic(issue)}`);
      process.exit(1);
    }
    loaded.push({ file, text, spec: parsed.spec });
  }
  return loaded;
}

function analyzeSpec(spec: OperatorSpec): Analysis {
  const { machine } = getMachine(spec.operator);
  const results = spec.scenarios.map((scenario) => simulate(machine, scenario));
  const merged: OperatorSpec = {
    ...spec,
    scenarios: spec.scenarios.map((scenario): ScenarioSpec => {
      const result = results.find((r) => r.scenario === scenario.name);
      return result
        ? { ...scenario, expected: result.expected, expectedValues: result.expectedValues, trace: result.steps }
        : scenario;
    }),
  };
  return { results, merged, coverage: computeCoverage(spec, results) };
}

function paramsOf(analysis: Analysis, scenario: string): string {
  return analysis.results.find((r) => r.scenario === scenario)?.params ?? '';
}

function pickScenario(spec: OperatorSpec, name: string | undefined): ScenarioSpec[] {
  if (name === undefined) return [...spec.scenarios];
  const scenario = spec.scenarios.find((s) => s.name === name);
  if (!scenario) fail(`scenario "${name}" not found in ${spec.operator} (have: ${spec.scenarios.map((s) => s.name).join(', ')})`);
  return [scenario];
}

function coverageSummary(spec: OperatorSpec, coverage: CoverageReport): string {
  const reachable = spec.mealy.transitions.filter((r) => r.reachable !== false).length;
  const fired = reachable - coverage.unfired.length;
  const parts = [`${fired}/${reachable} reachable rules fired`];
  if (coverage.unfired.length > 0) parts.push(`never fired: ${coverage.unfired.join(', ')}`);
  if (coverage.unknown.length > 0) parts.push(`UNKNOWN rule ids: ${[...new Set(coverage.unknown.map((u) => u.rule))].join(', ')}`);
  return parts.join('; ');
}

function emit(path: string, content: string, check: boolean, stale: string[]): void {
  if (check) {
    const existing = readTextIfExists(path);
    if (existing === undefined || existing.replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) {
      stale.push(rel(path));
    }
    return;
  }
  writeText(path, content);
  log(`  wrote ${rel(path)}`);
}

/* ----------------------------------------------------------------------------
 * Artifact bundle used by `generate`
 * ------------------------------------------------------------------------- */

function timelineFiles(
  spec: OperatorSpec,
  analysis: Analysis,
  dir: string,
  frameWidth: number | undefined,
): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  for (const scenario of analysis.merged.scenarios) {
    const params = paramsOf(analysis, scenario.name);
    const steps = scenario.trace ?? [];
    const svg = renderTimelineSvg(
      { operator: spec.operator, category: spec.category, params, scenario, steps },
      frameWidth === undefined ? {} : { frameWidth },
    );
    files.push({ path: join(dir, `${scenario.name}.svg`), content: svg });
    files.push({
      path: join(dir, `${scenario.name}.html`),
      content: renderStandaloneHtml({ spec: analysis.merged, scenario, params, steps, svg }),
    });
  }
  return files;
}

function operatorReadme(spec: OperatorSpec, analysis: Analysis): string {
  const out: string[] = [];
  out.push(`# ${spec.operator} — generated artifacts`);
  out.push('');
  out.push(`Generated by \`rxjs-operator-analyzer generate\` from \`operators/${spec.operator}.yaml\`.`);
  out.push('');
  out.push('| Artifact | File |');
  out.push('|---|---|');
  out.push('| 1. 6-tuple formal specification | [spec.md](./spec.md) |');
  out.push('| 2. State transition table | [transition-table.md](./transition-table.md) |');
  out.push('| 3. Step-by-step execution traces | [traces.md](./traces.md) |');
  out.push(`| 4. 4-lane timelines | ${analysis.merged.scenarios.map((s) => `[${s.name}](./timeline/${s.name}.html)`).join(', ')} |`);
  out.push(`| 5. Automated test cases | [${spec.operator}.test.ts](./${spec.operator}.test.ts) |`);
  out.push('');
  out.push(`Coverage: ${coverageSummary(spec, analysis.coverage)}.`);
  out.push('');
  return out.join('\n');
}

/* ----------------------------------------------------------------------------
 * Commands
 * ------------------------------------------------------------------------- */

const program = new Command();
program
  .name('rxjs-operator-analyzer')
  .description('Mealy 6-tuple analysis of RxJS operators: YAML state transition tables, traces, 4-lane timelines, tests')
  .version(VERSION);

program
  .command('list')
  .description('list operator definitions, their scenarios and whether an executable machine exists')
  .argument('[files...]', 'YAML files or directories (default: operators/)')
  .action((files: string[]) => {
    for (const { file, spec } of loadFiles(files)) {
      const machine = hasMachine(spec.operator) ? 'machine: yes' : 'machine: NO';
      log(`${spec.operator}  (${rel(file)})  rules: ${spec.mealy.transitions.length}  ${machine}`);
      for (const s of spec.scenarios) {
        log(`  - ${s.name}  ${s.source}  ${s.trace ? `trace: ${s.trace.length} steps` : 'trace: none'}`);
      }
    }
    log(`machines available: ${Object.keys(registry).join(', ')}`);
  });

program
  .command('validate')
  .description('validate operator YAML files (schema, table consistency, rule coverage, trace freshness)')
  .argument('[files...]', 'YAML files or directories (default: operators/)')
  .action((files: string[]) => {
    let failed = false;
    for (const { file, spec } of loadFiles(files)) {
      const results = hasMachine(spec.operator) ? analyzeSpec(spec).results : undefined;
      const diagnostics = validateSpec(spec, {
        knownOperators: Object.keys(registry),
        ...(results ? { results } : {}),
      });
      log(`${rel(file)}: ${diagnostics.length === 0 ? 'ok' : `${diagnostics.length} finding(s)`}`);
      for (const d of diagnostics) log(`  ${formatDiagnostic(d)}`);
      if (hasErrors(diagnostics)) failed = true;
    }
    if (failed) process.exit(1);
  });

program
  .command('analyze')
  .description('simulate every scenario and write the traces + expected marbles back into the YAML')
  .argument('[files...]', 'YAML files or directories (default: operators/)')
  .option('--check', 'do not write; fail if any stored trace is stale')
  .action((files: string[], options: { check?: boolean }) => {
    const stale: string[] = [];
    for (const { file, text, spec } of loadFiles(files)) {
      const analysis = analyzeSpec(spec);
      log(`${spec.operator}: ${analysis.results.length} scenario(s); ${coverageSummary(spec, analysis.coverage)}`);
      if (analysis.coverage.unknown.length > 0) fail(`${spec.operator}: machine returned rule ids missing from the table`);
      if (options.check) {
        for (const scenario of spec.scenarios) {
          const result = analysis.results.find((r) => r.scenario === scenario.name);
          if (!result) continue;
          if (!scenario.trace || !sameTrace(scenario.trace, result.steps) || scenario.expected !== result.expected) {
            stale.push(`${rel(file)} » ${scenario.name}`);
          }
        }
      } else {
        writeText(file, updateScenarioResults(text, analysis.results));
        log(`  wrote ${rel(file)}`);
      }
    }
    if (stale.length > 0) {
      warn(`stale traces (run analyze):\n  ${stale.join('\n  ')}`);
      process.exit(1);
    }
  });

program
  .command('spec')
  .description('artifact 1 — print the 6-tuple formal specification as Markdown')
  .argument('<file>', 'operator YAML')
  .option('-o, --out <path>', 'write to a file instead of stdout')
  .action((file: string, options: { out?: string }) => {
    const [loaded] = loadFiles([file]);
    if (!loaded) return;
    const spec = hasMachine(loaded.spec.operator) ? analyzeSpec(loaded.spec).merged : loaded.spec;
    const md = renderSpecMarkdown(spec);
    if (options.out) writeText(resolve(options.out), md);
    else log(md);
  });

program
  .command('table')
  .description('artifact 2 — print the State Transition Table as Markdown (with coverage)')
  .argument('<file>', 'operator YAML')
  .option('-o, --out <path>', 'write to a file instead of stdout')
  .action((file: string, options: { out?: string }) => {
    const [loaded] = loadFiles([file]);
    if (!loaded) return;
    const coverage = hasMachine(loaded.spec.operator) ? analyzeSpec(loaded.spec).coverage : undefined;
    const md = renderTableMarkdown(loaded.spec, coverage);
    if (options.out) writeText(resolve(options.out), md);
    else log(md);
  });

program
  .command('trace')
  .description('artifact 3 — print the step-by-step execution trace and the 4 lanes for a scenario')
  .argument('<file>', 'operator YAML')
  .option('-s, --scenario <name>', 'scenario name (default: all)')
  .option('-f, --format <format>', 'text | md', 'text')
  .option('-o, --out <path>', 'write to a file instead of stdout')
  .action((file: string, options: { scenario?: string; format: string; out?: string }) => {
    const [loaded] = loadFiles([file]);
    if (!loaded) return;
    const analysis = analyzeSpec(loaded.spec);
    const scenarios = pickScenario(analysis.merged, options.scenario);
    const chunks: string[] = [];
    for (const scenario of scenarios) {
      const params = paramsOf(analysis, scenario.name);
      const steps = scenario.trace ?? [];
      if (options.format === 'md') {
        chunks.push(renderTraceMarkdown(scenario, params, steps));
      } else {
        chunks.push(`${params}  —  ${scenarioCaption(params, scenario.title, scenario.name)}`);
        chunks.push(`source: ${scenario.source}    expected: ${scenario.expected ?? ''}`);
        chunks.push('');
        chunks.push(renderLaneText(scenario, steps));
        chunks.push('');
        for (const [i, s] of steps.entries()) {
          chunks.push(`  ${String(i).padStart(2)}  f${String(s.frame).padEnd(3)} ${s.input.padEnd(12)} ${s.rule.padEnd(4)} ${s.state.padEnd(28)} ${describeOutputs(s.outputs)}`);
        }
        chunks.push('');
      }
    }
    const text = chunks.join('\n');
    if (options.out) writeText(resolve(options.out), text);
    else log(text);
  });

program
  .command('render')
  .description('artifact 4 — render the 4-lane timeline (svg or html) for one or all scenarios')
  .argument('<file>', 'operator YAML')
  .option('-s, --scenario <name>', 'scenario name (default: all)')
  .option('-f, --format <format>', 'svg | html | both', 'both')
  .option('-o, --out <dir>', 'output directory', undefined)
  .option('--frame-width <px>', 'fixed frame width in px (default: automatic)')
  .action((file: string, options: { scenario?: string; format: string; out?: string; frameWidth?: string }) => {
    const [loaded] = loadFiles([file]);
    if (!loaded) return;
    const analysis = analyzeSpec(loaded.spec);
    const dir = resolve(options.out ?? join('generated', loaded.spec.operator, 'timeline'));
    const frameWidth = options.frameWidth === undefined ? undefined : Number(options.frameWidth);
    const wanted = new Set(pickScenario(analysis.merged, options.scenario).map((s) => s.name));
    for (const f of timelineFiles(loaded.spec, analysis, dir, frameWidth)) {
      const name = basename(f.path);
      const scenarioName = name.replace(/\.(svg|html)$/, '');
      if (!wanted.has(scenarioName)) continue;
      const ext = name.endsWith('.svg') ? 'svg' : 'html';
      if (options.format !== 'both' && options.format !== ext) continue;
      writeText(f.path, f.content);
      log(`  wrote ${rel(f.path)}`);
    }
  });

program
  .command('gen-tests')
  .description('artifact 5 — generate Jest-compatible test cases (one per scenario) from the YAML')
  .argument('<file>', 'operator YAML')
  .option('-o, --out <path>', 'output file (default: generated/<operator>/<operator>.test.ts)')
  .option('-r, --runner <runner>', 'jest | vitest', 'jest')
  .action((file: string, options: { out?: string; runner: string }) => {
    const [loaded] = loadFiles([file]);
    if (!loaded) return;
    const analysis = analyzeSpec(loaded.spec);
    const { higherOrder } = getMachine(loaded.spec.operator);
    const content = renderTestFile(loaded.spec, analysis.results, {
      runner: options.runner as TestRunner,
      higherOrder,
      sourceFile: rel(loaded.file),
    });
    const path = resolve(options.out ?? join('generated', loaded.spec.operator, `${loaded.spec.operator}.test.ts`));
    writeText(path, content);
    log(`  wrote ${rel(path)}`);
  });

program
  .command('generate')
  .description('generate all five artifacts for every operator and refresh the YAML traces')
  .argument('[files...]', 'YAML files or directories (default: operators/)')
  .option('-o, --out <dir>', 'output directory', 'generated')
  .option('-r, --runner <runner>', 'test runner for generated tests: jest | vitest', 'jest')
  .option('--frame-width <px>', 'fixed frame width in px for timelines (default: automatic)')
  .option('--check', 'do not write; fail if any artifact or stored trace is stale')
  .action((files: string[], options: { out: string; runner: string; frameWidth?: string; check?: boolean }) => {
    const check = options.check === true;
    const stale: string[] = [];
    const outDir = resolve(options.out);
    const frameWidth = options.frameWidth === undefined ? undefined : Number(options.frameWidth);
    const index: string[] = ['# Generated artifacts', '', '| Operator | Rules | Scenarios | Coverage |', '|---|---|---|---|'];
    for (const { file, text, spec: loadedSpec } of loadFiles(files)) {
      // Render every artifact from the YAML text exactly as it will be on disk after this run,
      // so a single `generate` followed by `generate --check` is stable.
      const updatedText = updateScenarioResults(text, analyzeSpec(loadedSpec).results);
      const reparsed = safeParseOperatorYaml(updatedText);
      const spec = reparsed.ok ? reparsed.spec : loadedSpec;
      const analysis = analyzeSpec(spec);
      if (analysis.coverage.unknown.length > 0) fail(`${spec.operator}: machine returned rule ids missing from the table`);
      log(`${spec.operator}: ${coverageSummary(spec, analysis.coverage)}`);
      const dir = join(outDir, spec.operator);
      emit(file, updatedText, check, stale);
      emit(join(dir, 'spec.md'), renderSpecMarkdown(analysis.merged), check, stale);
      emit(join(dir, 'transition-table.md'), renderTableMarkdown(spec, analysis.coverage), check, stale);
      emit(
        join(dir, 'traces.md'),
        renderTracesMarkdown(
          spec,
          analysis.merged.scenarios.map((scenario) => ({ scenario, params: paramsOf(analysis, scenario.name), steps: scenario.trace ?? [] })),
        ),
        check,
        stale,
      );
      for (const f of timelineFiles(spec, analysis, join(dir, 'timeline'), frameWidth)) emit(f.path, f.content, check, stale);
      const { higherOrder } = getMachine(spec.operator);
      emit(
        join(dir, `${spec.operator}.test.ts`),
        renderTestFile(spec, analysis.results, { runner: options.runner as TestRunner, higherOrder, sourceFile: rel(file) }),
        check,
        stale,
      );
      emit(join(dir, 'README.md'), operatorReadme(spec, analysis), check, stale);
      index.push(`| [${spec.operator}](./${spec.operator}/README.md) | ${spec.mealy.transitions.length} | ${spec.scenarios.length} | ${coverageSummary(spec, analysis.coverage)} |`);
    }
    index.push('');
    emit(join(outDir, 'README.md'), index.join('\n'), check, stale);
    if (stale.length > 0) {
      warn(`stale artifacts (run generate):\n  ${stale.join('\n  ')}`);
      process.exit(1);
    }
    if (check) log('all artifacts are up to date');
  });

program.parseAsync(process.argv).catch((e: unknown) => fail((e as Error).message));
