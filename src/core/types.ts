/**
 * Core type model for the Mealy 6-tuple operator analysis.
 *
 *   S  state space          -> StateSpaceSpec (documentation) + machine state (executable)
 *   S0 initial state        -> InitialStateSpec + Machine.initial()
 *   Z  input alphabet       -> AlphabetSymbol[] + InputEvent
 *   A  output alphabet      -> AlphabetSymbol[] + OutputEvent
 *   T  transition function  -> RuleSpec.next + Machine.step().state
 *   G  output function      -> RuleSpec.outputs + Machine.step().outputs
 */

export type Frame = number;

/** Kind tags for inputs as they appear in a trace (`subscribe` is the synthetic step 0). */
export type InputKind = 'subscribe' | 'value' | 'complete' | 'error' | 'finalize' | 'timer';

/** An element of the input alphabet Z, instantiated with its payload. */
export type InputEvent =
  | { readonly kind: 'value'; readonly value: unknown; readonly label: string }
  | { readonly kind: 'complete' }
  | { readonly kind: 'error'; readonly error: unknown; readonly label: string }
  | { readonly kind: 'finalize' }
  | { readonly kind: 'timer'; readonly id: string };

export type OutputKind =
  | 'emit'
  | 'complete'
  | 'error'
  | 'windowOpen'
  | 'windowNext'
  | 'windowComplete'
  | 'windowError';

/** An element of the output alphabet A. `windowX` kinds model higher-order operators. */
export type OutputEvent =
  | { readonly kind: 'emit'; readonly value: unknown; readonly label: string }
  | { readonly kind: 'complete' }
  | { readonly kind: 'error'; readonly error: unknown; readonly label: string }
  | { readonly kind: 'windowOpen'; readonly window: string }
  | {
      readonly kind: 'windowNext';
      readonly window: string;
      readonly value: unknown;
      readonly label: string;
    }
  | { readonly kind: 'windowComplete'; readonly window: string }
  | {
      readonly kind: 'windowError';
      readonly window: string;
      readonly error: unknown;
      readonly label: string;
    };

/** A timer the machine asks the simulator to deliver `after` frames later (reserved for time-based operators). */
export interface ScheduledInput {
  readonly id: string;
  readonly after: number;
}

export interface InitialResult<S> {
  readonly ruleId: string;
  readonly state: S;
  readonly outputs: readonly OutputEvent[];
  /** Timers armed during subscribe; they run BEFORE source events of the same frame. */
  readonly schedule?: readonly ScheduledInput[];
}

export interface StepResult<S> {
  readonly ruleId: string;
  readonly state: S;
  readonly outputs: readonly OutputEvent[];
  readonly schedule?: readonly ScheduledInput[];
  readonly cancel?: readonly string[];
}

/** Virtual-time context of a step: `now` is the frame the input is delivered in (what `scheduler.now()` returns). */
export interface StepContext {
  readonly now: Frame;
}

/**
 * Executable Mealy machine for one operator. Pure: `step` must return fresh objects and never mutate `state`.
 * Every rule id returned here must exist in the operator's YAML transition table.
 */
export interface Machine<S, P> {
  readonly operator: string;
  normalizeParams(raw: Readonly<Record<string, unknown>>): P;
  describeParams(params: P): string;
  initial(params: P): InitialResult<S>;
  step(state: S, input: InputEvent, params: P, context: StepContext): StepResult<S>;
  formatState(state: S, params: P): string;
  snapshot(state: S): unknown;
  isTerminal(state: S): boolean;
}

/* ----------------------------------------------------------------------------
 * YAML document model (the saved analysis)
 * ------------------------------------------------------------------------- */

export interface ParameterSpec {
  readonly name: string;
  readonly type: string;
  readonly default?: string;
  readonly normalized?: string;
  readonly description?: string;
}

export interface AlphabetSymbol {
  readonly symbol: string;
  readonly description?: string;
}

export interface StateComponent {
  readonly name: string;
  readonly type: string;
  readonly description?: string;
}

export interface StateSpaceSpec {
  readonly notation: string;
  readonly description?: string;
  readonly components: readonly StateComponent[];
  readonly invariants: readonly string[];
}

export interface InitialStateSpec {
  readonly notation: string;
  readonly description?: string;
}

/** One row of the State Transition Table: T(s,z) and G(s,z) for a guarded (state, input) pair. */
export interface RuleSpec {
  readonly id: string;
  readonly input: string;
  readonly state: string;
  readonly guard: string;
  readonly next: string;
  readonly outputs: readonly string[];
  readonly evidence?: string;
  readonly note?: string;
  /** false = listed for totality but not reachable through the simulator's input protocol. */
  readonly reachable?: boolean;
}

export interface MealySpec {
  readonly stateSpace: StateSpaceSpec;
  readonly initialState: InitialStateSpec;
  readonly inputAlphabet: readonly AlphabetSymbol[];
  readonly outputAlphabet: readonly AlphabetSymbol[];
  readonly transitions: readonly RuleSpec[];
}

export interface TraceOutput {
  readonly kind: OutputKind;
  readonly label?: string;
  readonly window?: string;
}

export interface TraceStep {
  readonly frame: Frame;
  readonly kind: InputKind;
  readonly input: string;
  readonly rule: string;
  readonly state: string;
  readonly data?: unknown;
  readonly outputs: readonly TraceOutput[];
}

export interface ScenarioSpec {
  readonly name: string;
  readonly title?: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly source: string;
  readonly values?: Readonly<Record<string, unknown>>;
  /* generated by `analyze` */
  readonly expected?: string;
  readonly expectedValues?: Readonly<Record<string, unknown>>;
  readonly trace?: readonly TraceStep[];
}

export interface SourceRef {
  readonly package: string;
  readonly version: string;
  readonly path: string;
}

export interface OperatorSpec {
  readonly operator: string;
  readonly category: string;
  readonly signature: string;
  readonly description?: string;
  readonly source?: SourceRef;
  readonly parameters: readonly ParameterSpec[];
  readonly mealy: MealySpec;
  readonly scenarios: readonly ScenarioSpec[];
}

/* ----------------------------------------------------------------------------
 * Simulation results
 * ------------------------------------------------------------------------- */

export interface DownstreamEvent {
  readonly frame: Frame;
  readonly event: OutputEvent;
}

export interface SimulationResult {
  readonly scenario: string;
  readonly params: string;
  readonly steps: readonly TraceStep[];
  readonly downstream: readonly DownstreamEvent[];
  readonly expected: string;
  readonly expectedExact: boolean;
  readonly expectedValues: Readonly<Record<string, unknown>>;
}

export interface Diagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}
