/**
 * The NDJSON wire contract — the line-delimited JSON the WebhookRunner streams
 * to the AgentMark cloud + dashboard.
 *
 * This is the most important EXTERNAL contract in the runner, and it used to be
 * "stringly typed" on both ends: the runner built each line with an inline
 * `JSON.stringify({ ... })` and the dashboard re-parsed with ad-hoc
 * `chunk.type === "..."` checks. A field rename on one side and a missed update
 * on the other would compile fine and break only at runtime.
 *
 * `WireChunk` makes the contract a single shared discriminated union: the
 * producer routes every line through {@link wireJson} (so the runner can't emit
 * an unmodeled chunk), and consumers can import the same type and `switch` on
 * `type` with exhaustiveness. Additive-only, like AgentEvent.
 */

/** Token usage on the wire, with the legacy `promptTokens`/`completionTokens`
 * aliases the existing cloud + dashboard consumers still read. */
export interface WireUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  /** @deprecated legacy alias for `inputTokens`. */
  promptTokens: number;
  /** @deprecated legacy alias for `outputTokens`. */
  completionTokens: number;
}

/** The `result` payload of a `dataset` (experiment row) chunk. */
export interface WireDatasetResult {
  input: unknown;
  expectedOutput: unknown;
  actualOutput: unknown;
  /** Total tokens for the row. Absent for image/speech experiments. */
  tokens?: number;
  /** Eval results for the row (`[]` when none configured). */
  evals: unknown[];
}

/**
 * One line of the runner's NDJSON stream. `text`/`object` are intentionally
 * overloaded across the streaming sub-shapes (delta vs tool vs finish vs usage)
 * — consumers narrow on the present field after switching on `type`.
 */
export type WireChunk =
  // ── streaming text ──
  | { type: "text"; result: string }
  | { type: "text"; toolCall: { toolCallId: string; toolName: string; args: unknown } }
  | { type: "text"; toolResult: { toolCallId: string; toolName: string; result: unknown } }
  | { type: "text"; finishReason: string; usage?: WireUsage }
  // ── streaming object ──
  | { type: "object"; result: unknown }
  | { type: "object"; usage: WireUsage }
  // ── experiment rows ──
  | {
      type: "dataset";
      result: WireDatasetResult;
      traceId?: string;
      runId: string;
      runName: string;
    }
  // ── terminal markers ──
  | { type: "error"; error: string }
  | { type: "done"; traceId?: string };

/** Serialize a wire chunk to one NDJSON line. The single typed chokepoint the
 * runner emits through, so a chunk shape that drifts from {@link WireChunk}
 * fails to compile. */
export function wireJson(chunk: WireChunk): string {
  return JSON.stringify(chunk) + "\n";
}
