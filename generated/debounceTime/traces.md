# debounceTime — Execution traces

Every scenario is simulated by the executable Mealy model; each step shows the input, the rule that fired, the state after T and the output word G.

## burst-then-quiet — `debounceTime(3)`

debounceTime(3) — the burst a, b, c collapses to c; d is flushed by the completion

- source: `-a-b-c-----d-|`
- expected outer marble: `--------x----(y|)` with `{"x":"c","y":"d"}`
- rules fired: S0 → V1 → V2 → T1 → T2 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `(∅, ∅, ∅)` | `none` |
| 1 | 1 | `value(a)` | V1 | `(a, 1, t1@4)` | `none` |
| 2 | 3 | `value(b)` | V2 | `(b, 3, t1@4)` | `none` |
| 3 | 4 | `timer(t1)` | T1 | `(b, 3, t2@6)` | `none` |
| 4 | 5 | `value(c)` | V2 | `(c, 5, t2@6)` | `none` |
| 5 | 6 | `timer(t2)` | T1 | `(c, 5, t3@8)` | `none` |
| 6 | 8 | `timer(t3)` | T2 | `(∅, 5, ∅)` | `emit(c)` |
| 7 | 11 | `value(d)` | V1 | `(d, 11, t4@14)` | `none` |
| 8 | 13 | `complete` | C1 | `(∅, 11, ∅) completed` | `emit(d), complete` |
| 9 | 13 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 | f10 | f11 | f12 | f13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
| 2 input |  | a |  | b | timer(t1) | c | timer(t2) |  | timer(t3) |  |  | d |  | \| |
| 3 rule | S0 | V1 |  | V2 | T1 | V2 | T1 |  | T2 |  |  | V1 |  | C1 F1 |
| 3 state | (∅, ∅, ∅) | (a, 1, t1@4) |  | (b, 3, t1@4) | (b, 3, t2@6) | (c, 5, t2@6) | (c, 5, t3@8) |  | (∅, 5, ∅) |  |  | (d, 11, t4@14) |  | (∅, 11, ∅) completed |
| 4 output |  |  |  |  |  |  |  |  | c |  |  |  |  | d \| |

## single-value — `debounceTime(2)`

debounceTime(2) — one value, emitted after two frames of silence

- source: `-a----|`
- expected outer marble: `---x--|` with `{"x":"a"}`
- rules fired: S0 → V1 → T2 → C2 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `(∅, ∅, ∅)` | `none` |
| 1 | 1 | `value(a)` | V1 | `(a, 1, t1@3)` | `none` |
| 2 | 3 | `timer(t1)` | T2 | `(∅, 1, ∅)` | `emit(a)` |
| 3 | 6 | `complete` | C2 | `(∅, 1, ∅) completed` | `complete` |
| 4 | 6 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 |
|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
| 2 input |  | a |  | timer(t1) |  |  | \| |
| 3 rule | S0 | V1 |  | T2 |  |  | C2 F1 |
| 3 state | (∅, ∅, ∅) | (a, 1, t1@3) |  | (∅, 1, ∅) |  |  | (∅, 1, ∅) completed |
| 4 output |  |  |  | a |  |  | \| |

## spaced-values — `debounceTime(2)`

debounceTime(2) — values far enough apart are all emitted, the last one by the completion

- source: `-a---b---c|`
- expected outer marble: `---x---y--(z|)` with `{"x":"a","y":"b","z":"c"}`
- rules fired: S0 → V1 → T2 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `(∅, ∅, ∅)` | `none` |
| 1 | 1 | `value(a)` | V1 | `(a, 1, t1@3)` | `none` |
| 2 | 3 | `timer(t1)` | T2 | `(∅, 1, ∅)` | `emit(a)` |
| 3 | 5 | `value(b)` | V1 | `(b, 5, t2@7)` | `none` |
| 4 | 7 | `timer(t2)` | T2 | `(∅, 5, ∅)` | `emit(b)` |
| 5 | 9 | `value(c)` | V1 | `(c, 9, t3@11)` | `none` |
| 6 | 10 | `complete` | C1 | `(∅, 9, ∅) completed` | `emit(c), complete` |
| 7 | 10 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 | f10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| 2 input |  | a |  | timer(t1) |  | b |  | timer(t2) |  | c | \| |
| 3 rule | S0 | V1 |  | T2 |  | V1 |  | T2 |  | V1 | C1 F1 |
| 3 state | (∅, ∅, ∅) | (a, 1, t1@3) |  | (∅, 1, ∅) |  | (b, 5, t2@7) |  | (∅, 5, ∅) |  | (c, 9, t3@11) | (∅, 9, ∅) completed |
| 4 output |  |  |  | a |  |  |  | b |  |  | c \| |

## same-frame-tie — `debounceTime(2)`

debounceTime(2) — value and timer in the same frame: the value is delivered first, the timer re-schedules

- source: `-a-b---|`
- expected outer marble: `-----x-|` with `{"x":"b"}`
- rules fired: S0 → V1 → V2 → T1 → T2 → C2 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `(∅, ∅, ∅)` | `none` |
| 1 | 1 | `value(a)` | V1 | `(a, 1, t1@3)` | `none` |
| 2 | 3 | `value(b)` | V2 | `(b, 3, t1@3)` | `none` |
| 3 | 3 | `timer(t1)` | T1 | `(b, 3, t2@5)` | `none` |
| 4 | 5 | `timer(t2)` | T2 | `(∅, 3, ∅)` | `emit(b)` |
| 5 | 7 | `complete` | C2 | `(∅, 3, ∅) completed` | `complete` |
| 6 | 7 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 |
|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| 2 input |  | a |  | b timer(t1) |  | timer(t2) |  | \| |
| 3 rule | S0 | V1 |  | V2 T1 |  | T2 |  | C2 F1 |
| 3 state | (∅, ∅, ∅) | (a, 1, t1@3) |  | (b, 3, t2@5) |  | (∅, 3, ∅) |  | (∅, 3, ∅) completed |
| 4 output |  |  |  |  |  | b |  | \| |

## error-drops-pending — `debounceTime(3)`

debounceTime(3) — the source errors while a is pending; a is never emitted

- source: `-a-#`
- expected outer marble: `---#` with `{}`
- rules fired: S0 → V1 → E1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `(∅, ∅, ∅)` | `none` |
| 1 | 1 | `value(a)` | V1 | `(a, 1, t1@4)` | `none` |
| 2 | 3 | `error(#)` | E1 | `(∅, 1, ∅) errored` | `error(#)` |
| 3 | 3 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 |
|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 |
| 2 input |  | a |  | # |
| 3 rule | S0 | V1 |  | E1 F1 |
| 3 state | (∅, ∅, ∅) | (a, 1, t1@4) |  | (∅, 1, ∅) errored |
| 4 output |  |  |  | # |

## empty-source — `debounceTime(3)`

debounceTime(3) — empty source completes without emitting

- source: `-|`
- expected outer marble: `-|` with `{}`
- rules fired: S0 → C2 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `(∅, ∅, ∅)` | `none` |
| 1 | 1 | `complete` | C2 | `(∅, ∅, ∅) completed` | `complete` |
| 2 | 1 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 |
|---|---|---|
| 1 timeline | 0 | 1 |
| 2 input |  | \| |
| 3 rule | S0 | C2 F1 |
| 3 state | (∅, ∅, ∅) | (∅, ∅, ∅) completed |
| 4 output |  | \| |
