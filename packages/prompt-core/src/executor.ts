import type { AdaptOptions } from "./types";
import type { WebhookImageResponse, WebhookSpeechResponse } from "./runner";
import type { SpanLike } from "./span-hook";

/** Token usage shape carried on the terminal `finish` event. */
export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
}

/**
 * Terminal "stream complete" event — the SINGLE canonical carrier of usage.
 *
 * Every executor stream ends with exactly one `finish` (or a terminal `error`).
 * Usage rides on `finish.usage`: SDKs that bundle usage into their native finish
 * chunk (AI SDK v5 `fullStream`) and SDKs that deliver it on a side channel (AI
 * SDK `streamObject.usage` promise) both funnel into this one event, so there is
 * exactly one place to read usage and the runner emits one consistent wire
 * chunk regardless of SDK. `usage` is optional only because some non-streaming
 * SDK responses omit it; the builder defaults it to zeros.
 */
export interface FinishEvent {
  type: "finish";
  reason: string;
  usage?: AgentUsage;
}

/** Terminal failure — MUST be the last event in a stream (never thrown). */
export interface ErrorEvent {
  type: "error";
  error: string;
}

/** Events common to every stream kind: the two terminal events. */
export type CommonStreamEvent = FinishEvent | ErrorEvent;

/**
 * Events a TEXT-kind stream may emit. `executeText` returns exactly this — the
 * compiler now rejects an object-kind event in a text stream (previously a
 * runtime-only conformance rule).
 */
export type TextStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call"; id: string; name: string; args: unknown }
  | {
      type: "tool-result";
      id: string;
      name: string;
      result: unknown;
      isError?: boolean;
    }
  | CommonStreamEvent;

/**
 * Events an OBJECT-kind stream may emit. `executeObject` returns exactly this.
 * Every object stream ends with one `object-final` carrying the resolved value.
 */
export type ObjectStreamEvent =
  | { type: "object-delta"; partial: unknown }
  | { type: "object-final"; value: unknown }
  | CommonStreamEvent;

/**
 * Canonical event stream emitted by every Executor.
 *
 * Each SDK translates its native event type (Vercel AI SDK `fullStream` chunks,
 * Claude Agent SDK `query()` messages, Mastra stream events, etc.) into this
 * shape once, so the shared WebhookRunner can produce a byte-stable NDJSON
 * envelope for the AgentMark cloud contract regardless of the underlying SDK.
 *
 * Split by kind so executor method signatures (`executeText` /`executeObject`)
 * carry compile-time kind-correctness; use {@link TextStreamEvent} /
 * {@link ObjectStreamEvent} directly when you know the kind.
 *
 * Public stability: additive only. New variants may appear; existing ones
 * MUST NOT change their field names or semantics.
 */
export type AgentEvent = TextStreamEvent | ObjectStreamEvent;

/**
 * Context handed to every Executor call. Carries telemetry + cancellation
 * signal. The `span` field is the parent span opened by the runner's
 * PromptSpanHook / ExperimentItemSpanHook; executors wrap native calls in
 * child spans via whatever OTEL library their adapter brought — the shared
 * runner stays SDK-agnostic.
 */
export interface ExecCtx {
  traceId?: string;
  telemetry?: AdaptOptions["telemetry"];
  signal?: AbortSignal;
  span?: SpanLike;
  /** Prompt name for traceName fallback. */
  promptName?: string;
  /**
   * Hint to the executor: `true` means the runner wants per-token deltas
   * (use `streamText`/`streamObject`-style APIs); `false` means the runner
   * only needs the final value (use `generateText`/`generateObject`-style
   * APIs). Executors may ignore this and always stream, but SDKs that
   * attach metadata only to the non-streaming response (e.g. `finishReason`
   * on `generateObject`) should branch to preserve that signal.
   *
   * Default when omitted: **stream**. Test the default with the
   * `shouldStream !== false` idiom (omitted and `true` both stream); the
   * builder centralizes this as `wantsStream(ctx)`. Mirrors Python's
   * `ExecCtx.should_stream`, which defaults to `True`.
   */
  shouldStream?: boolean;
}

/**
 * Capabilities declared by an Executor. Cloud + dashboard surfaces use this
 * to gate UI affordances (e.g. hide "Run image prompt" when the selected
 * executor declares `image: false`). The shared WebhookRunner uses it to
 * emit a canonical error when the user invokes an unsupported path.
 *
 * Invariant: `image`/`speech` MUST agree with the presence of `executeImage`/
 * `executeSpeech` — don't declare `image: true` without implementing the
 * method. `createExecutor` derives capabilities from the handlers you pass, so
 * the two can't drift; hand-rolled executors are responsible for keeping them
 * in sync.
 */
export interface ExecutorCapabilities {
  text: boolean;
  object: boolean;
  image: boolean;
  speech: boolean;
}

/**
 * The low-level, stable contract every SDK integration implements.
 *
 * Most integrations should NOT implement this by hand — reach for
 * `createExecutor` ({@link ./executor-builder}), which turns a pair of
 * "call my SDK, return {text|object, usage}" handlers into a protocol-correct
 * Executor by construction. Implement `Executor` directly only for an SDK whose
 * streaming shape `createExecutor` can't model. Either way the WebhookRunner
 * handles NDJSON encoding, span wrapping, abort propagation, and the cloud
 * contract on top; verify against `executor-conformance.ts`.
 */
export interface Executor {
  /** Stable, human-readable executor name. Surfaced in traces. */
  readonly name: string;

  capabilities(): ExecutorCapabilities;

  /**
   * Stream events for a text-kind prompt. The `formatted` payload is whatever
   * the paired Adapter produced from `adaptText`; the executor is free to
   * treat it as the SDK-native param type it declared. Returns only
   * {@link TextStreamEvent}s — the kind is enforced at compile time.
   */
  executeText(
    formatted: unknown,
    ctx: ExecCtx
  ): AsyncIterable<TextStreamEvent>;

  /**
   * Stream events for an object-kind prompt. Executors that support streaming
   * partial objects should emit `object-delta` events as they arrive; every
   * stream must end with exactly one `object-final` carrying the resolved value.
   * Returns only {@link ObjectStreamEvent}s.
   */
  executeObject(
    formatted: unknown,
    ctx: ExecCtx
  ): AsyncIterable<ObjectStreamEvent>;

  /** One-shot image generation. Optional; gated by `capabilities().image`. */
  executeImage?(
    formatted: unknown,
    ctx: ExecCtx
  ): Promise<WebhookImageResponse>;

  /** One-shot speech generation. Optional; gated by `capabilities().speech`. */
  executeSpeech?(
    formatted: unknown,
    ctx: ExecCtx
  ): Promise<WebhookSpeechResponse>;
}
