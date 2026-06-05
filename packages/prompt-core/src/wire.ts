import type {
  AgentUsage,
  TextStreamEvent,
  ObjectStreamEvent,
} from "./executor";

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

/**
 * Translate an AgentUsage payload into the wire-compat shape the AgentMark
 * cloud + dashboard consumers expect, preserving the deprecated
 * `promptTokens` / `completionTokens` aliases alongside `inputTokens` /
 * `outputTokens`. A total transform — null-handling lives at the call sites
 * (each already knows whether it has usage), so callers need no `!`.
 */
export function usageToWire(u: AgentUsage): WireUsage {
  return {
    ...u,
    promptTokens: u.inputTokens,
    completionTokens: u.outputTokens,
  };
}

/**
 * Map one TEXT-stream AgentEvent to its wire chunk, or `undefined` when the
 * event isn't wired (e.g. `reasoning-delta` — deliberately not on the wire).
 *
 * Parity contract: this mapping has a behavior-identical counterpart in
 * `prompt-core-python`'s `webhook_runner._text_event_to_wire`. Both are
 * exercised against the shared `conformance-vectors/wire-chunks.json`
 * golden cases so the NDJSON the two runners emit cannot drift silently.
 */
export function textEventToWire(ev: TextStreamEvent): WireChunk | undefined {
  switch (ev.type) {
    case "text-delta":
      return { type: "text", result: ev.text };
    case "tool-call":
      return {
        type: "text",
        toolCall: { toolCallId: ev.id, toolName: ev.name, args: ev.args },
      };
    case "tool-result":
      return {
        type: "text",
        toolResult: { toolCallId: ev.id, toolName: ev.name, result: ev.result },
      };
    case "finish":
      // `finish` is the single canonical usage carrier; usage-less finishes
      // (legacy executors) emit the reason alone — JSON.stringify drops the
      // undefined key, matching Python's conditional key insertion.
      return {
        type: "text",
        finishReason: ev.reason,
        usage: ev.usage ? usageToWire(ev.usage) : undefined,
      };
    case "error":
      return { type: "error", error: ev.error };
    default:
      return undefined;
  }
}

/** Non-streaming text response envelope — the wire-truth shape behind the
 * `WebhookPromptResponse` text variant. */
export interface WireTextResponse {
  type: "text";
  result: string;
  usage?: WireUsage;
  finishReason?: string;
  /** Always present — `[]` when the run made no tool calls. */
  toolCalls: unknown[];
  toolResults: unknown[];
  traceId?: string;
}

/** Non-streaming object response envelope. `result` is omitted (never null)
 * when the run produced no resolved value. */
export interface WireObjectResponse {
  type: "object";
  result?: unknown;
  usage?: WireUsage;
  finishReason?: string;
  traceId?: string;
}

/**
 * Build the non-streaming TEXT response envelope.
 *
 * Canonical absence semantics (matching {@link datasetRowToWire}): `usage` /
 * `finishReason` are omitted when unknown — never null — and `traceId` is
 * omitted when empty. `toolCalls`/`toolResults` are always arrays. Takes the
 * canonical {@link AgentUsage} and applies {@link usageToWire}, so the
 * dual-family alias expansion is pinned here too.
 *
 * Parity contract: behavior-identical to Python's
 * `webhook_runner._text_response_to_wire`; both run against the shared
 * `conformance-vectors/response-envelopes.json` golden cases.
 */
export function textResponseToWire(p: {
  result: string;
  usage?: AgentUsage;
  finishReason?: string;
  toolCalls?: unknown[];
  toolResults?: unknown[];
  traceId?: string;
}): WireTextResponse {
  return {
    type: "text",
    result: p.result,
    usage: p.usage ? usageToWire(p.usage) : undefined,
    finishReason: p.finishReason,
    toolCalls: p.toolCalls ?? [],
    toolResults: p.toolResults ?? [],
    ...(p.traceId ? { traceId: p.traceId } : {}),
  };
}

/** Object twin of {@link textResponseToWire} — mirrors Python's
 * `_object_response_to_wire`. */
export function objectResponseToWire(p: {
  result?: unknown;
  usage?: AgentUsage;
  finishReason?: string;
  traceId?: string;
}): WireObjectResponse {
  return {
    type: "object",
    result: p.result,
    usage: p.usage ? usageToWire(p.usage) : undefined,
    finishReason: p.finishReason,
    ...(p.traceId ? { traceId: p.traceId } : {}),
  };
}

/** Inputs for one experiment-row chunk — see {@link datasetRowToWire}. */
export interface DatasetRowParams {
  input: unknown;
  /** Omit (undefined) when the dataset row has no expected output. */
  expectedOutput?: unknown;
  /** Omit (undefined) when the run produced no resolved output. */
  actualOutput?: unknown;
  /** Total tokens for the row; omit when usage is unknown (never 0-fill). */
  tokens?: number;
  /** Eval results — always present on the wire, `[]` when none ran. */
  evals: unknown[];
  /** Omitted from the wire when empty/absent. */
  traceId?: string;
  runId: string;
  runName: string;
}

/**
 * Build the `{type:"dataset"}` experiment-row chunk.
 *
 * Canonical absence semantics (what JSON.stringify's undefined-dropping
 * produced historically, now explicit): `expectedOutput` / `actualOutput` /
 * `tokens` are OMITTED when unknown — never emitted as null — and `traceId`
 * is omitted when empty. Consumers probe by key.
 *
 * Parity contract: behavior-identical to Python's
 * `webhook_runner._dataset_row_to_wire`; both run against the shared
 * `conformance-vectors/dataset-rows.json` golden cases.
 */
export function datasetRowToWire(p: DatasetRowParams): WireChunk {
  return {
    type: "dataset",
    result: {
      input: p.input,
      expectedOutput: p.expectedOutput,
      actualOutput: p.actualOutput,
      tokens: p.tokens,
      evals: p.evals,
    },
    ...(p.traceId ? { traceId: p.traceId } : {}),
    runId: p.runId,
    runName: p.runName,
  };
}

/**
 * Map one OBJECT-stream AgentEvent to its wire chunk, or `undefined` when no
 * chunk is emitted (usage-less `finish` — historical wire emits nothing).
 * Parity contract: mirrors Python's `webhook_runner._object_event_to_wire`;
 * see {@link textEventToWire}.
 */
export function objectEventToWire(ev: ObjectStreamEvent): WireChunk | undefined {
  switch (ev.type) {
    case "object-delta":
      return { type: "object", result: ev.partial };
    case "object-final":
      // object-final is the canonical resolved value — emitted as a "result"
      // chunk so non-streaming dashboards that look at the last result chunk
      // see the final object.
      return { type: "object", result: ev.value };
    case "finish":
      return ev.usage
        ? { type: "object", usage: usageToWire(ev.usage) }
        : undefined;
    case "error":
      return { type: "error", error: ev.error };
    default:
      return undefined;
  }
}
