# debounceTime — State Transition Table

One row per guarded (state, input) pair. T gives the next state, G the ordered output word. ⁽ᵘ⁾ = listed for totality, unreachable.

| Rule | State s | Input z | Guard | T(s, z) → s′ | G(s, z) | Evidence | Fired in |
|---|---|---|---|---|---|---|---|
| S0 | `—` | `subscribe` | always | `(∅, ∅, ∅, active)` | none | debounceTime.ts:65-67 | burst-then-quiet, single-value, spaced-values, same-frame-tie, error-drops-pending, empty-source |
| V1 | `(·, ·, ∅, active)` | `value(v)` | no task armed | `(v, now, t@now+dueTime, active)` | none | debounceTime.ts:98-106 | burst-then-quiet, single-value, spaced-values, same-frame-tie, error-drops-pending |
| V2 | `(·, ·, t, active)` | `value(v)` | task armed | `(v, now, t, active)` | none | debounceTime.ts:98-101, 103 | burst-then-quiet, same-frame-tie |
| T1 | `(v, lastTime, t, active)` | `timer(t)` | now < lastTime + dueTime | `(v, lastTime, t′@lastTime+dueTime, active)` | none | debounceTime.ts:83-89 | burst-then-quiet, same-frame-tie |
| T2 | `(v, lastTime, t, active)` | `timer(t)` | now ≥ lastTime + dueTime | `(∅, lastTime, ∅, active)` | `emit(v)` | debounceTime.ts:83-85, 92, 69-77 | burst-then-quiet, single-value, spaced-values, same-frame-tie |
| C1 | `(v, ·, t, active)` | `complete` | task armed | `(∅, lastTime, ∅, completed)` | `emit(v); complete` | debounceTime.ts:108-112, 69-77 | burst-then-quiet, spaced-values |
| C2 | `(∅, ·, ∅, active)` | `complete` | no task armed | `(∅, lastTime, ∅, completed)` | `complete` | debounceTime.ts:108-112, 70 | single-value, same-frame-tie, empty-source |
| E1 | `(·, ·, ·, active)` | `error(e)` | always | `(∅, lastTime, ∅, errored)` | `error(e)` | debounceTime.ts:115 (error handler undefined ⇒ pass-through) | error-drops-pending |
| F1 | `any` | `finalize` | always | `⊥ (lastValue := null, activeTask := null, finalized)` | none | debounceTime.ts:116-119 | burst-then-quiet, single-value, spaced-values, same-frame-tie, error-drops-pending, empty-source |
| X1 ⁽ᵘ⁾ | `(·, ·, ·, completed \| errored)` | `value(v)` | phase ≠ active, or a timer that is no longer the armed task | `unchanged` | none | rxjs Subscriber.ts: a stopped Subscriber (isStopped) ignores further next/error/complete calls; debounceTime.ts:72 unsubscribes a superseded task | — (unreachable) |

## Coverage

- reachable rules: 9, fired by at least one scenario: 9
