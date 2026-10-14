# debounceTime — Mealy 6-tuple formal specification

**Baseline:** rxjs 7.8.2 — `src/internal/operators/debounceTime.ts`  
**Category:** filtering  
**Signature:** `debounceTime<T>(dueTime: number, scheduler: SchedulerLike = asyncScheduler): MonoTypeOperatorFunction<T>`

> Emits the most recent source value once `dueTime` has passed without another source value, and drops
> every value that is superseded during the wait. RxJS 7 does not cancel and restart a timer on every
> value: a single task is scheduled by the first value, and when it fires it checks whether a newer
> value arrived meanwhile — if so it re-schedules itself for the remaining time, otherwise it emits.
> On completion a pending value is flushed before the completion; on error it is dropped.

## Parameters

| Name | Type | Default | Normalized | Description |
|---|---|---|---|---|
| `dueTime` | `number` |  |  | Silence required after the latest value before it is emitted, in frames (virtual ms). |

## 1. State space — S

`S = (lastValue: T | null, lastTime: ℕ | null, task: Timer | null) × phase,  phase ∈ {active, completed, errored, finalized}`

`lastValue` is the pending (most recent) value, `lastTime` the frame it arrived in, `task` the one
scheduler action that is currently armed, written t@due (its id and the frame it fires in).

| Component | Type | Description |
|---|---|---|
| `lastValue` | `T \| null` | most recent source value not yet emitted |
| `lastTime` | `ℕ \| null` | frame of the most recent source value (scheduler.now()) |
| `task` | `Timer \| null` | the armed scheduler action (emitWhenIdle), at most one |
| `phase` | `active \| completed \| errored \| finalized` | subscription lifecycle |

**Invariants**

- task ≠ null ⇔ lastValue ≠ null  (a value is pending exactly while a task is armed)
- at most one task is armed at any time (debounceTime.ts:103)
- a value is emitted only when now ≥ lastTime + dueTime, i.e. after dueTime frames of silence
- the emitted value is always the most recent one received; superseded values are never emitted
- after complete, error or finalize no further output is produced

## 2. Initial state — S₀

`S0 = (∅, ∅, ∅, active)`

Nothing pending and no task armed (debounceTime.ts:65-67).

## 3. Input alphabet — Z

Z = { subscribe, value(v), timer(t), complete, error(e), finalize }

| Symbol | Meaning |
|---|---|
| `subscribe` | downstream subscribes; the operator initialises its closure state |
| `value(v)` | source emits a value (debounceTime.ts:98) |
| `timer(t)` | the armed scheduler task t fires — emitWhenIdle (debounceTime.ts:79) |
| `complete` | source completes (debounceTime.ts:108) |
| `error(e)` | source errors; passed straight through (debounceTime.ts:115) |
| `finalize` | subscription torn down (debounceTime.ts:116) |

## 4. Output alphabet — A

A = { emit(v), complete, error(e) }

| Symbol | Meaning |
|---|---|
| `emit(v)` | subscriber.next(v) with the pending value |
| `complete` | subscriber.complete() |
| `error(e)` | subscriber.error(e) |

## 5. Transition function — T : S × Z → S

### T(s, subscribe)

- **S0** — state `—`, when always:  T = `(∅, ∅, ∅, active)`

### T(s, value(v))

- **V1** — state `(·, ·, ∅, active)`, when no task armed:  T = `(v, now, t@now+dueTime, active)`
- **V2** — state `(·, ·, t, active)`, when task armed:  T = `(v, now, t, active)`
- **X1** — state `(·, ·, ·, completed | errored)`, when phase ≠ active, or a timer that is no longer the armed task:  T = `unchanged` _(not reachable through the subscription protocol)_

### T(s, timer(t))

- **T1** — state `(v, lastTime, t, active)`, when now < lastTime + dueTime:  T = `(v, lastTime, t′@lastTime+dueTime, active)`
- **T2** — state `(v, lastTime, t, active)`, when now ≥ lastTime + dueTime:  T = `(∅, lastTime, ∅, active)`

### T(s, complete)

- **C1** — state `(v, ·, t, active)`, when task armed:  T = `(∅, lastTime, ∅, completed)`
- **C2** — state `(∅, ·, ∅, active)`, when no task armed:  T = `(∅, lastTime, ∅, completed)`

### T(s, error(e))

- **E1** — state `(·, ·, ·, active)`, when always:  T = `(∅, lastTime, ∅, errored)`

### T(s, finalize)

- **F1** — state `any`, when always:  T = `⊥ (lastValue := null, activeTask := null, finalized)`

## 6. Output function — G : S × Z → A*

### G(s, subscribe)

- **S0** — when always:  G = `[] (none)`

### G(s, value(v))

- **V1** — when no task armed:  G = `[] (none)`
  - The first value of a burst arms the only task. Later values of the burst never touch the timer (rule V2).
- **V2** — when task armed:  G = `[] (none)`
  - Only lastValue and lastTime change; the running task re-checks the time when it fires.
- **X1** — when phase ≠ active, or a timer that is no longer the armed task:  G = `[] (none)`
  - Listed for totality only.

### G(s, timer(t))

- **T1** — when now < lastTime + dueTime:  G = `[] (none)`
  - A newer value arrived during the wait, so the task re-schedules itself for the remaining time instead of emitting.
- **T2** — when now ≥ lastTime + dueTime:  G = `[emit(v)]`
  - The silence lasted dueTime frames; the pending value is emitted and the task released.

### G(s, complete)

- **C1** — when task armed:  G = `[emit(v); complete]`
  - The pending value is flushed immediately (the task is unsubscribed), then the stream completes.
- **C2** — when no task armed:  G = `[complete]`

### G(s, error(e))

- **E1** — when always:  G = `[error(e)]`
  - A pending value is dropped; the armed task is cancelled by the subscriber teardown (line 105 added it to the subscriber).

### G(s, finalize)

- **F1** — when always:  G = `[] (none)`

## Scenarios

| Scenario | Parameters | Source | Expected (outer) | Rules fired |
|---|---|---|---|---|
| burst-then-quiet | `dueTime: 3` | `-a-b-c-----d-\|` | `--------x----(y\|)` | S0 V1 V2 T1 T2 C1 F1 |
| single-value | `dueTime: 2` | `-a----\|` | `---x--\|` | S0 V1 T2 C2 F1 |
| spaced-values | `dueTime: 2` | `-a---b---c\|` | `---x---y--(z\|)` | S0 V1 T2 C1 F1 |
| same-frame-tie | `dueTime: 2` | `-a-b---\|` | `-----x-\|` | S0 V1 V2 T1 T2 C2 F1 |
| error-drops-pending | `dueTime: 3` | `-a-#` | `---#` | S0 V1 E1 F1 |
| empty-source | `dueTime: 3` | `-\|` | `-\|` | S0 C2 F1 |
