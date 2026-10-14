# windowCount — State Transition Table

One row per guarded (state, input) pair. T gives the next state, G the ordered output word. ⁽ᵘ⁾ = listed for totality, unreachable.

| Rule | State s | Input z | Guard | T(s, z) → s′ | G(s, z) | Evidence | Fired in |
|---|---|---|---|---|---|---|---|
| I0 | `—` | `subscribe` | always | `([w1], 0, active)` | `open(w1)` | windowCount.ts:72-77 | overlapping-2-1, non-overlapping-2, ends-on-boundary-2, gap-2-4, error-mid-stream, empty-source |
| V1 | `(windows ≠ [], count, active)` | `value(v)` | ¬close ∧ ¬open | `(windows, count + 1, active)` | `w.next(v) for each open w, oldest first` | windowCount.ts:86-88 | non-overlapping-2, ends-on-boundary-2, gap-2-4, error-mid-stream |
| V2 | `(windows ≠ [], count, active)` | `value(v)` | close ∧ ¬open | `(windows \ oldest, count + 1, active)` | `w.next(v) for each open w, oldest first; oldest.complete` | windowCount.ts:86-88, 94-97 | gap-2-4 |
| V3 | `(windows ≠ [], count, active)` | `value(v)` | ¬close ∧ open | `(windows ++ [w_new], count + 1, active)` | `w.next(v) for each open w, oldest first; open(w_new)` | windowCount.ts:86-88, 104-108 | overlapping-2-1 |
| V4 | `(windows ≠ [], count, active)` | `value(v)` | close ∧ open | `((windows \ oldest) ++ [w_new], count + 1, active)` | `w.next(v) for each open w, oldest first; oldest.complete; open(w_new)` | windowCount.ts:86-88, 94-97, 104-108 | overlapping-2-1, non-overlapping-2, ends-on-boundary-2 |
| V5 | `([], count, active)` | `value(v)` | ¬open | `([], count + 1, active)` | none | windowCount.ts:86 (empty loop), 104 | gap-2-4 |
| V6 | `([], count, active)` | `value(v)` | open | `([w_new], count + 1, active)` | `open(w_new)` | windowCount.ts:86 (empty loop), 104-108 | gap-2-4 |
| C1 | `(windows, count, active)` | `complete` | always | `(∅, count, completed)` | `w.complete for each open w, oldest first; complete` | windowCount.ts:110-115 | overlapping-2-1, non-overlapping-2, ends-on-boundary-2, gap-2-4, empty-source |
| E1 | `(windows, count, active)` | `error(e)` | always | `(∅, count, errored)` | `w.error(e) for each open w, oldest first; error(e)` | windowCount.ts:116-121 | error-mid-stream |
| F1 | `any` | `finalize` | always | `⊥ (windows := null, finalized)` | none | windowCount.ts:122-125 | overlapping-2-1, non-overlapping-2, ends-on-boundary-2, gap-2-4, error-mid-stream, empty-source |
| X1 ⁽ᵘ⁾ | `(·, ·, completed \| errored)` | `value(v)` | phase ≠ active | `unchanged` | none | rxjs Subscriber.ts: a stopped Subscriber (isStopped) ignores further next/error/complete calls | — (unreachable) |

## Coverage

- reachable rules: 10, fired by at least one scenario: 10
