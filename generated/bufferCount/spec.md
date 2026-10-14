# bufferCount — Mealy 6-tuple formal specification

**Baseline:** rxjs 7.8.2 — `src/internal/operators/bufferCount.ts`  
**Category:** transformation  
**Signature:** `bufferCount<T>(bufferSize: number, startBufferEvery: number | null = null): OperatorFunction<T, T[]>`

> Buffers the source values and emits each buffer as an array once it holds `bufferSize` values. A new
> buffer is started on the first value and then every `startBufferEvery` values, so buffers overlap
> when startBufferEvery < bufferSize, are back-to-back when equal, and leave gaps (dropped values)
> when startBufferEvery > bufferSize. On completion every open buffer is flushed; on error open
> buffers are discarded.

## Parameters

| Name | Type | Default | Normalized | Description |
|---|---|---|---|---|
| `bufferSize` | `number` |  |  | Maximum number of values a buffer collects before it is emitted. |
| `startBufferEvery` | `number \| null` | `null` | `N = startBufferEvery ?? bufferSize   (bufferCount.ts:60)` | Interval, in source values, at which a new buffer is started. |

## 1. State space — S

`S = (buffers: T[][], count: ℕ) × phase,  phase ∈ {active, completed, errored, finalized}`

`buffers` holds every buffer that is still collecting values, oldest first; `count` is the number of
source values seen so far and drives the start-of-buffer cycle (count mod N).

| Component | Type | Description |
|---|---|---|
| `buffers` | `T[][]` | open (not yet emitted) buffers, oldest first |
| `count` | `ℕ` | number of source values received so far |
| `phase` | `active \| completed \| errored \| finalized` | subscription lifecycle |

**Invariants**

- ∀ b ∈ buffers: 0 < |b| < bufferSize  (a full buffer is emitted and removed within the same step)
- |buffers| ≤ ⌈bufferSize / N⌉
- a new buffer opens exactly when count mod N = 0, with count taken before the increment
- no buffer is ever emitted empty
- after complete, error or finalize no further output is produced

## 2. Initial state — S₀

`S0 = ([], 0, active)`

No buffer exists until the first value arrives (bufferCount.ts:63-64).

## 3. Input alphabet — Z

Z = { subscribe, value(v), complete, error(e), finalize }

| Symbol | Meaning |
|---|---|
| `subscribe` | downstream subscribes; the operator initialises its closure state |
| `value(v)` | source emits a value (bufferCount.ts:69) |
| `complete` | source completes (bufferCount.ts:103) |
| `error(e)` | source errors; passed straight through (bufferCount.ts:112) |
| `finalize` | subscription torn down (bufferCount.ts:113) |

## 4. Output alphabet — A

A = { emit(buffer), complete, error(e) }

| Symbol | Meaning |
|---|---|
| `emit(buffer)` | subscriber.next(buffer) with a T[] |
| `complete` | subscriber.complete() |
| `error(e)` | subscriber.error(e) |

## 5. Transition function — T : S × Z → S

### T(s, subscribe)

- **S0** — state `—`, when always:  T = `([], 0, active)`

### T(s, value(v))

- **V1** — state `(buffers, count, active)`, when count mod N = 0 ∧ no buffer reaches bufferSize after appending v:  T = `((buffers ++ [[]]) ⊕ v, count + 1, active)`
- **V2** — state `(buffers, count, active)`, when count mod N = 0 ∧ some buffer reaches bufferSize after appending v:  T = `(((buffers ++ [[]]) ⊕ v) \ full, count + 1, active)`
- **V3** — state `(buffers ≠ [], count, active)`, when count mod N ≠ 0 ∧ no buffer reaches bufferSize after appending v:  T = `(buffers ⊕ v, count + 1, active)`
- **V4** — state `(buffers ≠ [], count, active)`, when count mod N ≠ 0 ∧ some buffer reaches bufferSize after appending v:  T = `((buffers ⊕ v) \ full, count + 1, active)`
- **V5** — state `([], count, active)`, when count mod N ≠ 0 ∧ no buffer is open:  T = `([], count + 1, active)`
- **X1** — state `(·, ·, completed | errored)`, when phase ≠ active:  T = `unchanged` _(not reachable through the subscription protocol)_

### T(s, complete)

- **C1** — state `(buffers ≠ [], count, active)`, when always:  T = `(∅, count, completed)`
- **C2** — state `([], count, active)`, when always:  T = `(∅, count, completed)`

### T(s, error(e))

- **E1** — state `(buffers, count, active)`, when always:  T = `(∅, count, errored)`

### T(s, finalize)

- **F1** — state `any`, when always:  T = `⊥ (buffers := null, finalized)`

## 6. Output function — G : S × Z → A*

### G(s, subscribe)

- **S0** — when always:  G = `[] (none)`
  - Parameter normalisation N = startBufferEvery ?? bufferSize happens once, before subscription (line 60).

### G(s, value(v))

- **V1** — when count mod N = 0 ∧ no buffer reaches bufferSize after appending v:  G = `[] (none)`
  - ⊕ v appends v to every open buffer.
- **V2** — when count mod N = 0 ∧ some buffer reaches bufferSize after appending v:  G = `[emit(b) for each full b, oldest first]`
  - Happens with bufferSize = 1 (the new buffer is full at once) or with overlapping buffers.
- **V3** — when count mod N ≠ 0 ∧ no buffer reaches bufferSize after appending v:  G = `[] (none)`
- **V4** — when count mod N ≠ 0 ∧ some buffer reaches bufferSize after appending v:  G = `[emit(b) for each full b, oldest first]`
  - Full buffers are collected in `toEmit` first and emitted after the loop so the list is not mutated while iterating (lines 82-90).
- **V5** — when count mod N ≠ 0 ∧ no buffer is open:  G = `[] (none)`
  - The value is dropped. Reachable only when N > bufferSize (gaps between buffers).
- **X1** — when phase ≠ active:  G = `[] (none)`
  - Listed for totality only. RxJS subscribers never deliver inputs after a terminal notification.

### G(s, complete)

- **C1** — when always:  G = `[emit(b) for each open b, oldest first; complete]`
  - Partial buffers are flushed; this is the only way a buffer shorter than bufferSize is emitted.
- **C2** — when always:  G = `[complete]`

### G(s, error(e))

- **E1** — when always:  G = `[error(e)]`
  - Open buffers are discarded, never emitted.

### G(s, finalize)

- **F1** — when always:  G = `[] (none)`

## Scenarios

| Scenario | Parameters | Source | Expected (outer) | Rules fired |
|---|---|---|---|---|
| overlapping-2-1 | `bufferSize: 2, startBufferEvery: 1` | `-a-b-c-d-\|` | `---x-y-z-(w\|)` | S0 V1 V2 C1 F1 |
| non-overlapping-2 | `bufferSize: 2` | `-a-b-c-d-e-\|` | `---x---y---(z\|)` | S0 V1 V4 C1 F1 |
| skip-less-than-size-3-2 | `bufferSize: 3, startBufferEvery: 2` | `-a-b-c-d-e-\|` | `-----x---y-(z\|)` | S0 V1 V3 V2 C1 F1 |
| skip-greater-than-size-2-3 | `bufferSize: 2, startBufferEvery: 3` | `-a-b-c-d-e-f-\|` | `---x-----y---\|` | S0 V1 V4 V5 C2 F1 |
| size-1 | `bufferSize: 1` | `-a-b-c-\|` | `-x-y-z-\|` | S0 V2 C2 F1 |
| error-mid-stream | `bufferSize: 2` | `-a-b-c-#` | `---x---#` | S0 V1 V4 E1 F1 |
| empty-source | `bufferSize: 2` | `-\|` | `-\|` | S0 C2 F1 |
