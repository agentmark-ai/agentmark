import type {
  ExecCtx,
  Executor,
  ExecutorCapabilities,
  ObjectStreamEvent,
  TextStreamEvent,
  WebhookImageResponse,
  WebhookSpeechResponse,
} from "@agentmark-ai/prompt-core";
import { normalizeError } from "@agentmark-ai/prompt-core";
import type { ChunkAdapter } from "./chunk-adapter";

/**
 * Telemetry ownership (Phase 3): the adapter's `adaptText` / `adaptObject`
 * is the *single* author of `experimental_telemetry` on `formatted`. It's
 * already enriched upstream by the runner (which calls `createPromptTelemetry`
 * before invoking `prompt.format()`), so by the time `formatted` arrives
 * here it carries: `{isEnabled, metadata: {prompt_name, props, trace_name,
 * agentmark_meta, ...user_metadata}}`.
 *
 * The executor does NOT merge `ctx.telemetry` on top — that was the
 * redundant write that caused bug_006 (pre-Phase-3, adapter's rich
 * metadata was clobbered by runner's thin {isEnabled} in experiment
 * context). Any future adapter that writes its own telemetry field on
 * formatted is similarly authoritative.
 */

/**
 * TYPED VIEWS of the Vercel AI SDK surface the executor reads.
 *
 * The shared factory still never imports `ai` (that's how we avoid needing
 * both majors' types in one package), but it no longer types that surface
 * as `any`: these structural views catalog exactly which fields the factory
 * consumes, as permissive supersets both v4 and v5 satisfy.
 *
 * What this buys — and honestly does NOT buy:
 *   - BUYS: internal type-safety in the factory (no `(res as any)` blind
 *     spots), a written catalog of the read-surface, and compile errors at
 *     each adapter's binding site if a future `ai` major changes a field's
 *     TYPE incompatibly.
 *   - DOES NOT BUY: rename detection. A superset view reads a renamed
 *     field as "absent" without complaint — by construction. The rename
 *     tripwires live in each adapter's `sdk-contract-assertions.ts`, which
 *     pins the REAL `ai` types (available there) to the field names this
 *     factory reads.
 */

/** Tool-call fields across majors — v4 keys arguments `args`, v5 `input`. */
export interface VercelToolCallLike {
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  input?: unknown;
}

/** Tool-result fields across majors — v4 keys results `result`, v5 `output`. */
export interface VercelToolResultLike {
  toolCallId?: string;
  toolName?: string;
  result?: unknown;
  output?: unknown;
}

/**
 * Field-bag view of one `fullStream` chunk — the superset of every chunk
 * field the executor (and the per-major ChunkAdapters) read. `type` stays
 * `string` because real streams interleave variants we deliberately ignore
 * (step-start/step-finish/reasoning/...).
 */
export interface VercelStreamChunk
  extends VercelToolCallLike,
    VercelToolResultLike {
  type: string;
  /** text-delta payload — v4 `textDelta`, v5 `text`. */
  textDelta?: string;
  text?: string;
  /** streamObject value chunks. */
  object?: unknown;
  /** finish chunk — usage under `usage` (v4) / `totalUsage` (v5). */
  finishReason?: string;
  usage?: unknown;
  totalUsage?: unknown;
  /** error chunk payload. */
  error?: unknown;
}

export interface VercelStepLike {
  toolCalls?: VercelToolCallLike[];
  toolResults?: VercelToolResultLike[];
}

export interface VercelGenerateTextResult {
  text?: string;
  finishReason?: string;
  usage?: unknown;
  steps?: VercelStepLike[];
  /** Output-bearing runs (tools + schema): the resolved structured value. */
  resolvedOutput?: unknown;
  experimental_output?: unknown;
}

export interface VercelStreamTextResult {
  fullStream: AsyncIterable<VercelStreamChunk>;
  /** Output-bearing runs stream structured partials here. */
  experimental_partialOutputStream?: AsyncIterable<unknown>;
  /** Side-channel usage promise — funneled onto the terminal finish. */
  usage?: PromiseLike<unknown>;
}

export interface VercelGenerateObjectResult {
  object?: unknown;
  finishReason?: string;
  usage?: unknown;
}

export interface VercelStreamObjectResult {
  fullStream: AsyncIterable<VercelStreamChunk>;
  usage?: PromiseLike<unknown>;
}

/** Generated media file — v4 exposes `mimeType`, v5 `mediaType`. */
export interface VercelGeneratedFileLike {
  mimeType?: string;
  mediaType?: string;
  base64: string;
}

export interface VercelImageResult {
  images: VercelGeneratedFileLike[];
}

export interface VercelSpeechResult {
  audio: VercelGeneratedFileLike & { format?: string };
}

/**
 * The bound SDK functions each adapter supplies. Params stay loose
 * (`Record<string, unknown>`) on purpose: they flow FROM our adapters, whose
 * param maps own that shape — and parameter positions are contravariant, so
 * tightening them here would reject the adapters' thunks. The RESULT types
 * are where the views do their work.
 */
export interface VercelSDK {
  generateText: (
    params: Record<string, unknown>
  ) => PromiseLike<VercelGenerateTextResult>;
  streamText: (params: Record<string, unknown>) => VercelStreamTextResult;
  generateObject: (
    params: Record<string, unknown>
  ) => PromiseLike<VercelGenerateObjectResult>;
  streamObject: (params: Record<string, unknown>) => VercelStreamObjectResult;
  Output?: { object: (opts: { schema: unknown }) => unknown };
  generateImage: (
    params: Record<string, unknown>
  ) => PromiseLike<VercelImageResult>;
  generateSpeech: (
    params: Record<string, unknown>
  ) => PromiseLike<VercelSpeechResult>;
}

export interface CreateVercelExecutorOptions {
  /** Display name (shows up in traces) — e.g. `"vercel-ai-v5"`. */
  name: string;
  /** Chunk-shape + usage adapter — typically `v4Chunks` or `v5Chunks`. */
  chunks: ChunkAdapter;
  /** The subset of `ai`'s public API the factory calls. Bind these from
   * the consumer's pinned `ai` version. */
  sdk: VercelSDK;
}

class VercelSharedExecutor implements Executor {
  readonly name: string;
  private readonly chunks: ChunkAdapter;
  private readonly sdk: VercelSDK;

  constructor(opts: CreateVercelExecutorOptions) {
    this.name = opts.name;
    this.chunks = opts.chunks;
    this.sdk = opts.sdk;
  }

  capabilities(): ExecutorCapabilities {
    return { text: true, object: true, image: true, speech: true };
  }

  async *executeText(
    formatted: unknown,
    ctx: ExecCtx
  ): AsyncIterable<TextStreamEvent> {
    const input = formatted as Record<string, unknown>;
    // input.experimental_telemetry is already the authoritative value —
    // set by the adapter from (runner-enriched) options.telemetry + prompt
    // metadata. No merging here.
    const params = {
      ...input,
      abortSignal: ctx.signal,
    };

    if (ctx.shouldStream === false) {
      try {
        const res = await this.sdk.generateText(params);
        const steps = res.steps ?? [];
        const toolCalls = steps.flatMap((s) => s.toolCalls ?? []);
        const toolResults = steps.flatMap((s) => s.toolResults ?? []);
        for (const tc of toolCalls) {
          yield {
            type: "tool-call",
            // The view types ids as optional (it's a permissive superset);
            // the SDK's own types guarantee them on real tool parts.
            id: tc.toolCallId as string,
            name: tc.toolName as string,
            args: tc.args ?? tc.input,
          };
        }
        for (const tr of toolResults) {
          yield {
            type: "tool-result",
            id: tr.toolCallId as string,
            name: tr.toolName as string,
            result: tr.result ?? tr.output,
          };
        }
        if (res.text) yield { type: "text-delta", text: res.text };
        yield {
          type: "finish",
          reason: res.finishReason ?? "stop",
          usage: this.chunks.normalizeUsage(res.usage),
        };
      } catch (err) {
        yield { type: "error", error: normalizeError(err) };
      }
      return;
    }

    // Streaming path. The protocol invariants here mirror `createExecutor`'s
    // builder: the SDK call sits INSIDE the try (a synchronous throw from
    // `streamText` must become a terminal `error` event, never an exception
    // out of the AsyncIterable), and native `finish` chunks are captured +
    // suppressed so the stream ends with exactly ONE terminal `finish` even
    // when the SDK emits zero or multiple finish chunks.
    try {
      const streamResult = this.sdk.streamText(params);
      let finishReason: string | undefined;
      let finishUsage: ReturnType<ChunkAdapter["normalizeUsage"]>;
      for await (const c of streamResult.fullStream) {
        if (c.type === "error") {
          yield { type: "error", error: normalizeError(c.error) };
          return;
        }
        if (c.type === "text-delta") {
          const text = this.chunks.readTextChunk(c);
          if (text !== undefined) yield { type: "text-delta", text };
        } else if (c.type === "tool-call") {
          yield {
            type: "tool-call",
            id: c.toolCallId as string,
            name: c.toolName as string,
            args: c.args ?? c.input,
          };
        } else if (c.type === "tool-result") {
          yield {
            type: "tool-result",
            id: c.toolCallId as string,
            name: c.toolName as string,
            result: c.result ?? c.output,
          };
        } else if (c.type === "finish") {
          // Capture + suppress: the single terminal finish is emitted below.
          finishReason = c.finishReason ?? "stop";
          finishUsage = this.chunks.normalizeUsage(
            this.chunks.readFinishUsage(c)
          );
        }
      }
      // Single usage channel: every finish carries usage. Zero-default when
      // the SDK reported none (matches the builder's `usageOrZero` and the
      // object paths below) so the contract holds uniformly.
      yield {
        type: "finish",
        reason: finishReason ?? "stop",
        usage: finishUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    } catch (err) {
      yield { type: "error", error: normalizeError(err) };
    }
  }

  async *executeObject(
    formatted: unknown,
    ctx: ExecCtx
  ): AsyncIterable<ObjectStreamEvent> {
    const input = formatted as Record<string, unknown> & {
      tools?: Record<string, unknown>;
      schema?: unknown;
    };
    const hasTools = input.tools && Object.keys(input.tools).length > 0;

    if (hasTools) {
      if (!this.sdk.Output) {
        yield {
          type: "error",
          error: `${this.name}: SDK does not expose Output.object — tool-bearing object prompts unsupported.`,
        };
        return;
      }
      const {
        schema,
        output: _o,
        schemaName: _sn,
        schemaDescription: _sd,
        ...rest
      } = input;
      const experimental_output = this.sdk.Output.object({ schema });
      // rest already carries experimental_telemetry from the adapter.
      const params = {
        ...rest,
        experimental_output,
        abortSignal: ctx.signal,
      };

      if (ctx.shouldStream === false) {
        try {
          const res = await this.sdk.generateText(params);
          const object =
            (await res.resolvedOutput) ?? res.experimental_output;
          yield { type: "object-final", value: object };
          yield {
            type: "finish",
            reason: res.finishReason ?? "stop",
            usage: this.chunks.normalizeUsage(res.usage),
          };
        } catch (err) {
          yield { type: "error", error: normalizeError(err) };
        }
        return;
      }

      // SDK call inside the try — a synchronous `streamText` throw must
      // surface as a terminal `error` event, not an exception.
      try {
        const streamResult = this.sdk.streamText(params);
        // Optional on the view (plain text runs don't carry it), but always
        // present on Output-bearing results — this branch only runs when
        // `experimental_output` was set above.
        for await (const partial of streamResult.experimental_partialOutputStream!) {
          yield { type: "object-delta", partial };
        }
        // Usage arrives on a side channel (the `.usage` promise) after the
        // partial stream drains — funnel it onto the single terminal `finish`.
        const usage = this.chunks.normalizeUsage(await streamResult.usage);
        // Single usage channel: every finish carries usage. Default to zeros when
        // the SDK's side-channel promise reports nothing, so the contract
        // ("finish carries usage") holds uniformly.
        yield {
          type: "finish",
          reason: "stop",
          usage: usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        };
      } catch (err) {
        yield { type: "error", error: normalizeError(err) };
      }
      return;
    }

    // No tools
    if (ctx.shouldStream === false) {
      try {
        const res = await this.sdk.generateObject({
          ...input,
          abortSignal: ctx.signal,
        });
        yield { type: "object-final", value: res.object };
        yield {
          type: "finish",
          reason: res.finishReason ?? "stop",
          usage: this.chunks.normalizeUsage(res.usage),
        };
      } catch (err) {
        yield { type: "error", error: normalizeError(err) };
      }
      return;
    }

    // SDK call inside the try — see the tool-bearing path above.
    try {
      const streamResult = this.sdk.streamObject({
        ...input,
        abortSignal: ctx.signal,
      });
      for await (const c of streamResult.fullStream) {
        if (c.type === "error") {
          yield { type: "error", error: normalizeError(c.error) };
          return;
        }
        if (c.type === "object") {
          yield { type: "object-delta", partial: c.object };
        }
      }
      // Side-channel usage promise → single terminal `finish`.
      const usage = this.chunks.normalizeUsage(await streamResult.usage);
      // Single usage channel: every finish carries usage. Default to zeros when
      // the SDK's side-channel promise reports nothing, so the contract
      // ("finish carries usage") holds uniformly.
      yield {
        type: "finish",
        reason: "stop",
        usage: usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    } catch (err) {
      yield { type: "error", error: normalizeError(err) };
    }
  }

  async executeImage(
    formatted: unknown,
    ctx: ExecCtx
  ): Promise<WebhookImageResponse> {
    const input = formatted as Record<string, unknown>;
    const res = await this.sdk.generateImage({
      ...input,
      abortSignal: ctx.signal,
    });
    return {
      type: "image",
      result: res.images.map((i) => ({
        // Cross-major alias; the per-adapter contract assertions pin that
        // at least one of the two exists on the real types.
        mimeType: (i.mimeType || i.mediaType) as string,
        base64: i.base64,
      })),
      traceId: "",
    };
  }

  async executeSpeech(
    formatted: unknown,
    ctx: ExecCtx
  ): Promise<WebhookSpeechResponse> {
    const input = formatted as Record<string, unknown>;
    const res = await this.sdk.generateSpeech({
      ...input,
      abortSignal: ctx.signal,
    });
    return {
      type: "speech",
      result: {
        mimeType: (res.audio.mimeType || res.audio.mediaType) as string,
        base64: res.audio.base64,
        // Optional on the view; present on real speech results (pinned by
        // the per-adapter contract assertions).
        format: res.audio.format as string,
      },
      traceId: "",
    };
  }
}

/**
 * Builds an `Executor` for a specific Vercel AI SDK major. The consumer
 * binds their pinned `ai` version's functions via `opts.sdk` so this
 * factory never peer-depends on `ai` itself.
 */
export function createVercelExecutor(
  opts: CreateVercelExecutorOptions
): Executor {
  return new VercelSharedExecutor(opts);
}
