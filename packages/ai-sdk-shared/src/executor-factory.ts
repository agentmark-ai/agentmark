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
 * The subset of the Vercel AI SDK surface the executor calls into. Each
 * consuming adapter (v4, v5) pulls the actual `ai` package at its pinned
 * peer-dep range and passes the bound functions into the factory. The
 * shared factory never imports `ai` directly — that's how we avoid the
 * peer-dep-range-hell I laid out in the architecture review.
 *
 * Types are deliberately loose (`any`) — ai-sdk-shared doesn't take a
 * type-level dependency on either v4 or v5. Each adapter re-exposes
 * strongly-typed facades on top of the executor it builds.
 */
export interface VercelSDK {
  generateText: (params: any) => Promise<any>;
  streamText: (params: any) => any;
  generateObject: (params: any) => Promise<any>;
  streamObject: (params: any) => any;
  Output?: { object: (opts: { schema: any }) => any };
  generateImage: (params: any) => Promise<any>;
  generateSpeech: (params: any) => Promise<any>;
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
    const input = formatted as any;
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
        const steps = (res as any).steps ?? [];
        const toolCalls = steps.flatMap((s: any) => s.toolCalls ?? []);
        const toolResults = steps.flatMap((s: any) => s.toolResults ?? []);
        for (const tc of toolCalls) {
          yield {
            type: "tool-call",
            id: tc.toolCallId,
            name: tc.toolName,
            args: tc.args ?? tc.input,
          };
        }
        for (const tr of toolResults) {
          yield {
            type: "tool-result",
            id: tr.toolCallId,
            name: tr.toolName,
            result: tr.result ?? tr.output,
          };
        }
        if (res.text) yield { type: "text-delta", text: res.text };
        yield {
          type: "finish",
          reason: (res as any).finishReason ?? "stop",
          usage: this.chunks.normalizeUsage(res.usage),
        };
      } catch (err) {
        yield { type: "error", error: normalizeError(err) };
      }
      return;
    }

    // Streaming path
    const streamResult = this.sdk.streamText(params);
    try {
      for await (const chunk of streamResult.fullStream) {
        const c = chunk as any;
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
            id: c.toolCallId,
            name: c.toolName,
            args: c.args ?? c.input,
          };
        } else if (c.type === "tool-result") {
          yield {
            type: "tool-result",
            id: c.toolCallId,
            name: c.toolName,
            result: c.result ?? c.output,
          };
        } else if (c.type === "finish") {
          yield {
            type: "finish",
            reason: c.finishReason ?? "stop",
            usage: this.chunks.normalizeUsage(this.chunks.readFinishUsage(c)),
          };
        }
      }
    } catch (err) {
      yield { type: "error", error: normalizeError(err) };
    }
  }

  async *executeObject(
    formatted: unknown,
    ctx: ExecCtx
  ): AsyncIterable<ObjectStreamEvent> {
    const input = formatted as any;
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
            (await (res as any).resolvedOutput) ??
            (res as any).experimental_output;
          yield { type: "object-final", value: object };
          yield {
            type: "finish",
            reason: (res as any).finishReason ?? "stop",
            usage: this.chunks.normalizeUsage(res.usage),
          };
        } catch (err) {
          yield { type: "error", error: normalizeError(err) };
        }
        return;
      }

      const streamResult = this.sdk.streamText(params);
      try {
        for await (const partial of streamResult.experimental_partialOutputStream) {
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
        yield { type: "object-final", value: (res as any).object };
        yield {
          type: "finish",
          reason: (res as any).finishReason ?? "stop",
          usage: this.chunks.normalizeUsage(res.usage),
        };
      } catch (err) {
        yield { type: "error", error: normalizeError(err) };
      }
      return;
    }

    const streamResult = this.sdk.streamObject({
      ...input,
      abortSignal: ctx.signal,
    });
    try {
      for await (const chunk of streamResult.fullStream) {
        const c = chunk as any;
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
    const input = formatted as any;
    const res = await this.sdk.generateImage({
      ...input,
      abortSignal: ctx.signal,
    });
    return {
      type: "image",
      result: res.images.map((i: any) => ({
        mimeType: i.mimeType || i.mediaType,
        base64: i.base64,
      })),
      traceId: "",
    };
  }

  async executeSpeech(
    formatted: unknown,
    ctx: ExecCtx
  ): Promise<WebhookSpeechResponse> {
    const input = formatted as any;
    const res = await this.sdk.generateSpeech({
      ...input,
      abortSignal: ctx.signal,
    });
    return {
      type: "speech",
      result: {
        mimeType: (res.audio as any).mimeType || (res.audio as any).mediaType,
        base64: res.audio.base64,
        format: res.audio.format,
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
