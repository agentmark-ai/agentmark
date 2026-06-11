/**
 * Generic Executor builder — the low-friction path for "bring your own SDK".
 *
 * Implementing the `Executor` contract by hand means writing async generators
 * that satisfy several non-obvious invariants the conformance suite enforces:
 *   - emit usage EXACTLY once (inline on `finish`),
 *   - an `error` event must be the TERMINAL event (never throw mid-iteration),
 *   - tool-results must follow their tool-call, object streams end with a
 *     final value, etc.
 *
 * Getting those wrong is the main bootstrapping cost (~150-180 LOC + a
 * conformance debugging loop per SDK). `createExecutor` collapses that to a
 * pair of one-shot handlers — "call my SDK, return the text/object + usage" —
 * and guarantees the wire protocol BY CONSTRUCTION. The unfamiliar SDK author
 * never touches the AgentEvent stream.
 *
 * The builder is SDK-shape agnostic — a raw AWS Bedrock `ConverseCommand`,
 * an OpenAI call, a bespoke HTTP client all fit the same handler signature.
 */

import type {
  ExecCtx,
  Executor,
  ExecutorCapabilities,
  ObjectStreamEvent,
  TextStreamEvent,
} from "./executor";
// (streaming handlers yield TextStreamEvent / ObjectStreamEvent directly —
// there is no separate "lite part" type anymore.)
import type { TextConfig, ObjectConfig } from "./types";
import type { WebhookImageResponse, WebhookSpeechResponse } from "./runner";
import {
  finalizeUsage,
  normalizeError,
  type CanonicalUsage,
} from "./executor-helpers";

/** What a one-shot text handler returns. Only `text` (or `toolCalls`) is required. */
export interface ExecutorTextResult {
  /** The model's text output. */
  text?: string;
  /** Tool calls the model requested, in order. */
  toolCalls?: Array<{ id: string; name: string; args?: unknown }>;
  /** Results for tool calls (each `id` must match a prior `toolCalls` entry). */
  toolResults?: Array<{
    id: string;
    name: string;
    result: unknown;
    isError?: boolean;
  }>;
  /** Token usage. Defaults to zeros if omitted so the wire stays protocol-valid. */
  usage?: CanonicalUsage;
  /** Provider finish reason; defaults to `"stop"`. */
  finishReason?: string;
}

/** What a one-shot object handler returns. */
export interface ExecutorObjectResult {
  /** The structured output (already parsed into a JS value). */
  object: unknown;
  usage?: CanonicalUsage;
  finishReason?: string;
}

/**
 * Streaming handlers yield the SAME {@link TextStreamEvent} /
 * {@link ObjectStreamEvent} values the rest of the protocol uses — there is one
 * event vocabulary, not a separate "lite part" shape (and it matches the Python
 * builder, which also yields the event dataclasses). Yield content events as
 * the SDK streams them; report usage and the provider finish reason on a
 * `finish` event you yield (`{ type: "finish", reason, usage }`). The builder
 * intercepts your `finish` (capturing usage + reason), suppresses it, and emits
 * exactly ONE terminal `finish` — so you never have to get the single-usage /
 * terminal-event invariants right yourself. A yielded `error` (or a thrown
 * exception) is turned into the terminal `error` event.
 */
/**
 * Declarative Executor definition. Provide the modalities your SDK supports;
 * `capabilities()` is derived from which handlers you pass (override via
 * `capabilities`). Handlers may be sync or async and should just call your SDK
 * and return the result — throwing is fine, it's converted to a terminal
 * `error` event for you.
 *
 * For each modality you may supply a one-shot handler (`text`/`object` — the
 * SDK call resolves to a final value) and/or a streaming handler
 * (`streamText`/`streamObject` — yields stream events as the SDK streams). When
 * both are present the runner picks based on `ctx.shouldStream`.
 */
/**
 * @typeParam TText - the shape your paired Adapter's `adaptText` produces (what
 *   your text handler receives as `formatted`). Defaults to {@link TextConfig},
 *   the `DefaultAdapter` output used by the BYO `createWebhookRunner` path — so
 *   handlers get `formatted.text_config.model_name` typed with no cast. Override
 *   only when pairing with a custom adapter that reshapes the config.
 * @typeParam TObject - same, for `adaptObject` / object handlers. Defaults to
 *   {@link ObjectConfig}.
 */
export interface ExecutorDefinition<
  TText = TextConfig,
  TObject = ObjectConfig
> {
  name: string;
  capabilities?: Partial<ExecutorCapabilities>;
  text?: (
    formatted: TText,
    ctx: ExecCtx
  ) => ExecutorTextResult | Promise<ExecutorTextResult>;
  object?: (
    formatted: TObject,
    ctx: ExecCtx
  ) => ExecutorObjectResult | Promise<ExecutorObjectResult>;
  /**
   * Streaming text — yield `TextStreamEvent`s (`text-delta`, `tool-call`,
   * `tool-result`, …) as they arrive; put usage + finish reason on a `finish`
   * event you yield. The builder owns the single terminal `finish`.
   */
  streamText?: (formatted: TText, ctx: ExecCtx) => AsyncIterable<TextStreamEvent>;
  /**
   * Streaming object — yield `ObjectStreamEvent`s (`object-delta`, optionally a
   * final `object-final`); put usage on a `finish` event you yield. If you only
   * yield deltas, the builder uses the last delta as the resolved value.
   */
  streamObject?: (
    formatted: TObject,
    ctx: ExecCtx
  ) => AsyncIterable<ObjectStreamEvent>;
  /**
   * One-shot image generation. `traceId` is optional — the builder fills it in
   * (the runner overwrites it with the real span trace id), so a BYO author
   * just returns the generated images + usage.
   */
  image?: (
    formatted: unknown,
    ctx: ExecCtx
  ) => Promise<ImageResult> | ImageResult;
  /** One-shot speech generation. `traceId` is optional (see `image`). */
  speech?: (
    formatted: unknown,
    ctx: ExecCtx
  ) => Promise<SpeechResult> | SpeechResult;
}

/** Image handler return — `traceId` optional; the builder defaults it to "". */
export type ImageResult = Omit<WebhookImageResponse, "traceId"> & {
  traceId?: string;
};
/** Speech handler return — `traceId` optional; the builder defaults it to "". */
export type SpeechResult = Omit<WebhookSpeechResponse, "traceId"> & {
  traceId?: string;
};

// Usage must be emitted exactly once; default to zeros when the SDK doesn't
// report it so the stream is still protocol-valid (the conformance suite
// requires exactly one usage emission).
const usageOrZero = (u: CanonicalUsage | undefined) =>
  finalizeUsage(u ?? { inputTokens: 0, outputTokens: 0 });

// `ExecCtx.shouldStream` is a tri-state: omitted (undefined) means "stream"
// (the default), `false` means one-shot. Centralized here so the default isn't
// re-encoded as a bare `!== false` at every call site.
const wantsStream = (ctx: ExecCtx) => ctx.shouldStream !== false;

/**
 * Build a protocol-correct {@link Executor} from one-shot handlers. The
 * returned executor satisfies `executor-conformance.ts` by construction:
 * single terminal `finish` carrying usage, terminal `error` on any throw, and
 * correct event ordering. Drop it straight into
 * `new WebhookRunner(client, executor, createAgentmarkSpanHooks())`.
 */
export function createExecutor<TText = TextConfig, TObject = ObjectConfig>(
  def: ExecutorDefinition<TText, TObject>
): Executor {
  const capabilities = (): ExecutorCapabilities => ({
    text: def.capabilities?.text ?? !!(def.text || def.streamText),
    object: def.capabilities?.object ?? !!(def.object || def.streamObject),
    image: def.capabilities?.image ?? !!def.image,
    speech: def.capabilities?.speech ?? !!def.speech,
  });

  async function* executeText(
    formattedRaw: unknown,
    ctx: ExecCtx
  ): AsyncIterable<TextStreamEvent> {
    // The Executor contract receives the adapter output as `unknown`; the
    // definition declared its concrete shape (TText) so handlers stay typed.
    const formatted = formattedRaw as TText;
    // Stream when the runner wants deltas and a streaming handler exists;
    // otherwise fall back to the one-shot handler (and vice-versa) so a
    // definition with only one form still works in either mode.
    const useStream = def.streamText && (wantsStream(ctx) || !def.text);
    if (!def.text && !def.streamText) {
      yield { type: "error", error: `Executor '${def.name}' does not support text prompts.` };
      return;
    }
    try {
      if (useStream) {
        let usage: CanonicalUsage | undefined;
        let finishReason: string | undefined;
        for await (const ev of def.streamText!(formatted, ctx)) {
          if (ev.type === "error") {
            yield ev; // a yielded error is terminal — no trailing finish
            return;
          }
          if (ev.type === "finish") {
            // Capture + suppress: the builder owns the single terminal finish.
            if (ev.usage) usage = ev.usage;
            finishReason = ev.reason;
            continue;
          }
          yield ev; // text-delta / reasoning-delta / tool-call / tool-result
        }
        yield { type: "finish", reason: finishReason ?? "stop", usage: usageOrZero(usage) };
        return;
      }
      const r = await def.text!(formatted, ctx);
      for (const tc of r.toolCalls ?? []) {
        yield { type: "tool-call", id: tc.id, name: tc.name, args: tc.args };
      }
      for (const tr of r.toolResults ?? []) {
        yield {
          type: "tool-result",
          id: tr.id,
          name: tr.name,
          result: tr.result,
          ...(tr.isError ? { isError: true } : {}),
        };
      }
      if (r.text) yield { type: "text-delta", text: r.text };
      yield {
        type: "finish",
        reason: r.finishReason ?? "stop",
        usage: usageOrZero(r.usage),
      };
    } catch (err) {
      yield { type: "error", error: normalizeError(err) };
    }
  }

  async function* executeObject(
    formattedRaw: unknown,
    ctx: ExecCtx
  ): AsyncIterable<ObjectStreamEvent> {
    const formatted = formattedRaw as TObject;
    const useStream = def.streamObject && (wantsStream(ctx) || !def.object);
    if (!def.object && !def.streamObject) {
      yield { type: "error", error: `Executor '${def.name}' does not support object prompts.` };
      return;
    }
    try {
      if (useStream) {
        let usage: CanonicalUsage | undefined;
        let finishReason: string | undefined;
        let sawFinal = false;
        let sawDelta = false;
        let lastDelta: unknown;
        for await (const ev of def.streamObject!(formatted, ctx)) {
          if (ev.type === "error") {
            yield ev; // terminal
            return;
          }
          if (ev.type === "finish") {
            if (ev.usage) usage = ev.usage;
            finishReason = ev.reason;
            continue;
          }
          if (ev.type === "object-final") sawFinal = true;
          else if (ev.type === "object-delta") {
            sawDelta = true;
            lastDelta = ev.partial;
          }
          yield ev;
        }
        // The Executor contract requires every object stream to end with an
        // object-final. If the SDK only streamed deltas, the last cumulative
        // delta IS the resolved value (per the conformance contract); fall back
        // to undefined only when nothing was streamed at all.
        if (!sawFinal)
          yield { type: "object-final", value: sawDelta ? lastDelta : undefined };
        yield { type: "finish", reason: finishReason ?? "stop", usage: usageOrZero(usage) };
        return;
      }
      const r = await def.object!(formatted, ctx);
      yield { type: "object-final", value: r.object };
      yield {
        type: "finish",
        reason: r.finishReason ?? "stop",
        usage: usageOrZero(r.usage),
      };
    } catch (err) {
      yield { type: "error", error: normalizeError(err) };
    }
  }

  const executor: Executor = {
    name: def.name,
    capabilities,
    executeText,
    executeObject,
  };
  // Attach optional one-shot modalities only when provided, so
  // `capabilities()` and the runner's support checks stay honest. Default the
  // optional `traceId` to "" (the runner overwrites it with the real span id).
  if (def.image)
    executor.executeImage = async (f, c) => {
      const r = await def.image!(f, c);
      return { ...r, traceId: r.traceId ?? "" };
    };
  if (def.speech)
    executor.executeSpeech = async (f, c) => {
      const r = await def.speech!(f, c);
      return { ...r, traceId: r.traceId ?? "" };
    };
  return executor;
}
