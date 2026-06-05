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

/**
 * MastraExecutor — translates Mastra `agent.stream()` / `agent.generate()`
 * events into the canonical AgentEvent stream consumed by WebhookRunner.
 *
 * The adapter's `adaptText` / `adaptObject` already pre-computes the
 * `{messages, generateOptions}` pair under `_runnable` so this executor
 * doesn't need to redo the compile dance. Legacy `MastraAdapterWebhookHandler`
 * continues to work via its own formatAgent + formatMessages two-stage flow.
 *
 * Capabilities: Mastra's adapter doesn't currently support image/speech
 * (the legacy runner throws). Declared accordingly.
 */

type FormattedWithRunnable = {
  _runnable?: { messages: any; generateOptions: any };
  [key: string]: any;
};

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

function buildAgent(formatted: FormattedWithRunnable): {
  agent: Agent;
  messages: any;
  generateOptions: any;
} {
  const runnable = formatted._runnable;
  if (!runnable) {
    throw new Error(
      "MastraExecutor expected `_runnable` on the formatted payload. " +
        "Ensure you're running through WebhookRunner (or a caller that invokes " +
        "`prompt.format()` with metadata) — the legacy formatAgent two-stage " +
        "flow does not populate `_runnable`."
    );
  }
  // Strip adapter-internal keys that shouldn't reach Agent's constructor.
  const { _runnable, adaptMessages, ...agentConfig } = formatted;
  void _runnable;
  void adaptMessages;
  const agent = new Agent(agentConfig as any);
  return {
    agent,
    messages: runnable.messages,
    generateOptions: runnable.generateOptions,
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
      built = buildAgent(formatted as FormattedWithRunnable);
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
          usage: extractUsage((res as any).usage),
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
          usage: extractUsage((res as any).usage),
        };
        return;
      }

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
          yield {
            type: "finish",
            reason: c.finishReason ?? "stop",
            usage: extractUsage(c.usage ?? c.totalUsage),
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
    let built: ReturnType<typeof buildAgent>;
    try {
      built = buildAgent(formatted as FormattedWithRunnable);
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
          usage: extractUsage((res as any).usage),
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
          usage: extractUsage((res as any).usage),
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
      // Funnel it onto the single terminal `finish` (usage is best-effort on
      // the streaming path — finish still terminates the stream without it).
      let usage: ReturnType<typeof extractUsage> | undefined;
      const usagePromise = (streamResult as any).usage;
      if (usagePromise && typeof usagePromise.then === "function") {
        try {
          usage = extractUsage(await usagePromise);
        } catch {
          /* ignore — usage is best-effort on streaming path */
        }
      }
      yield { type: "finish", reason: "stop", usage: usage ?? undefined };
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
