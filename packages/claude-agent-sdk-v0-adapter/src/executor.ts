import type {
  ExecCtx,
  Executor,
  ExecutorCapabilities,
  ObjectStreamEvent,
  TextStreamEvent,
  AgentEvent,
} from "@agentmark-ai/prompt-core";
import { finalizeUsage, normalizeError } from "@agentmark-ai/prompt-core";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { withTracing } from "./traced";
import type {
  ClaudeAgentTextParams,
  ClaudeAgentObjectParams,
  ClaudeAgentErrorResult,
} from "./types";

/**
 * Bridge `ExecCtx.signal` into the SDK's `abortController` query option.
 * The Claude Agent SDK takes a controller (not a signal): reuse the
 * caller's controller when one is already on the options (abort THAT one
 * when the runner's signal fires, so both abort paths converge), otherwise
 * install a fresh controller wired to the signal. No-op without a signal.
 */
function withAbortSignal<
  T extends ClaudeAgentTextParams | ClaudeAgentObjectParams
>(adapted: T, signal: AbortSignal | undefined): T {
  if (!signal) return adapted;
  const options = { ...adapted.query.options };
  const controller = options.abortController ?? new AbortController();
  if (signal.aborted) {
    controller.abort(signal.reason);
  } else {
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  options.abortController = controller;
  return { ...adapted, query: { ...adapted.query, options } };
}

/**
 * ClaudeAgentExecutor — translates Claude Agent SDK `query()` messages into
 * the canonical AgentEvent stream consumed by the shared WebhookRunner.
 *
 * Mirrors `claude-agent-sdk-v0-adapter-python`'s `ClaudeAgentExecutor` —
 * the two are the reference pair for this SDK's translation:
 *   - AssistantMessage text blocks → `text-delta` (text kind) /
 *     `object-delta` JSON fragments (object kind), STREAMING MODE ONLY —
 *     in one-shot mode the ResultMessage's `result` already carries the
 *     final text, and emitting both double-counts the drained output.
 *   - ResultMessage (success) → final value + single terminal `finish`
 *     carrying finalized usage.
 *   - ResultMessage (error subtypes: error_during_execution,
 *     error_max_turns, …) → terminal `error` event.
 *
 * SDK-level telemetry stays with `withTracing` (GenAI semconv spans +
 * traceId) exactly as the pre-port runner used it; the runner's span hooks
 * add the standard AgentMark parent span on top, same as every adapter.
 *
 * Image + speech are declared unsupported via `capabilities()`.
 */
export class ClaudeAgentExecutor implements Executor {
  readonly name = "claude-agent-sdk-v0";

  capabilities(): ExecutorCapabilities {
    return { text: true, object: true, image: false, speech: false };
  }

  executeText(formatted: unknown, ctx: ExecCtx): AsyncIterable<TextStreamEvent> {
    return this.execQuery(
      formatted as ClaudeAgentTextParams,
      "text",
      ctx
    ) as AsyncIterable<TextStreamEvent>;
  }

  executeObject(
    formatted: unknown,
    ctx: ExecCtx
  ): AsyncIterable<ObjectStreamEvent> {
    return this.execQuery(
      formatted as ClaudeAgentObjectParams,
      "object",
      ctx
    ) as AsyncIterable<ObjectStreamEvent>;
  }

  /**
   * Shared message-translation loop. Kind-branching keeps each stream
   * kind-correct (text streams never see object events and vice versa);
   * the public methods narrow the union back to their declared event type.
   */
  private async *execQuery(
    adapted: ClaudeAgentTextParams | ClaudeAgentObjectParams,
    kind: "text" | "object",
    ctx: ExecCtx
  ): AsyncIterable<AgentEvent> {
    const streaming = ctx.shouldStream !== false;

    let inputTokens = 0;
    let outputTokens = 0;
    let finalText = "";
    let structuredOutput: unknown = undefined;

    try {
      // withTracing wraps the SDK call in GenAI telemetry spans when
      // `adapted.telemetry` is enabled (adapter-authored, runner-enriched);
      // otherwise it's a passthrough. ctx.signal rides in as the SDK's
      // abortController so the runner can cancel the query mid-flight.
      const traced = await withTracing(query, withAbortSignal(adapted, ctx.signal));

      for await (const message of traced as AsyncIterable<any>) {
        if (message.type === "assistant") {
          // Skip deltas in one-shot mode — ResultMessage carries the final
          // text and emitting both double-counts the drained output.
          if (!streaming) continue;
          const content = message.message?.content ?? [];
          for (const block of content) {
            const text = block?.type === "text" ? block.text : undefined;
            if (!text) continue;
            if (kind === "text") {
              yield { type: "text-delta", text };
            } else {
              // Claude streams JSON fragments of the structured response;
              // surface them as object-delta so consumers can render
              // progress. The resolved value arrives on ResultMessage.
              yield { type: "object-delta", partial: text };
            }
          }
        } else if (message.type === "result") {
          if (message.subtype === "success") {
            finalText = message.result || "";
            structuredOutput = message.structured_output;
            inputTokens = message.usage?.input_tokens || 0;
            outputTokens = message.usage?.output_tokens || 0;
          } else {
            // error_during_execution / error_max_turns / … — terminal.
            const errorResult = message as ClaudeAgentErrorResult;
            yield {
              type: "error",
              error:
                errorResult.errors?.join(", ") ||
                `Error: ${errorResult.subtype}`,
            };
            return;
          }
        }
      }
    } catch (err) {
      yield { type: "error", error: normalizeError(err) };
      return;
    }

    // Emit the resolved value: in one-shot text mode the final text wasn't
    // streamed above; object mode always ends with the canonical
    // object-final carrying the structured output.
    if (kind === "text") {
      if (finalText && !streaming) yield { type: "text-delta", text: finalText };
    } else {
      yield { type: "object-final", value: structuredOutput };
    }

    // Single terminal finish — the canonical usage carrier, zero-defaulted
    // (matches `createExecutor`'s builder and the other adapters).
    yield {
      type: "finish",
      reason: "stop",
      usage: finalizeUsage({
        inputTokens,
        outputTokens,
        totalTokens: undefined,
      }) ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }
}
