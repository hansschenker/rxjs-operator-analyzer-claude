# bufferCount — State Transition Table

One row per guarded (state, input) pair. T gives the next state, G the ordered output word. ⁽ᵘ⁾ = listed for totality, unreachable.

| Rule | State s | Input z | Guard | T(s, z) → s′ | G(s, z) | Evidence | Fired in |
|---|---|---|---|---|---|---|---|
| S0 | `—` | `subscribe` | always | `([], 0, active)` | none | bufferCount.ts:63-64 | overlapping-2-1, non-overlapping-2, skip-less-than-size-3-2, skip-greater-than-size-2-3, size-1, error-mid-stream, empty-source |
| V1 | `(buffers, count, active)` | `value(v)` | count mod N = 0 ∧ no buffer reaches bufferSize after appending v | `((buffers ++ [[]]) ⊕ v, count + 1, active)` | none | bufferCount.ts:75-77 (open), 80-81 (append) | overlapping-2-1, non-overlapping-2, skip-less-than-size-3-2, skip-greater-than-size-2-3, error-mid-stream |
| V2 | `(buffers, count, active)` | `value(v)` | count mod N = 0 ∧ some buffer reaches bufferSize after appending v | `(((buffers ++ [[]]) ⊕ v) \ full, count + 1, active)` | `emit(b) for each full b, oldest first` | bufferCount.ts:75-77, 80-90, 93-101 | overlapping-2-1, skip-less-than-size-3-2, size-1 |
| V3 | `(buffers ≠ [], count, active)` | `value(v)` | count mod N ≠ 0 ∧ no buffer reaches bufferSize after appending v | `(buffers ⊕ v, count + 1, active)` | none | bufferCount.ts:80-81 | skip-less-than-size-3-2 |
| V4 | `(buffers ≠ [], count, active)` | `value(v)` | count mod N ≠ 0 ∧ some buffer reaches bufferSize after appending v | `((buffers ⊕ v) \ full, count + 1, active)` | `emit(b) for each full b, oldest first` | bufferCount.ts:80-90, 93-101 | non-overlapping-2, skip-greater-than-size-2-3, error-mid-stream |
| V5 | `([], count, active)` | `value(v)` | count mod N ≠ 0 ∧ no buffer is open | `([], count + 1, active)` | none | bufferCount.ts:75-77 (no open), 80 (empty loop) | skip-greater-than-size-2-3 |
| C1 | `(buffers ≠ [], count, active)` | `complete` | always | `(∅, count, completed)` | `emit(b) for each open b, oldest first; complete` | bufferCount.ts:103-110 | overlapping-2-1, non-overlapping-2, skip-less-than-size-3-2 |
| C2 | `([], count, active)` | `complete` | always | `(∅, count, completed)` | `complete` | bufferCount.ts:103-110 | skip-greater-than-size-2-3, size-1, empty-source |
| E1 | `(buffers, count, active)` | `error(e)` | always | `(∅, count, errored)` | `error(e)` | bufferCount.ts:112 (error handler undefined ⇒ pass-through) | error-mid-stream |
| F1 | `any` | `finalize` | always | `⊥ (buffers := null, finalized)` | none | bufferCount.ts:113-116 | overlapping-2-1, non-overlapping-2, skip-less-than-size-3-2, skip-greater-than-size-2-3, size-1, error-mid-stream, empty-source |
| X1 ⁽ᵘ⁾ | `(·, ·, completed \| errored)` | `value(v)` | phase ≠ active | `unchanged` | none | rxjs Subscriber.ts: a stopped Subscriber (isStopped) ignores further next/error/complete calls | — (unreachable) |

## Coverage

- reachable rules: 10, fired by at least one scenario: 10
