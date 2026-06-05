export interface VectorFile<TCase = unknown> {
  description: string;
  cases: TCase[];
}

export interface DatasetItemNameCase {
  name: string;
  input: unknown;
  index: number;
  expected: string;
}

export interface FinalizeUsageCase {
  name: string;
  input: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  expected: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
}

export interface NormalizeErrorCase {
  name: string;
  input: unknown;
  expected: string;
}

export interface WireChunkCase {
  name: string;
  /** Which stream kind's mapper to run the event through. */
  kind: "text" | "object";
  /** AgentEvent in TS field names (Python suite maps to its dataclasses). */
  event: Record<string, unknown>;
  /** Expected wire chunk as parsed JSON, or null when no chunk is emitted. */
  expected: Record<string, unknown> | null;
}

export interface DatasetRowCase {
  name: string;
  /** Row-builder args in TS field names; ABSENT key = unknown/omitted.
   * Python maps to its snake_case kwargs (`input` → `input_data`, …). */
  args: {
    input: unknown;
    expectedOutput?: unknown;
    actualOutput?: unknown;
    tokens?: number;
    evals: unknown[];
    traceId?: string;
    runId: string;
    runName: string;
  };
  /** Expected {type:"dataset"} chunk as parsed JSON. */
  expected: Record<string, unknown>;
}

export interface ResponseEnvelopeCase {
  name: string;
  /** Which envelope builder to run. */
  kind: "text" | "object";
  /** Builder args in TS field names; usage in canonical AgentUsage form;
   * ABSENT key = unknown/omitted. Python maps to its snake_case kwargs. */
  args: Record<string, unknown>;
  /** Expected envelope as parsed JSON. */
  expected: Record<string, unknown>;
}

export type KnownVectorName =
  | "dataset-item-name"
  | "finalize-usage"
  | "normalize-error"
  | "wire-chunks"
  | "dataset-rows"
  | "response-envelopes"
  | "protocol-catalog";

export function loadVector<TCase = unknown>(name: KnownVectorName): VectorFile<TCase>;
export function loadVector<TCase = unknown>(name: string): VectorFile<TCase>;

export const vectorsDir: string;
