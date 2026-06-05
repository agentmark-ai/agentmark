/**
 * AgentMarkObservation — post-hoc, OTel-GenAI-aligned summary of one
 * Executor invocation.
 *
 * Complement to the live `AgentEvent` stream (chunk vocabulary): where
 * `AgentEvent` is the live wire protocol (dashboard preview, NDJSON),
 * `Observation` is the settled trace shape. Attribute names track the
 * OpenTelemetry GenAI semantic conventions
 * (https://opentelemetry.io/docs/specs/semconv/gen-ai/) so AgentMark
 * observations compose with Langfuse / Phoenix / Braintrust exports
 * without per-backend translation.
 *
 * Scope: MVP. Populated today by synthesis from the AgentEvent stream
 * inside `WebhookRunner`. Future adapters may emit it directly when
 * richer attributes (thinking tokens, reasoning content, server tools)
 * can't be recovered from events.
 */

export interface AgentMarkToolInvocation {
  id: string;
  name: string;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export interface AgentMarkUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AgentMarkObservation {
  /** Adapter `name` (e.g. "vercel-ai-v5", "mastra-v0"). */
  executorName?: string;
  /** Prompt name from frontmatter, when available. */
  promptName?: string;
  /** Run kind — aligns with the prompt's frontmatter config key. */
  kind: "text" | "object" | "image" | "speech";
  /** Final rendered text (for text kind) or serialized object value (for object kind). */
  output?: string | unknown;
  /** Tool calls + results observed during the run, paired by `id`. */
  toolCalls: AgentMarkToolInvocation[];
  /** Token counts — already `finalizeUsage`-shaped. */
  usage?: AgentMarkUsage;
  /** SDK `finishReason` or `"error"` when the run failed. */
  finishReason?: string;
  /** Canonicalized error message when the run failed. */
  error?: string;
  /** Wall-clock milliseconds for the executor call. */
  durationMs?: number;
  /** Tracing trace id provided by the span hook, when available. */
  traceId?: string;
}

export type ObservationHook = (
  observation: AgentMarkObservation
) => void | Promise<void>;
