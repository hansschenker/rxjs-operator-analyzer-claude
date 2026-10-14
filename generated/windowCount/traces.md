# windowCount — Execution traces

Every scenario is simulated by the executable Mealy model; each step shows the input, the rule that fired, the state after T and the output word G.

## overlapping-2-1 — `windowCount(2, 1)`

windowCount(2, 1) — a new window on every value, each value in two windows

- source: `-a-b-c-d-|`
- expected outer marble: `xy-z-w-v-|` with `{"x":"w1","y":"w2","z":"w3","w":"w4","v":"w5"}`
- rules fired: I0 → V3 → V4 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | I0 | `([w1], 0)` | `open(w1)` |
| 1 | 1 | `value(a)` | V3 | `([w1, w2], 1)` | `w1.next(a), open(w2)` |
| 2 | 3 | `value(b)` | V4 | `([w2, w3], 2)` | `w1.next(b), w2.next(b), w1.complete, open(w3)` |
| 3 | 5 | `value(c)` | V4 | `([w3, w4], 3)` | `w2.next(c), w3.next(c), w2.complete, open(w4)` |
| 4 | 7 | `value(d)` | V4 | `([w4, w5], 4)` | `w3.next(d), w4.next(d), w3.complete, open(w5)` |
| 5 | 9 | `complete` | C1 | `(∅, 4) completed` | `w4.complete, w5.complete, complete` |
| 6 | 9 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| 2 input |  | a |  | b |  | c |  | d |  | \| |
| 3 rule | I0 | V3 |  | V4 |  | V4 |  | V4 |  | C1 F1 |
| 3 state | ([w1], 0) | ([w1, w2], 1) |  | ([w2, w3], 2) |  | ([w3, w4], 3) |  | ([w4, w5], 4) |  | (∅, 4) completed |
| 4 output | w1 | w2 |  | w3 |  | w4 |  | w5 |  | \| |
| 4 w1 |  | a |  | b \| |  |  |  |  |  |  |
| 4 w2 |  |  |  | b |  | c \| |  |  |  |  |
| 4 w3 |  |  |  |  |  | c |  | d \| |  |  |
| 4 w4 |  |  |  |  |  |  |  | d |  | \| |
| 4 w5 |  |  |  |  |  |  |  |  |  | \| |

## non-overlapping-2 — `windowCount(2)`

windowCount(2) — back-to-back windows; the last window holds one value

- source: `-a-b-c-d-e-|`
- expected outer marble: `x--y---z---|` with `{"x":"w1","y":"w2","z":"w3"}`
- rules fired: I0 → V1 → V4 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | I0 | `([w1], 0)` | `open(w1)` |
| 1 | 1 | `value(a)` | V1 | `([w1], 1)` | `w1.next(a)` |
| 2 | 3 | `value(b)` | V4 | `([w2], 2)` | `w1.next(b), w1.complete, open(w2)` |
| 3 | 5 | `value(c)` | V1 | `([w2], 3)` | `w2.next(c)` |
| 4 | 7 | `value(d)` | V4 | `([w3], 4)` | `w2.next(d), w2.complete, open(w3)` |
| 5 | 9 | `value(e)` | V1 | `([w3], 5)` | `w3.next(e)` |
| 6 | 11 | `complete` | C1 | `(∅, 5) completed` | `w3.complete, complete` |
| 7 | 11 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 | f10 | f11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
| 2 input |  | a |  | b |  | c |  | d |  | e |  | \| |
| 3 rule | I0 | V1 |  | V4 |  | V1 |  | V4 |  | V1 |  | C1 F1 |
| 3 state | ([w1], 0) | ([w1], 1) |  | ([w2], 2) |  | ([w2], 3) |  | ([w3], 4) |  | ([w3], 5) |  | (∅, 5) completed |
| 4 output | w1 |  |  | w2 |  |  |  | w3 |  |  |  | \| |
| 4 w1 |  | a |  | b \| |  |  |  |  |  |  |  |  |
| 4 w2 |  |  |  |  |  | c |  | d \| |  |  |  |  |
| 4 w3 |  |  |  |  |  |  |  |  |  | e |  | \| |

## ends-on-boundary-2 — `windowCount(2)`

windowCount(2) — source ends on a boundary, so w2 completes empty

- source: `-a-b-|`
- expected outer marble: `x--y-|` with `{"x":"w1","y":"w2"}`
- rules fired: I0 → V1 → V4 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | I0 | `([w1], 0)` | `open(w1)` |
| 1 | 1 | `value(a)` | V1 | `([w1], 1)` | `w1.next(a)` |
| 2 | 3 | `value(b)` | V4 | `([w2], 2)` | `w1.next(b), w1.complete, open(w2)` |
| 3 | 5 | `complete` | C1 | `(∅, 2) completed` | `w2.complete, complete` |
| 4 | 5 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 |
|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 |
| 2 input |  | a |  | b |  | \| |
| 3 rule | I0 | V1 |  | V4 |  | C1 F1 |
| 3 state | ([w1], 0) | ([w1], 1) |  | ([w2], 2) |  | (∅, 2) completed |
| 4 output | w1 |  |  | w2 |  | \| |
| 4 w1 |  | a |  | b \| |  |  |
| 4 w2 |  |  |  |  |  | \| |

## gap-2-4 — `windowCount(2, 4)`

windowCount(2, 4) — gap: c is dropped with no window open, d opens w2

- source: `-a-b-c-d-e-|`
- expected outer marble: `x------y---|` with `{"x":"w1","y":"w2"}`
- rules fired: I0 → V1 → V2 → V5 → V6 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | I0 | `([w1], 0)` | `open(w1)` |
| 1 | 1 | `value(a)` | V1 | `([w1], 1)` | `w1.next(a)` |
| 2 | 3 | `value(b)` | V2 | `([], 2)` | `w1.next(b), w1.complete` |
| 3 | 5 | `value(c)` | V5 | `([], 3)` | `none` |
| 4 | 7 | `value(d)` | V6 | `([w2], 4)` | `open(w2)` |
| 5 | 9 | `value(e)` | V1 | `([w2], 5)` | `w2.next(e)` |
| 6 | 11 | `complete` | C1 | `(∅, 5) completed` | `w2.complete, complete` |
| 7 | 11 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 | f10 | f11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
| 2 input |  | a |  | b |  | c |  | d |  | e |  | \| |
| 3 rule | I0 | V1 |  | V2 |  | V5 |  | V6 |  | V1 |  | C1 F1 |
| 3 state | ([w1], 0) | ([w1], 1) |  | ([], 2) |  | ([], 3) |  | ([w2], 4) |  | ([w2], 5) |  | (∅, 5) completed |
| 4 output | w1 |  |  |  |  |  |  | w2 |  |  |  | \| |
| 4 w1 |  | a |  | b \| |  |  |  |  |  |  |  |  |
| 4 w2 |  |  |  |  |  |  |  |  |  | e |  | \| |

## error-mid-stream — `windowCount(2)`

windowCount(2) — source errors; the open window receives the error first

- source: `-a-#`
- expected outer marble: `x--#` with `{"x":"w1"}`
- rules fired: I0 → V1 → E1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | I0 | `([w1], 0)` | `open(w1)` |
| 1 | 1 | `value(a)` | V1 | `([w1], 1)` | `w1.next(a)` |
| 2 | 3 | `error(#)` | E1 | `(∅, 1) errored` | `w1.error(#), error(#)` |
| 3 | 3 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 |
|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 |
| 2 input |  | a |  | # |
| 3 rule | I0 | V1 |  | E1 F1 |
| 3 state | ([w1], 0) | ([w1], 1) |  | (∅, 1) errored |
| 4 output | w1 |  |  | # |
| 4 w1 |  | a |  | # |

## empty-source — `windowCount(2)`

windowCount(2) — empty source: w1 completes empty, then the outer stream completes

- source: `-|`
- expected outer marble: `x|` with `{"x":"w1"}`
- rules fired: I0 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | I0 | `([w1], 0)` | `open(w1)` |
| 1 | 1 | `complete` | C1 | `(∅, 0) completed` | `w1.complete, complete` |
| 2 | 1 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 |
|---|---|---|
| 1 timeline | 0 | 1 |
| 2 input |  | \| |
| 3 rule | I0 | C1 F1 |
| 3 state | ([w1], 0) | (∅, 0) completed |
| 4 output | w1 | \| |
| 4 w1 |  | \| |
