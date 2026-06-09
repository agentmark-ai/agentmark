import { getFrontMatter } from "@agentmark-ai/templatedx";
import type { Ast } from "@agentmark-ai/templatedx";
import type { AgentMark } from "@agentmark-ai/prompt-core";
import type {
  WebhookPromptResponse,
  WebhookDatasetResponse,
} from "@agentmark-ai/prompt-core";
import { WebhookRunner } from "@agentmark-ai/prompt-core/webhook-runner";
import type {
  RunPromptOptions,
  RunExperimentOptions,
  WebhookRequest,
  WebhookResponse,
} from "@agentmark-ai/prompt-core/webhook-runner";
import { createAgentmarkSpanHooks } from "@agentmark-ai/sdk";
import type { ClaudeAgentAdapter } from "./adapter";
import { ClaudeAgentExecutor } from "./executor";

/** Re-exported so existing `import type { RunPromptOptions } from
 * ".../runner"` call sites keep compiling (the shared shape is a superset —
 * it adds `signal`). */
export type { RunPromptOptions, RunExperimentOptions };

interface Frontmatter {
  image_config?: unknown;
  speech_config?: unknown;
}

const UNSUPPORTED_KIND_RESPONSE = (kind: "Image" | "Speech") =>
  ({
    type: "text",
    result:
      `Error: ${kind} generation is not supported by Claude Agent SDK. ` +
      "Use the Vercel AI SDK adapter with " +
      (kind === "Image" ? "an image model." : "a speech model."),
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    finishReason: "error",
    traceId: "",
  }) as WebhookPromptResponse;

/**
 * ClaudeAgentWebhookHandler is now a thin compatibility shim around the
 * shared WebhookRunner + ClaudeAgentExecutor (the same port the Mastra
 * adapter got, and the shape the Python claude adapter has always had).
 * The bespoke pre-port wire (`{type, delta}` streaming chunks, combined
 * result+usage final chunk) is replaced by the canonical WireChunk NDJSON
 * every other adapter emits.
 *
 * Historical behavior deliberately preserved:
 *   - Non-streaming default (`shouldStream ?? false`), unlike the shared
 *     runner's streaming default.
 *   - Image/speech prompts return the legacy text-shaped error payload
 *     (not the canonical unsupported-kind error) and experiments emit the
 *     legacy error chunk.
 */
export class ClaudeAgentWebhookHandler {
  private readonly runner: WebhookRunner<
    Record<string, { input: unknown; output: unknown }>,
    ClaudeAgentAdapter<Record<string, { input: unknown; output: unknown }>>
  >;

  constructor(
    client: AgentMark<
      Record<string, { input: unknown; output: unknown }>,
      ClaudeAgentAdapter<Record<string, { input: unknown; output: unknown }>>
    >
  ) {
    this.runner = new WebhookRunner(
      client,
      new ClaudeAgentExecutor(),
      createAgentmarkSpanHooks()
    );
  }

  /** The AgentMark client this handler executes against — surfaced (like every
   *  other adapter) so `handleWebhookRequest(event, handler)` answers get-evals
   *  zero-config. Sourced from the runner, the single owner. */
  get client() {
    return this.runner.client;
  }

  async runPrompt(
    promptAst: Ast,
    options?: RunPromptOptions
  ): Promise<WebhookPromptResponse> {
    const frontmatter = getFrontMatter(promptAst) as Frontmatter;
    if (frontmatter.image_config) return UNSUPPORTED_KIND_RESPONSE("Image");
    if (frontmatter.speech_config) return UNSUPPORTED_KIND_RESPONSE("Speech");

    return this.runner.runPrompt(promptAst, {
      ...options,
      shouldStream: options?.shouldStream ?? false,
    });
  }

  async runExperiment(
    promptAst: Ast,
    datasetRunName: string,
    options?: RunExperimentOptions
  ): Promise<WebhookDatasetResponse> {
    const frontmatter = getFrontMatter(promptAst) as Frontmatter;
    if (frontmatter.image_config || frontmatter.speech_config) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({
                type: "error",
                error:
                  "Image and speech prompts are not supported by Claude Agent SDK",
              }) + "\n"
            )
          );
          controller.close();
        },
      });
      return {
        stream,
        streamHeaders: { "AgentMark-Streaming": "true" as const },
      };
    }

    return this.runner.runExperiment(promptAst, datasetRunName, options);
  }

  /**
   * Route a managed-deployment webhook job — prompt-run / dataset-run /
   * get-evals — through the shared runner, sourcing evals from this handler's
   * client. The canonical deployed handler is
   * `export default new ClaudeAgentWebhookHandler(client).dispatch`. No
   * per-adapter dispatch code; mirrors `runner.dispatch` and the other adapters.
   */
  dispatch(request: WebhookRequest): Promise<WebhookResponse> {
    return this.runner.dispatch(request);
  }
}
