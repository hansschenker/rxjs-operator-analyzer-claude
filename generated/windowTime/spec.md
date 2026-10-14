# windowTime — Mealy 6-tuple formal specification

**Baseline:** rxjs 7.8.2 — `src/internal/operators/windowTime.ts`  
**Category:** transformation  
**Signature:** `windowTime<T>(windowTimeSpan: number, windowCreationInterval?: number | null, maxWindowSize?: number, scheduler?: SchedulerLike): OperatorFunction<T, Observable<T>>`

> Branches the source into windows (inner Observables) that open and close by time. Every window
> completes windowTimeSpan frames after it opened. Without a windowCreationInterval the next window
> opens the moment the previous one closes, so exactly one window is open at any time. With a
> windowCreationInterval a new window opens every interval frames instead, so windows overlap when the
> interval is shorter than the span and leave gaps (dropped values) when it is longer. maxWindowSize
> closes a window early once it has relayed that many values. The first window is emitted during
> subscribe.

## Parameters

| Name | Type | Default | Normalized | Description |
|---|---|---|---|---|
| `windowTimeSpan` | `number` |  |  | Frames after which a window completes. |
| `windowCreationInterval` | `number \| null` | `null` | `interval = otherArgs[0] ?? null;  restartOnClose = ¬(interval ≠ null ∧ interval ≥ 0)   (windowTime.ts:108, 146-153)` | Interval, in frames, at which new windows are started. Absent means start the next window when one closes. |
| `maxWindowSize` | `number` | `Infinity` | `maxWindowSize = otherArgs[1] \|\| Infinity   (windowTime.ts:109) — 0 means unlimited` | Maximum number of values a window relays before it completes early. |

## 1. State space — S

`S = (records: {window, seen, close: Timer}[], tick: Timer | null) × phase,  phase ∈ {active, completed, errored, finalized}`

`records` holds the open windows oldest first, each with the number of values it has relayed and the
timer that will close it, written wk:seen@closeFrame. `tick` is the repeating creation-interval
timer, written tick@frame; it is null when the operator restarts windows on close instead.

| Component | Type | Description |
|---|---|---|
| `records` | `{ window: Subject<T>, seen: ℕ, subs: Subscription }[]` | open windows, oldest first, each owning its close timer |
| `tick` | `Timer \| null` | the repeating windowCreationInterval action, if any |
| `phase` | `active \| completed \| errored \| finalized` | subscription lifecycle |

**Invariants**

- restartOnClose ⇒ exactly one window is open at any time while active
- every window closes exactly windowTimeSpan frames after it opened unless maxWindowSize closes it earlier (then its close timer is cancelled)
- with a creation interval, |records| ≤ ⌈windowTimeSpan / windowCreationInterval⌉
- a value is relayed to every window open at that moment; a window opened by that very value does not receive it (loop over a copy, line 163)
- timers armed during subscribe (tick and c1) run before source events of the same frame; timers armed later run after them (VirtualTimeScheduler creation order)
- after complete, error or finalize no further output is produced and every timer is cancelled

## 2. Initial state — S₀

`S0 = ([w1:0@windowTimeSpan], tick@windowCreationInterval | null, active)`

The creation-interval timer, if any, is armed first (line 150); then the first window is opened, emitted and given its close timer (lines 155, 130-143).

## 3. Input alphabet — Z

Z = { subscribe, value(v), timer(close_k), timer(tick), complete, error(e), finalize }

| Symbol | Meaning |
|---|---|
| `subscribe` | downstream subscribes; timers are armed and the first window is emitted |
| `value(v)` | source emits a value (windowTime.ts:178) |
| `timer(close_k)` | window wk's span timer fires — closeWindow (windowTime.ts:118, 142) |
| `timer(tick)` | the creation-interval timer fires — startWindow (windowTime.ts:150) |
| `complete` | source completes (windowTime.ts:187) |
| `error(e)` | source errors (windowTime.ts:189) |
| `finalize` | subscription torn down (windowTime.ts:196) |

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

- **I0** — state `—`, when always:  T = `([w1:0@span], tick@interval | null, active)`

### T(s, value(v))

- **V1** — state `(records ≠ [], tick, active)`, when no window reaches maxWindowSize:  T = `(records with seen + 1 for each, tick, active)`
- **V2** — state `(records ≠ [], tick, active)`, when some window reaches maxWindowSize:  T = `(full windows removed and their close timers cancelled; restartOnClose ⇒ one new window per closed one, tick, active)`
- **V3** — state `([], tick, active)`, when no window open:  T = `unchanged`
- **X1** — state `(·, ·, completed | errored)`, when phase ≠ active, or a timer that belongs to no open window:  T = `unchanged` _(not reachable through the subscription protocol)_

### T(s, timer(close_k))

- **TC1** — state `(records ∋ wk, ∅, active)`, when restartOnClose:  T = `((records \ wk) ++ [w_new:0@now+span], ∅, active)`
- **TC2** — state `(records ∋ wk, tick, active)`, when ¬restartOnClose:  T = `(records \ wk, tick, active)`

### T(s, timer(tick))

- **TI1** — state `(records, tick, active)`, when always:  T = `(records ++ [w_new:0@now+span], tick@now+interval, active)`

### T(s, complete)

- **C1** — state `(records, tick, active)`, when always:  T = `(∅, completed)`

### T(s, error(e))

- **E1** — state `(records, tick, active)`, when always:  T = `(∅, errored)`

### T(s, finalize)

- **F1** — state `any`, when always:  T = `⊥ (windowRecords := null, finalized)`

## 6. Output function — G : S × Z → A*

### G(s, subscribe)

- **I0** — when always:  G = `[open(w1)]`
  - The timers armed here (tick first, then w1's close c1) sort before the source's own actions, so at a shared frame they run before a source value.

### G(s, value(v))

- **V1** — when no window reaches maxWindowSize:  G = `[w.next(v) for each open w, oldest first]`
- **V2** — when some window reaches maxWindowSize:  G = `[for each open w, oldest first: w.next(v), then if full: w.complete and, if restartOnClose, open(w_new)]`
  - The window opened by this value does not receive it (the loop runs over a copy, line 163).
- **V3** — when no window open:  G = `[] (none)`
  - The value is dropped. Reachable only when windowCreationInterval > windowTimeSpan (or windows closed early by maxWindowSize).
- **X1** — when phase ≠ active, or a timer that belongs to no open window:  G = `[] (none)`
  - Listed for totality only.

### G(s, timer(close_k))

- **TC1** — when restartOnClose:  G = `[wk.complete; open(w_new)]`
  - Back-to-back windows — the replacement opens in the same frame and before any source value of that frame if c_k was armed during subscribe.
- **TC2** — when ¬restartOnClose:  G = `[wk.complete]`

### G(s, timer(tick))

- **TI1** — when always:  G = `[open(w_new)]`
  - startWindow() arms the new window's close timer before the tick re-arms itself, so when both fall on one frame the close runs first.

### G(s, complete)

- **C1** — when always:  G = `[w.complete for each open w, oldest first; complete]`
  - subscriber.unsubscribe() cancels every pending close timer and the tick.

### G(s, error(e))

- **E1** — when always:  G = `[w.error(e) for each open w, oldest first; error(e)]`

### G(s, finalize)

- **F1** — when always:  G = `[] (none)`

## Scenarios

| Scenario | Parameters | Source | Expected (outer) | Rules fired |
|---|---|---|---|---|
| span-only-3 | `windowTimeSpan: 3` | `-a-b-c-d-e-\|` | `x--y--z--w-\|` | I0 V1 TC1 C1 F1 |
| max-size-2 | `windowTimeSpan: 5, maxWindowSize: 2` | `-a-b-c-d-\|` | `x--y---z-\|` | I0 V1 V2 C1 F1 |
| overlapping-span-3-interval-2 | `windowTimeSpan: 3, windowCreationInterval: 2` | `-a-b-c-d-\|` | `x-y-z-w-v\|` | I0 V1 TI1 TC2 C1 F1 |
| gap-span-2-interval-4 | `windowTimeSpan: 2, windowCreationInterval: 4` | `-a-b-c-d-e-\|` | `x---y---z--\|` | I0 V1 TC2 V3 TI1 C1 F1 |
| error-mid-stream | `windowTimeSpan: 3` | `-a-#` | `x--(y#)` | I0 V1 TC1 E1 F1 |
| empty-source | `windowTimeSpan: 3` | `-\|` | `x\|` | I0 C1 F1 |
