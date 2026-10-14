import { z } from 'zod';
import type { Diagnostic, OperatorSpec } from './types';

const outputKind = z.enum([
  'emit',
  'complete',
  'error',
  'windowOpen',
  'windowNext',
  'windowComplete',
  'windowError',
]);

const inputKind = z.enum(['subscribe', 'value', 'complete', 'error', 'finalize', 'timer']);

const traceOutput = z.object({
  kind: outputKind,
  label: z.string().optional(),
  window: z.string().optional(),
});

const traceStep = z.object({
  frame: z.number().int().nonnegative(),
  kind: inputKind,
  input: z.string(),
  rule: z.string(),
  state: z.string(),
  data: z.unknown().optional(),
  outputs: z.array(traceOutput).default([]),
});

const scenario = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
  source: z.string().min(1),
  values: z.record(z.string(), z.unknown()).optional(),
  expected: z.string().optional(),
  expectedValues: z.record(z.string(), z.unknown()).optional(),
  trace: z.array(traceStep).optional(),
});

const parameter = z.object({
  name: z.string().min(1),
  type: z.string(),
  default: z.string().optional(),
  normalized: z.string().optional(),
  description: z.string().optional(),
});

const alphabetSymbol = z.object({
  symbol: z.string().min(1),
  description: z.string().optional(),
});

const stateComponent = z.object({
  name: z.string().min(1),
  type: z.string(),
  description: z.string().optional(),
});

const rule = z.object({
  id: z.string().min(1),
  input: z.string().min(1),
  state: z.string(),
  guard: z.string(),
  next: z.string(),
  outputs: z.array(z.string()).default([]),
  evidence: z.string().optional(),
  note: z.string().optional(),
  reachable: z.boolean().optional(),
});

const mealy = z.object({
  stateSpace: z.object({
    notation: z.string(),
    description: z.string().optional(),
    components: z.array(stateComponent).default([]),
    invariants: z.array(z.string()).default([]),
  }),
  initialState: z.object({
    notation: z.string(),
    description: z.string().optional(),
  }),
  inputAlphabet: z.array(alphabetSymbol).min(1),
  outputAlphabet: z.array(alphabetSymbol).min(1),
  transitions: z.array(rule).min(1),
});

export const operatorSpecSchema = z.object({
  operator: z.string().min(1),
  category: z.string().min(1),
  signature: z.string(),
  description: z.string().optional(),
  source: z
    .object({
      package: z.string(),
      version: z.string(),
      path: z.string(),
    })
    .optional(),
  parameters: z.array(parameter).default([]),
  mealy,
  scenarios: z.array(scenario).default([]),
});

export type OperatorSpecInput = z.input<typeof operatorSpecSchema>;

/** Parse a YAML/JSON document into an OperatorSpec, throwing on structural errors. */
export function parseOperatorSpec(data: unknown): OperatorSpec {
  return operatorSpecSchema.parse(data) as OperatorSpec;
}

export type SafeParseResult =
  | { readonly ok: true; readonly spec: OperatorSpec }
  | { readonly ok: false; readonly issues: readonly Diagnostic[] };

export function safeParseOperatorSpec(data: unknown): SafeParseResult {
  const result = operatorSpecSchema.safeParse(data);
  if (result.success) return { ok: true, spec: result.data as OperatorSpec };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      severity: 'error',
      code: 'schema',
      message: issue.message,
      path: issue.path.map(String).join('.'),
    })),
  };
}
