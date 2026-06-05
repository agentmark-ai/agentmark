import { Agent } from "@mastra/core/agent";
import type {
  ExecCtx,
  Executor,
  ExecutorCapabilities,
  ObjectStreamEvent,
  TextStreamEvent,
  WebhookImageResponse,
  WebhookSpeechResponse,
} from "@agentmark-ai/prompt-core";
import { finalizeUsage, normalizeError } from "@agentmark-ai/prompt-core";
import type { MastraTextParams, MastraObjectParams } from "./adapter";

/**
 * MastraExecutor — translates Mastra `agent.stream()` / `agent.generate()`
 * events into the canonical AgentEvent stream consumed by WebhookRunner.
 *
 * Input is the runnable bundle (`MastraTextParams` / `MastraObjectParams`)
 * the adapter's `adaptText` / `adaptObject` produce: `{agent, messages,
 * generateOptions}`. The user-facing two-stage `formatAgent` flow never
 * reaches this executor — it composes `adaptTextAgent` + `adaptTextMessages`
 * directly and its callers run the Agent themselves.
 * (`MastraAdapterWebhookHandler` is a thin shim over WebhookRunner + this
 * executor — see runner.ts.)
 *
 * Capabilities: Mastra's adapter doesn't currently support image/speech.
 * Declared accordingly.
 */

type RunnableBundle = MastraTextParams | MastraObjectParams;

/**
 * Mastra-shaped field name mapping — every Mastra provider I've seen uses
 * some permutation of {inputTokens, promptTokens, input_tokens}. Once
 * normalized, hand off to the shared `finalizeUsage` for the totalTokens
 * fallback. The shared helper is what guarantees parity across adapters.
 */
function extractUsage(raw: any) {
  if (!raw || typeof raw !== "object") return undefined;
  return finalizeUsage({
    inputTokens: Number(raw.inputTokens ?? raw.promptTokens ?? raw.input_tokens ?? 0) || 0,
    outputTokens: Number(raw.outputTokens ?? raw.completionTokens ?? raw.output_tokens ?? 0) || 0,
    totalTokens: typeof raw.totalTokens === "number" ? raw.totalTokens : undefined,
  });
}

/**
 * `finish` is the single canonical usage carrier — it always carries usage,
 * zero-defaulted when the SDK reports none (matches `createExecutor`'s
 * builder and the shared Vercel executor).
 */
const usageOrZero = (u: ReturnType<typeof extractUsage>) =>
  u ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

function buildAgent(formatted: RunnableBundle): {
  agent: Agent;
  messages: any;
  generateOptions: any;
} {
  const bundle = formatted as Partial<RunnableBundle> | null | undefined;
  if (
    !bundle ||
    typeof bundle !== "object" ||
    !bundle.agent ||
    !bundle.messages
  ) {
    throw new Error(
      "MastraExecutor expected the runnable bundle ({ agent, messages, " +
        "generateOptions }) that MastraAdapter.adaptText/adaptObject produce — " +
        "run through WebhookRunner or `prompt.format()`. " +
        "`formatAgent()` output is the user-facing AgentConfig for callers " +
        "that construct the Agent themselves; it is not executable here."
    );
  }
  return {
    agent: new Agent(bundle.agent as any),
    messages: bundle.messages,
    generateOptions: bundle.generateOptions,
  };
}

export class MastraExecutor implements Executor {
  readonly name = "mastra-v0";

  capabilities(): ExecutorCapabilities {
    return { text: true, object: true, image: false, speech: false };
  }

  async *executeText(
    formatted: unknown,
    ctx: ExecCtx
  ): AsyncIterable<TextStreamEvent> {
    let built: ReturnType<typeof buildAgent>;
    try {
      built = buildAgent(formatted as RunnableBundle);
    } catch (err) {
      yield { type: "error", error: normalizeError(err) };
      return;
    }
    const { agent, messages, generateOptions } = built;

    // Mastra defaults to non-streaming in the legacy handler. Honor the
    // ExecCtx hint.
    if (ctx.shouldStream === false) {
      try {
        const res = await agent.generate(messages, generateOptions);
        const toolCalls = (res as any).toolCalls ?? [];
        const toolResults = (res as any).toolResults ?? [];
        for (const tc of toolCalls) {
          yield {
            type: "tool-call",
            id: tc.toolCallId,
            name: tc.toolName,
            args: tc.args,
          };
        }
        for (const tr of toolResults) {
          yield {
            type: "tool-result",
            id: tr.toolCallId,
            name: tr.toolName,
            result: tr.result,
          };
        }
        const text =
          (res as any).text ?? (res as any).content ?? String(res ?? "");
        if (text) yield { type: "text-delta", text };
        yield {
          type: "finish",
          reason: (res as any).finishReason ?? "stop",
          usage: usageOrZero(extractUsage((res as any).usage)),
        };
      } catch (err) {
        yield { type: "error", error: normalizeError(err) };
      }
      return;
    }

    // Streaming path. Mastra's fullStream emits AI SDK v4-style chunks
    // (text-delta with `textDelta`, tool-call, tool-result, finish).
    try {
      const streamResult = await agent.stream(messages, generateOptions);
      const fullStream = (streamResult as any).fullStream;
      if (!fullStream) {
        // Some Mastra model implementations don't support streaming —
        // fall back to generate() so the executor still produces events.
        const res = await agent.generate(messages, generateOptions);
        const text =
          (res as any).text ?? (res as any).content ?? String(res ?? "");
        if (text) yield { type: "text-delta", text };
        yield {
          type: "finish",
          reason: (res as any).finishReason ?? "stop",
          usage: usageOrZero(extractUsage((res as any).usage)),
        };
        return;
      }

      // Capture + suppress native finish chunks and emit exactly ONE
      // terminal `finish` after the loop — covers SDK streams that omit the
      // finish chunk entirely (or emit several). `finish` is the single
      // canonical usage carrier, so it zero-defaults rather than going out
      // usage-less (matches `createExecutor`'s builder).
      let finishReason: string | undefined;
      let finishUsage: ReturnType<typeof extractUsage>;
      for await (const chunk of fullStream) {
        const c = chunk as any;
        if (c.type === "error") {
          yield { type: "error", error: normalizeError(c.error) };
          return;
        }
        if (c.type === "text-delta") {
          yield { type: "text-delta", text: c.textDelta ?? c.text ?? "" };
        } else if (c.type === "tool-call") {
          yield {
            type: "tool-call",
            id: c.toolCallId,
            name: c.toolName,
            args: c.args,
          };
        } else if (c.type === "tool-result") {
          yield {
            type: "tool-result",
            id: c.toolCallId,
            name: c.toolName,
            result: c.result,
          };
        } else if (c.type === "finish") {
          finishReason = c.finishReason ?? "stop";
          finishUsage = extractUsage(c.usage ?? c.totalUsage);
        }
      }
      yield {
        type: "finish",
        reason: finishReason ?? "stop",
        usage: usageOrZero(finishUsage),
      };
    } catch (err) {
      yield { type: "error", error: normalizeError(err) };
    }
  }

  async *executeObject(
    formatted: unknown,
    ctx: ExecCtx
  ): AsyncIterable<ObjectStreamEvent> {
    let built: ReturnType<typeof buildAgent>;
    try {
      built = buildAgent(formatted as RunnableBundle);
    } catch (err) {
      yield { type: "error", error: normalizeError(err) };
      return;
    }
    const { agent, messages, generateOptions } = built;

    if (ctx.shouldStream === false) {
      try {
        const res = await agent.generate(messages, generateOptions);
        const object = (res as any).object ?? res;
        yield { type: "object-final", value: object };
        yield {
          type: "finish",
          reason: (res as any).finishReason ?? "stop",
          usage: usageOrZero(extractUsage((res as any).usage)),
        };
      } catch (err) {
        yield { type: "error", error: normalizeError(err) };
      }
      return;
    }

    try {
      const streamResult = await agent.stream(messages, generateOptions);
      const fullStream = (streamResult as any).fullStream;
      if (!fullStream) {
        const res = await agent.generate(messages, generateOptions);
        const object = (res as any).object ?? res;
        yield { type: "object-final", value: object };
        yield {
          type: "finish",
          reason: (res as any).finishReason ?? "stop",
          usage: usageOrZero(extractUsage((res as any).usage)),
        };
        return;
      }

      for await (const chunk of fullStream) {
        const c = chunk as any;
        if (c.type === "error") {
          yield { type: "error", error: normalizeError(c.error) };
          return;
        }
        // Mastra emits both `object` (snapshot) and `object-delta`
        // (incremental) chunks — surface both as object-delta events so
        // the runner emits a consistent wire sequence.
        if (c.type === "object") {
          yield { type: "object-delta", partial: c.object };
        } else if (c.type === "object-delta") {
          yield { type: "object-delta", partial: c.objectDelta };
        }
      }

      // Mastra's streamResult exposes usage as a Promise when available.
      // Funnel it onto the single terminal `finish`. Zero-default when the
      // side channel reports nothing — `finish` is the single canonical
      // usage carrier, so it always carries usage (matches `createExecutor`'s
      // builder and the shared Vercel executor).
      let usage: ReturnType<typeof extractUsage> | undefined;
      const usagePromise = (streamResult as any).usage;
      if (usagePromise && typeof usagePromise.then === "function") {
        try {
          usage = extractUsage(await usagePromise);
        } catch {
          /* ignore — usage is best-effort on streaming path */
        }
      }
      yield {
        type: "finish",
        reason: "stop",
        usage: usageOrZero(usage),
      };
    } catch (err) {
      yield { type: "error", error: normalizeError(err) };
    }
  }

  // Mastra doesn't implement image/speech in this adapter — declared
  // unsupported via `capabilities()`. WebhookRunner emits a canonical
  // error when those kinds are invoked.
  async executeImage(): Promise<WebhookImageResponse> {
    throw new Error("Image generation is not supported by Mastra adapter.");
  }

  async executeSpeech(): Promise<WebhookSpeechResponse> {
    throw new Error("Speech generation is not supported by Mastra adapter.");
  }
}
