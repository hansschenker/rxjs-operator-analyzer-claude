# windowTime — Execution traces

Every scenario is simulated by the executable Mealy model; each step shows the input, the rule that fired, the state after T and the output word G.

## span-only-3 — `windowTime(3)`

windowTime(3) — back-to-back 3-frame windows; b arrives in the frame w1 closes and lands in w2

- source: `-a-b-c-d-e-|`
- expected outer marble: `x--y--z--w-|` with `{"x":"w1","y":"w2","z":"w3","w":"w4"}`
- rules fired: I0 → V1 → TC1 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | I0 | `([w1:0@3])` | `open(w1)` |
| 1 | 1 | `value(a)` | V1 | `([w1:1@3])` | `w1.next(a)` |
| 2 | 3 | `timer(c1)` | TC1 | `([w2:0@6])` | `w1.complete, open(w2)` |
| 3 | 3 | `value(b)` | V1 | `([w2:1@6])` | `w2.next(b)` |
| 4 | 5 | `value(c)` | V1 | `([w2:2@6])` | `w2.next(c)` |
| 5 | 6 | `timer(c2)` | TC1 | `([w3:0@9])` | `w2.complete, open(w3)` |
| 6 | 7 | `value(d)` | V1 | `([w3:1@9])` | `w3.next(d)` |
| 7 | 9 | `value(e)` | V1 | `([w3:2@9])` | `w3.next(e)` |
| 8 | 9 | `timer(c3)` | TC1 | `([w4:0@12])` | `w3.complete, open(w4)` |
| 9 | 11 | `complete` | C1 | `(∅) completed` | `w4.complete, complete` |
| 10 | 11 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 | f10 | f11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
| 2 input |  | a |  | timer(c1) b |  | c | timer(c2) | d |  | e timer(c3) |  | \| |
| 3 rule | I0 | V1 |  | TC1 V1 |  | V1 | TC1 | V1 |  | V1 TC1 |  | C1 F1 |
| 3 state | ([w1:0@3]) | ([w1:1@3]) |  | ([w2:1@6]) |  | ([w2:2@6]) | ([w3:0@9]) | ([w3:1@9]) |  | ([w4:0@12]) |  | (∅) completed |
| 4 output | w1 |  |  | w2 |  |  | w3 |  |  | w4 |  | \| |
| 4 w1 |  | a |  | \| |  |  |  |  |  |  |  |  |
| 4 w2 |  |  |  | b |  | c | \| |  |  |  |  |  |
| 4 w3 |  |  |  |  |  |  |  | d |  | e \| |  |  |
| 4 w4 |  |  |  |  |  |  |  |  |  |  |  | \| |

## max-size-2 — `windowTime(5, undefined, 2)`

windowTime(5, undefined, 2) — windows close early after two values and restart at once

- source: `-a-b-c-d-|`
- expected outer marble: `x--y---z-|` with `{"x":"w1","y":"w2","z":"w3"}`
- rules fired: I0 → V1 → V2 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | I0 | `([w1:0@5])` | `open(w1)` |
| 1 | 1 | `value(a)` | V1 | `([w1:1@5])` | `w1.next(a)` |
| 2 | 3 | `value(b)` | V2 | `([w2:0@8])` | `w1.next(b), w1.complete, open(w2)` |
| 3 | 5 | `value(c)` | V1 | `([w2:1@8])` | `w2.next(c)` |
| 4 | 7 | `value(d)` | V2 | `([w3:0@12])` | `w2.next(d), w2.complete, open(w3)` |
| 5 | 9 | `complete` | C1 | `(∅) completed` | `w3.complete, complete` |
| 6 | 9 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| 2 input |  | a |  | b |  | c |  | d |  | \| |
| 3 rule | I0 | V1 |  | V2 |  | V1 |  | V2 |  | C1 F1 |
| 3 state | ([w1:0@5]) | ([w1:1@5]) |  | ([w2:0@8]) |  | ([w2:1@8]) |  | ([w3:0@12]) |  | (∅) completed |
| 4 output | w1 |  |  | w2 |  |  |  | w3 |  | \| |
| 4 w1 |  | a |  | b \| |  |  |  |  |  |  |
| 4 w2 |  |  |  |  |  | c |  | d \| |  |  |
| 4 w3 |  |  |  |  |  |  |  |  |  | \| |

## overlapping-span-3-interval-2 — `windowTime(3, 2)`

windowTime(3, 2) — a new window every 2 frames, each 3 frames long: values land in up to two windows

- source: `-a-b-c-d-|`
- expected outer marble: `x-y-z-w-v|` with `{"x":"w1","y":"w2","z":"w3","w":"w4","v":"w5"}`
- rules fired: I0 → V1 → TI1 → TC2 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | I0 | `([w1:0@3], tick@2)` | `open(w1)` |
| 1 | 1 | `value(a)` | V1 | `([w1:1@3], tick@2)` | `w1.next(a)` |
| 2 | 2 | `timer(i1)` | TI1 | `([w1:1@3, w2:0@5], tick@4)` | `open(w2)` |
| 3 | 3 | `timer(c1)` | TC2 | `([w2:0@5], tick@4)` | `w1.complete` |
| 4 | 3 | `value(b)` | V1 | `([w2:1@5], tick@4)` | `w2.next(b)` |
| 5 | 4 | `timer(i2)` | TI1 | `([w2:1@5, w3:0@7], tick@6)` | `open(w3)` |
| 6 | 5 | `value(c)` | V1 | `([w2:2@5, w3:1@7], tick@6)` | `w2.next(c), w3.next(c)` |
| 7 | 5 | `timer(c2)` | TC2 | `([w3:1@7], tick@6)` | `w2.complete` |
| 8 | 6 | `timer(i3)` | TI1 | `([w3:1@7, w4:0@9], tick@8)` | `open(w4)` |
| 9 | 7 | `value(d)` | V1 | `([w3:2@7, w4:1@9], tick@8)` | `w3.next(d), w4.next(d)` |
| 10 | 7 | `timer(c3)` | TC2 | `([w4:1@9], tick@8)` | `w3.complete` |
| 11 | 8 | `timer(i4)` | TI1 | `([w4:1@9, w5:0@11], tick@10)` | `open(w5)` |
| 12 | 9 | `complete` | C1 | `(∅) completed` | `w4.complete, w5.complete, complete` |
| 13 | 9 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| 2 input |  | a | timer(i1) | timer(c1) b | timer(i2) | c timer(c2) | timer(i3) | d timer(c3) | timer(i4) | \| |
| 3 rule | I0 | V1 | TI1 | TC2 V1 | TI1 | V1 TC2 | TI1 | V1 TC2 | TI1 | C1 F1 |
| 3 state | ([w1:0@3], tick@2) | ([w1:1@3], tick@2) | ([w1:1@3, w2:0@5], tick@4) | ([w2:1@5], tick@4) | ([w2:1@5, w3:0@7], tick@6) | ([w3:1@7], tick@6) | ([w3:1@7, w4:0@9], tick@8) | ([w4:1@9], tick@8) | ([w4:1@9, w5:0@11], tick@10) | (∅) completed |
| 4 output | w1 |  | w2 |  | w3 |  | w4 |  | w5 | \| |
| 4 w1 |  | a |  | \| |  |  |  |  |  |  |
| 4 w2 |  |  |  | b |  | c \| |  |  |  |  |
| 4 w3 |  |  |  |  |  | c |  | d \| |  |  |
| 4 w4 |  |  |  |  |  |  |  | d |  | \| |
| 4 w5 |  |  |  |  |  |  |  |  |  | \| |

## gap-span-2-interval-4 — `windowTime(2, 4)`

windowTime(2, 4) — gaps: b and d arrive while no window is open and are dropped

- source: `-a-b-c-d-e-|`
- expected outer marble: `x---y---z--|` with `{"x":"w1","y":"w2","z":"w3"}`
- rules fired: I0 → V1 → TC2 → V3 → TI1 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | I0 | `([w1:0@2], tick@4)` | `open(w1)` |
| 1 | 1 | `value(a)` | V1 | `([w1:1@2], tick@4)` | `w1.next(a)` |
| 2 | 2 | `timer(c1)` | TC2 | `([], tick@4)` | `w1.complete` |
| 3 | 3 | `value(b)` | V3 | `([], tick@4)` | `none` |
| 4 | 4 | `timer(i1)` | TI1 | `([w2:0@6], tick@8)` | `open(w2)` |
| 5 | 5 | `value(c)` | V1 | `([w2:1@6], tick@8)` | `w2.next(c)` |
| 6 | 6 | `timer(c2)` | TC2 | `([], tick@8)` | `w2.complete` |
| 7 | 7 | `value(d)` | V3 | `([], tick@8)` | `none` |
| 8 | 8 | `timer(i2)` | TI1 | `([w3:0@10], tick@12)` | `open(w3)` |
| 9 | 9 | `value(e)` | V1 | `([w3:1@10], tick@12)` | `w3.next(e)` |
| 10 | 10 | `timer(c3)` | TC2 | `([], tick@12)` | `w3.complete` |
| 11 | 11 | `complete` | C1 | `(∅) completed` | `complete` |
| 12 | 11 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 | f10 | f11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
| 2 input |  | a | timer(c1) | b | timer(i1) | c | timer(c2) | d | timer(i2) | e | timer(c3) | \| |
| 3 rule | I0 | V1 | TC2 | V3 | TI1 | V1 | TC2 | V3 | TI1 | V1 | TC2 | C1 F1 |
| 3 state | ([w1:0@2], tick@4) | ([w1:1@2], tick@4) | ([], tick@4) | ([], tick@4) | ([w2:0@6], tick@8) | ([w2:1@6], tick@8) | ([], tick@8) | ([], tick@8) | ([w3:0@10], tick@12) | ([w3:1@10], tick@12) | ([], tick@12) | (∅) completed |
| 4 output | w1 |  |  |  | w2 |  |  |  | w3 |  |  | \| |
| 4 w1 |  | a | \| |  |  |  |  |  |  |  |  |  |
| 4 w2 |  |  |  |  |  | c | \| |  |  |  |  |  |
| 4 w3 |  |  |  |  |  |  |  |  |  | e | \| |  |

## error-mid-stream — `windowTime(3)`

windowTime(3) — the source errors; the open window receives the error first

- source: `-a-#`
- expected outer marble: `x--(y#)` with `{"x":"w1","y":"w2"}`
- rules fired: I0 → V1 → TC1 → E1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | I0 | `([w1:0@3])` | `open(w1)` |
| 1 | 1 | `value(a)` | V1 | `([w1:1@3])` | `w1.next(a)` |
| 2 | 3 | `timer(c1)` | TC1 | `([w2:0@6])` | `w1.complete, open(w2)` |
| 3 | 3 | `error(#)` | E1 | `(∅) errored` | `w2.error(#), error(#)` |
| 4 | 3 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 |
|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 |
| 2 input |  | a |  | timer(c1) # |
| 3 rule | I0 | V1 |  | TC1 E1 F1 |
| 3 state | ([w1:0@3]) | ([w1:1@3]) |  | (∅) errored |
| 4 output | w1 |  |  | w2 # |
| 4 w1 |  | a |  | \| |
| 4 w2 |  |  |  | # |

## empty-source — `windowTime(3)`

windowTime(3) — empty source: w1 completes empty, then the outer stream completes

- source: `-|`
- expected outer marble: `x|` with `{"x":"w1"}`
- rules fired: I0 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | I0 | `([w1:0@3])` | `open(w1)` |
| 1 | 1 | `complete` | C1 | `(∅) completed` | `w1.complete, complete` |
| 2 | 1 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 |
|---|---|---|
| 1 timeline | 0 | 1 |
| 2 input |  | \| |
| 3 rule | I0 | C1 F1 |
| 3 state | ([w1:0@3]) | (∅) completed |
| 4 output | w1 | \| |
| 4 w1 |  | \| |
