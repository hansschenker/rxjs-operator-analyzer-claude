# bufferCount — Execution traces

Every scenario is simulated by the executable Mealy model; each step shows the input, the rule that fired, the state after T and the output word G.

## overlapping-2-1 — `bufferCount(2, 1)`

bufferCount(2, 1) — sliding pairs (the worked example from docs/)

- source: `-a-b-c-d-|`
- expected outer marble: `---x-y-z-(w|)` with `{"x":["a","b"],"y":["b","c"],"z":["c","d"],"w":["d"]}`
- rules fired: S0 → V1 → V2 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `([], 0)` | `none` |
| 1 | 1 | `value(a)` | V1 | `([[a]], 1)` | `none` |
| 2 | 3 | `value(b)` | V2 | `([[b]], 2)` | `emit([a,b])` |
| 3 | 5 | `value(c)` | V2 | `([[c]], 3)` | `emit([b,c])` |
| 4 | 7 | `value(d)` | V2 | `([[d]], 4)` | `emit([c,d])` |
| 5 | 9 | `complete` | C1 | `(∅, 4) completed` | `emit([d]), complete` |
| 6 | 9 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| 2 input |  | a |  | b |  | c |  | d |  | \| |
| 3 rule | S0 | V1 |  | V2 |  | V2 |  | V2 |  | C1 F1 |
| 3 state | ([], 0) | ([[a]], 1) |  | ([[b]], 2) |  | ([[c]], 3) |  | ([[d]], 4) |  | (∅, 4) completed |
| 4 output |  |  |  | [a,b] |  | [b,c] |  | [c,d] |  | [d] \| |

## non-overlapping-2 — `bufferCount(2)`

bufferCount(2) — back-to-back pairs, trailing partial buffer flushed on complete

- source: `-a-b-c-d-e-|`
- expected outer marble: `---x---y---(z|)` with `{"x":["a","b"],"y":["c","d"],"z":["e"]}`
- rules fired: S0 → V1 → V4 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `([], 0)` | `none` |
| 1 | 1 | `value(a)` | V1 | `([[a]], 1)` | `none` |
| 2 | 3 | `value(b)` | V4 | `([], 2)` | `emit([a,b])` |
| 3 | 5 | `value(c)` | V1 | `([[c]], 3)` | `none` |
| 4 | 7 | `value(d)` | V4 | `([], 4)` | `emit([c,d])` |
| 5 | 9 | `value(e)` | V1 | `([[e]], 5)` | `none` |
| 6 | 11 | `complete` | C1 | `(∅, 5) completed` | `emit([e]), complete` |
| 7 | 11 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 | f10 | f11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
| 2 input |  | a |  | b |  | c |  | d |  | e |  | \| |
| 3 rule | S0 | V1 |  | V4 |  | V1 |  | V4 |  | V1 |  | C1 F1 |
| 3 state | ([], 0) | ([[a]], 1) |  | ([], 2) |  | ([[c]], 3) |  | ([], 4) |  | ([[e]], 5) |  | (∅, 5) completed |
| 4 output |  |  |  | [a,b] |  |  |  | [c,d] |  |  |  | [e] \| |

## skip-less-than-size-3-2 — `bufferCount(3, 2)`

bufferCount(3, 2) — consecutive buffers share one value

- source: `-a-b-c-d-e-|`
- expected outer marble: `-----x---y-(z|)` with `{"x":["a","b","c"],"y":["c","d","e"],"z":["e"]}`
- rules fired: S0 → V1 → V3 → V2 → C1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `([], 0)` | `none` |
| 1 | 1 | `value(a)` | V1 | `([[a]], 1)` | `none` |
| 2 | 3 | `value(b)` | V3 | `([[a,b]], 2)` | `none` |
| 3 | 5 | `value(c)` | V2 | `([[c]], 3)` | `emit([a,b,c])` |
| 4 | 7 | `value(d)` | V3 | `([[c,d]], 4)` | `none` |
| 5 | 9 | `value(e)` | V2 | `([[e]], 5)` | `emit([c,d,e])` |
| 6 | 11 | `complete` | C1 | `(∅, 5) completed` | `emit([e]), complete` |
| 7 | 11 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 | f10 | f11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
| 2 input |  | a |  | b |  | c |  | d |  | e |  | \| |
| 3 rule | S0 | V1 |  | V3 |  | V2 |  | V3 |  | V2 |  | C1 F1 |
| 3 state | ([], 0) | ([[a]], 1) |  | ([[a,b]], 2) |  | ([[c]], 3) |  | ([[c,d]], 4) |  | ([[e]], 5) |  | (∅, 5) completed |
| 4 output |  |  |  |  |  | [a,b,c] |  |  |  | [c,d,e] |  | [e] \| |

## skip-greater-than-size-2-3 — `bufferCount(2, 3)`

bufferCount(2, 3) — gap: every third value is dropped

- source: `-a-b-c-d-e-f-|`
- expected outer marble: `---x-----y---|` with `{"x":["a","b"],"y":["d","e"]}`
- rules fired: S0 → V1 → V4 → V5 → C2 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `([], 0)` | `none` |
| 1 | 1 | `value(a)` | V1 | `([[a]], 1)` | `none` |
| 2 | 3 | `value(b)` | V4 | `([], 2)` | `emit([a,b])` |
| 3 | 5 | `value(c)` | V5 | `([], 3)` | `none` |
| 4 | 7 | `value(d)` | V1 | `([[d]], 4)` | `none` |
| 5 | 9 | `value(e)` | V4 | `([], 5)` | `emit([d,e])` |
| 6 | 11 | `value(f)` | V5 | `([], 6)` | `none` |
| 7 | 13 | `complete` | C2 | `(∅, 6) completed` | `complete` |
| 8 | 13 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 | f8 | f9 | f10 | f11 | f12 | f13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
| 2 input |  | a |  | b |  | c |  | d |  | e |  | f |  | \| |
| 3 rule | S0 | V1 |  | V4 |  | V5 |  | V1 |  | V4 |  | V5 |  | C2 F1 |
| 3 state | ([], 0) | ([[a]], 1) |  | ([], 2) |  | ([], 3) |  | ([[d]], 4) |  | ([], 5) |  | ([], 6) |  | (∅, 6) completed |
| 4 output |  |  |  | [a,b] |  |  |  |  |  | [d,e] |  |  |  | \| |

## size-1 — `bufferCount(1)`

bufferCount(1) — every value is immediately a full buffer

- source: `-a-b-c-|`
- expected outer marble: `-x-y-z-|` with `{"x":["a"],"y":["b"],"z":["c"]}`
- rules fired: S0 → V2 → C2 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `([], 0)` | `none` |
| 1 | 1 | `value(a)` | V2 | `([], 1)` | `emit([a])` |
| 2 | 3 | `value(b)` | V2 | `([], 2)` | `emit([b])` |
| 3 | 5 | `value(c)` | V2 | `([], 3)` | `emit([c])` |
| 4 | 7 | `complete` | C2 | `(∅, 3) completed` | `complete` |
| 5 | 7 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 |
|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| 2 input |  | a |  | b |  | c |  | \| |
| 3 rule | S0 | V2 |  | V2 |  | V2 |  | C2 F1 |
| 3 state | ([], 0) | ([], 1) |  | ([], 2) |  | ([], 3) |  | (∅, 3) completed |
| 4 output |  | [a] |  | [b] |  | [c] |  | \| |

## error-mid-stream — `bufferCount(2)`

bufferCount(2) — source errors; the open buffer [c] is discarded

- source: `-a-b-c-#`
- expected outer marble: `---x---#` with `{"x":["a","b"]}`
- rules fired: S0 → V1 → V4 → E1 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `([], 0)` | `none` |
| 1 | 1 | `value(a)` | V1 | `([[a]], 1)` | `none` |
| 2 | 3 | `value(b)` | V4 | `([], 2)` | `emit([a,b])` |
| 3 | 5 | `value(c)` | V1 | `([[c]], 3)` | `none` |
| 4 | 7 | `error(#)` | E1 | `(∅, 3) errored` | `error(#)` |
| 5 | 7 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 | f2 | f3 | f4 | f5 | f6 | f7 |
|---|---|---|---|---|---|---|---|---|
| 1 timeline | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| 2 input |  | a |  | b |  | c |  | # |
| 3 rule | S0 | V1 |  | V4 |  | V1 |  | E1 F1 |
| 3 state | ([], 0) | ([[a]], 1) |  | ([], 2) |  | ([[c]], 3) |  | (∅, 3) errored |
| 4 output |  |  |  | [a,b] |  |  |  | # |

## empty-source — `bufferCount(2)`

bufferCount(2) — empty source completes without emitting

- source: `-|`
- expected outer marble: `-|` with `{}`
- rules fired: S0 → C2 → F1

### Steps

| # | Frame | Input z | Rule | State after T(s, z) | Outputs G(s, z) |
|---|---|---|---|---|---|
| 0 | 0 | `subscribe` | S0 | `([], 0)` | `none` |
| 1 | 1 | `complete` | C2 | `(∅, 0) completed` | `complete` |
| 2 | 1 | `finalize` | F1 | `⊥ finalized` | `none` |

### Lanes

| lane | f0 | f1 |
|---|---|---|
| 1 timeline | 0 | 1 |
| 2 input |  | \| |
| 3 rule | S0 | C2 F1 |
| 3 state | ([], 0) | (∅, 0) completed |
| 4 output |  | \| |
