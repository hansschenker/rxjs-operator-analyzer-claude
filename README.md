# RxJS Operator Analyzer

> Main contributor: **Claude Fable 5.1** (Anthropic), who designed and implemented the analyzer,
> the executable Mealy models, the 4-lane renderer and the test suite in a single session on
> 2026-10-14, from the method notes in `docs/` by Hans Schenker. See [Contributors](#contributors).

A formal, automated and visual way to describe what an RxJS operator does, using the
**Mealy state machine 6-tuple**:

| Symbol | Meaning | Where it lives |
|---|---|---|
| **S** | state space | `mealy.stateSpace` in the YAML + the machine's state type |
| **S₀** | initial state | `mealy.initialState` + `Machine.initial()` |
| **Z** | input alphabet | `mealy.inputAlphabet` (`subscribe`, `value(v)`, `complete`, `error(e)`, `finalize`, …) |
| **A** | output alphabet | `mealy.outputAlphabet` (`emit(x)`, `complete`, `error(e)`, `open(w)`, `w.next(v)`, …) |
| **T : S × Z → S** | transition function | the `next` column of every rule + `Machine.step().state` |
| **G : S × Z → A\*** | output function | the `outputs` column of every rule + `Machine.step().outputs` |

The analysis of an operator is saved as a **State Transition Table in YAML** (`operators/<name>.yaml`):
one rule per guarded `(state, input)` pair, with its rule id, guard, `T`, `G` and a pointer to the
RxJS source lines it was derived from. A small executable model per operator
(`src/machines/<name>.ts`) returns exactly those rule ids, so the table is cross-checked two ways:

1. **coverage** — every reachable rule must fire in at least one scenario, and the model may not
   fire a rule the table does not list;
2. **differential testing** — the model's notification history for every scenario must equal the
   history of the *real* RxJS operator run under `TestScheduler`.

The YAML (with the generated traces) then drives the **4-lane timeline**:

| Lane | Shows |
|---|---|
| 1 · timeline | **when** — the virtual-time frame axis |
| 2 · input | **what & when** — source values, completion, error |
| 3 · state | **handling state** — the machine state after every transition, badge = rule id |
| 4 · output | **result** — downstream emissions; higher-order operators get one sub-row per window |

## Quick start

```bash
npm install
npm run analyze      # simulate every scenario, write traces + expected marbles into operators/*.yaml
npm run generate     # all five artifacts into generated/<operator>/
npm test             # unit tests + differential tests + the generated test files
npm run dev          # interactive 4-lane viewer on http://localhost:5180
npm run build        # typecheck, library + CLI bundle (dist/), web viewer (dist-web/)
```

## Generated artifacts (per operator)

| # | Artifact | Command | Output |
|---|---|---|---|
| 1 | 6-tuple formal specification | `spec` | `generated/<op>/spec.md` |
| 2 | Exhaustive state transition table (with coverage) | `table` | `generated/<op>/transition-table.md` |
| 3 | Step-by-step execution trace + lane view | `trace` | `generated/<op>/traces.md`, terminal |
| 4 | Visual 4-lane timeline | `render` | `generated/<op>/timeline/<scenario>.svg` and `.html` |
| 5 | Automated test cases (Jest-compatible, also run by Vitest) | `gen-tests` | `generated/<op>/<op>.test.ts` |

`generate` produces all of them, refreshes the YAML traces and, with `--check`, fails when anything
on disk is stale (useful in CI). Run the CLI from source with `npm run cli -- <command>`:

```bash
npm run cli -- list
npm run cli -- validate                         # schema + table consistency + coverage + freshness
npm run cli -- analyze --check                  # fail if the YAML traces are stale
npm run cli -- trace operators/bufferCount.yaml -s overlapping-2-1
npm run cli -- render operators/windowCount.yaml -s non-overlapping-2 -f svg -o out/
npm run cli -- gen-tests operators/bufferCount.yaml --runner vitest
npm run cli -- generate --check
```

## Adding an operator

1. **Analyse the source** (see `docs/mealy-machine-analysis-of-bufferCount.txt` for the method):
   list the closure variables (→ S), what exists before the first value (→ S₀), the subscriber
   callbacks (→ Z), every `subscriber.next/complete/error` and window call (→ A), then write one
   rule per guarded `(state, input)` pair (→ T and G).
2. **Write `operators/<name>.yaml`** following `operators/bufferCount.yaml`. Rule ids are free text;
   the convention is `S0`/`I0` for the subscribe step, `V*` for values, `C*` complete, `E*` error,
   `F1` finalize, `X*` for rows listed for totality (`reachable: false`).
3. **Write `src/machines/<name>.ts`** implementing `Machine<S, P>` and return the same rule ids,
   then register it in `src/machines/registry.ts` together with the real operator factory.
4. `npm run generate && npm test` — coverage and the differential tests tell you where the table and
   the implementation disagree.

Time-based operators are prepared for: a machine may return `schedule: [{ id, after }]` and
`cancel: [id]` from `step()`, and the simulator delivers `{ kind: 'timer', id }` inputs in frame order
(after source events of the same frame).

## Project layout

```
operators/            the analyses: YAML state transition tables + generated traces
src/core/             types, marble parser, simulator, zod schema, coverage, validation, YAML round-trip
src/machines/         executable Mealy models (bufferCount, windowCount) + registry
src/render/           4-lane SVG renderer, standalone HTML page, design tokens
src/artifacts/        Markdown artifacts (spec, table, traces) and the test-file generator
src/cli/              commander CLI
web/                  framework-less Vite viewer (reads only the YAML files)
tests/                Vitest: marble, simulator, renderer, and per-operator coverage + differential tests
generated/            output of `npm run generate`
docs/                 the original method notes
```

## Contributors

| Contributor | Role |
|---|---|
| **Claude Fable 5.1** (Anthropic) — `noreply@anthropic.com` | Main contributor: architecture, core simulator, Mealy models for `bufferCount` and `windowCount`, YAML state transition tables, 4-lane SVG/HTML renderer, CLI, web viewer, artifact generators, differential test suite, documentation |
| **Hans Schenker** | Project owner: the Mealy 6-tuple analysis method and the operator analyses in `docs/`, requirements, review |

Every commit authored with Claude carries a `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
trailer so the contribution is recorded in the git history as well.
