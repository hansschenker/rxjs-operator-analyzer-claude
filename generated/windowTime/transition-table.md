# windowTime — State Transition Table

One row per guarded (state, input) pair. T gives the next state, G the ordered output word. ⁽ᵘ⁾ = listed for totality, unreachable.

| Rule | State s | Input z | Guard | T(s, z) → s′ | G(s, z) | Evidence | Fired in |
|---|---|---|---|---|---|---|---|
| I0 | `—` | `subscribe` | always | `([w1:0@span], tick@interval \| null, active)` | `open(w1)` | windowTime.ts:113-116, 146-155, 130-143 | span-only-3, max-size-2, overlapping-span-3-interval-2, gap-span-2-interval-4, error-mid-stream, empty-source |
| V1 | `(records ≠ [], tick, active)` | `value(v)` | no window reaches maxWindowSize | `(records with seen + 1 for each, tick, active)` | `w.next(v) for each open w, oldest first` | windowTime.ts:178-184 | span-only-3, max-size-2, overlapping-span-3-interval-2, gap-span-2-interval-4, error-mid-stream |
| V2 | `(records ≠ [], tick, active)` | `value(v)` | some window reaches maxWindowSize | `(full windows removed and their close timers cancelled; restartOnClose ⇒ one new window per closed one, tick, active)` | `for each open w, oldest first: w.next(v), then if full: w.complete and, if restartOnClose, open(w_new)` | windowTime.ts:180-184, 118-124, 130-143 | max-size-2 |
| V3 | `([], tick, active)` | `value(v)` | no window open | `unchanged` | none | windowTime.ts:163, 180 | gap-span-2-interval-4 |
| TC1 | `(records ∋ wk, ∅, active)` | `timer(close_k)` | restartOnClose | `((records \ wk) ++ [w_new:0@now+span], ∅, active)` | `wk.complete; open(w_new)` | windowTime.ts:118-124, 152, 130-143 | span-only-3, error-mid-stream |
| TC2 | `(records ∋ wk, tick, active)` | `timer(close_k)` | ¬restartOnClose | `(records \ wk, tick, active)` | `wk.complete` | windowTime.ts:118-123 | overlapping-span-3-interval-2, gap-span-2-interval-4 |
| TI1 | `(records, tick, active)` | `timer(tick)` | always | `(records ++ [w_new:0@now+span], tick@now+interval, active)` | `open(w_new)` | windowTime.ts:150, 130-143; executeSchedule.ts:26-30 | overlapping-span-3-interval-2, gap-span-2-interval-4 |
| C1 | `(records, tick, active)` | `complete` | always | `(∅, completed)` | `w.complete for each open w, oldest first; complete` | windowTime.ts:169-173, 187 | span-only-3, max-size-2, overlapping-span-3-interval-2, gap-span-2-interval-4, empty-source |
| E1 | `(records, tick, active)` | `error(e)` | always | `(∅, errored)` | `w.error(e) for each open w, oldest first; error(e)` | windowTime.ts:169-173, 189 | error-mid-stream |
| F1 | `any` | `finalize` | always | `⊥ (windowRecords := null, finalized)` | none | windowTime.ts:196-199 | span-only-3, max-size-2, overlapping-span-3-interval-2, gap-span-2-interval-4, error-mid-stream, empty-source |
| X1 ⁽ᵘ⁾ | `(·, ·, completed \| errored)` | `value(v)` | phase ≠ active, or a timer that belongs to no open window | `unchanged` | none | rxjs Subscriber.ts: a stopped Subscriber (isStopped) ignores further next/error/complete calls; windowTime.ts:121 unsubscribes a closed window's timer | — (unreachable) |

## Coverage

- reachable rules: 10, fired by at least one scenario: 10
