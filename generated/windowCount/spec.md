# windowCount — Mealy 6-tuple formal specification

**Baseline:** rxjs 7.8.2 — `src/internal/operators/windowCount.ts`  
**Category:** transformation  
**Signature:** `windowCount<T>(windowSize: number, startWindowEvery: number = 0): OperatorFunction<T, Observable<T>>`

> Branches the source into windows (inner Observables) of up to `windowSize` values. The first window
> is emitted immediately on subscribe; a new window is opened — and emitted downstream — after every
> `startWindowEvery` source values, and the oldest window completes once it has received `windowSize`
> values. Every value is relayed live to every open window, so windows overlap when startWindowEvery <
> windowSize and leave gaps (dropped values) when startWindowEvery > windowSize. A window opened on
> the last value completes empty.

## Parameters

| Name | Type | Default | Normalized | Description |
|---|---|---|---|---|
| `windowSize` | `number` |  |  | Maximum number of values emitted by each window. |
| `startWindowEvery` | `number` | `0` | `N = startWindowEvery > 0 ? startWindowEvery : windowSize   (windowCount.ts:69)` | Interval, in source values, at which a new window is started. |

## 1. State space — S

`S = (windows: Subject<T>[], count: ℕ) × phase,  phase ∈ {active, completed, errored, finalized}`

`windows` holds the open window Subjects, oldest first (modelled by their ids w1, w2, …); `count` is
the number of source values seen so far. Closing is decided from c = count − windowSize + 1 and
opening from count + 1, both relative to N.

| Component | Type | Description |
|---|---|---|
| `windows` | `Subject<T>[]` | open windows, oldest first |
| `count` | `ℕ` | number of source values received so far |
| `phase` | `active \| completed \| errored \| finalized` | subscription lifecycle |

**Invariants**

- |windows| ≤ ⌈windowSize / N⌉
- window w_k (k ≥ 1) receives the source values with indices (k−1)·N … (k−1)·N + windowSize − 1 and completes on the last of them
- every open window receives every value; a value arriving while no window is open is dropped (only when N > windowSize)
- within one value step the oldest window is closed before a new one is opened
- after complete, error or finalize no further output is produced

## 2. Initial state — S₀

`S0 = ([w1], 0, active)`

The first window Subject exists before any value and is emitted during subscribe (windowCount.ts:72-77).

## 3. Input alphabet — Z

Z = { subscribe, value(v), complete, error(e), finalize }

| Symbol | Meaning |
|---|---|
| `subscribe` | downstream subscribes; the first window is created and emitted |
| `value(v)` | source emits a value (windowCount.ts:82) |
| `complete` | source completes (windowCount.ts:110) |
| `error(e)` | source errors (windowCount.ts:116) |
| `finalize` | subscription torn down (windowCount.ts:122) |

## 4. Output alphabet — A

A = { open(w), w.next(v), w.complete, w.error(e), complete, error(e) }

| Symbol | Meaning |
|---|---|
| `open(w)` | subscriber.next(w.asObservable()) — a new window is emitted on the outer stream |
| `w.next(v)` | window Subject w relays the value v |
| `w.complete` | window Subject w completes |
| `w.error(e)` | window Subject w errors |
| `complete` | subscriber.complete() on the outer stream |
| `error(e)` | subscriber.error(e) on the outer stream |

## 5. Transition function — T : S × Z → S

### T(s, subscribe)

- **I0** — state `—`, when always:  T = `([w1], 0, active)`

### T(s, value(v))

- **V1** — state `(windows ≠ [], count, active)`, when ¬close ∧ ¬open:  T = `(windows, count + 1, active)`
- **V2** — state `(windows ≠ [], count, active)`, when close ∧ ¬open:  T = `(windows \ oldest, count + 1, active)`
- **V3** — state `(windows ≠ [], count, active)`, when ¬close ∧ open:  T = `(windows ++ [w_new], count + 1, active)`
- **V4** — state `(windows ≠ [], count, active)`, when close ∧ open:  T = `((windows \ oldest) ++ [w_new], count + 1, active)`
- **V5** — state `([], count, active)`, when ¬open:  T = `([], count + 1, active)`
- **V6** — state `([], count, active)`, when open:  T = `([w_new], count + 1, active)`
- **X1** — state `(·, ·, completed | errored)`, when phase ≠ active:  T = `unchanged` _(not reachable through the subscription protocol)_

### T(s, complete)

- **C1** — state `(windows, count, active)`, when always:  T = `(∅, count, completed)`

### T(s, error(e))

- **E1** — state `(windows, count, active)`, when always:  T = `(∅, count, errored)`

### T(s, finalize)

- **F1** — state `any`, when always:  T = `⊥ (windows := null, finalized)`

## 6. Output function — G : S × Z → A*

### G(s, subscribe)

- **I0** — when always:  G = `[open(w1)]`
  - Unlike bufferCount, an output is produced before any source value arrives.

### G(s, value(v))

- **V1** — when ¬close ∧ ¬open:  G = `[w.next(v) for each open w, oldest first]`
  - close ⇔ c ≥ 0 ∧ c mod N = 0 with c = count − windowSize + 1 (lines 94-95); open ⇔ (count + 1) mod N = 0 (line 104).
- **V2** — when close ∧ ¬open:  G = `[w.next(v) for each open w, oldest first; oldest.complete]`
- **V3** — when ¬close ∧ open:  G = `[w.next(v) for each open w, oldest first; open(w_new)]`
  - The new window is emitted before it has received any value (see the TODO at lines 100-103).
- **V4** — when close ∧ open:  G = `[w.next(v) for each open w, oldest first; oldest.complete; open(w_new)]`
  - The steady state of non-overlapping windows (N = windowSize) — close and open on the same value.
- **V5** — when ¬open:  G = `[] (none)`
  - The value is dropped. Reachable only when N ≥ windowSize + 2.
- **V6** — when open:  G = `[open(w_new)]`
  - The value is dropped and the next window opens for the values that follow. Reachable only when N > windowSize.
- **X1** — when phase ≠ active:  G = `[] (none)`
  - Listed for totality only. RxJS subscribers never deliver inputs after a terminal notification.

### G(s, complete)

- **C1** — when always:  G = `[w.complete for each open w, oldest first; complete]`
  - A window opened on the last source value completes empty — bufferCount never emits an empty buffer.

### G(s, error(e))

- **E1** — when always:  G = `[w.error(e) for each open w, oldest first; error(e)]`

### G(s, finalize)

- **F1** — when always:  G = `[] (none)`
  - The unused `starts` array is released as well.

## Scenarios

| Scenario | Parameters | Source | Expected (outer) | Rules fired |
|---|---|---|---|---|
| overlapping-2-1 | `windowSize: 2, startWindowEvery: 1` | `-a-b-c-d-\|` | `xy-z-w-v-\|` | I0 V3 V4 C1 F1 |
| non-overlapping-2 | `windowSize: 2` | `-a-b-c-d-e-\|` | `x--y---z---\|` | I0 V1 V4 C1 F1 |
| ends-on-boundary-2 | `windowSize: 2` | `-a-b-\|` | `x--y-\|` | I0 V1 V4 C1 F1 |
| gap-2-4 | `windowSize: 2, startWindowEvery: 4` | `-a-b-c-d-e-\|` | `x------y---\|` | I0 V1 V2 V5 V6 C1 F1 |
| error-mid-stream | `windowSize: 2` | `-a-#` | `x--#` | I0 V1 E1 F1 |
| empty-source | `windowSize: 2` | `-\|` | `x\|` | I0 C1 F1 |
