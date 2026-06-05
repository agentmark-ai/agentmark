import { getFrontMatter } from "@agentmark-ai/templatedx";
import type { Ast } from "@agentmark-ai/templatedx";
import type { ToolsInput } from "@mastra/core/agent";
import type {
  PromptShape,
  WebhookDatasetResponse,
  WebhookPromptResponse,
} from "@agentmark-ai/prompt-core";
import { WebhookRunner } from "@agentmark-ai/prompt-core/webhook-runner";
import type {
  RunPromptOptions,
  RunExperimentOptions,
} from "@agentmark-ai/prompt-core/webhook-runner";
import { createAgentmarkSpanHooks } from "@agentmark-ai/sdk";
import type { MastraAdapter } from "./adapter";
import { MastraExecutor } from "./executor";
import type { MastraAgentMark } from "./mastra-agentmark";

type Frontmatter = {
  image_config?: unknown;
  speech_config?: unknown;
};

/**
 * MastraAdapterWebhookHandler is now a thin compatibility shim around the
 * shared WebhookRunner + MastraExecutor. Historical unsupported image/speech
 * behavior is preserved: prompt runs still throw instead of returning a
 * canonical unsupported-kind payload.
 */
export class MastraAdapterWebhookHandler<
  T extends PromptShape<T> | undefined = PromptShape<Record<string, never>>
> {
  // The shape param is intentionally `any` (not `PromptShape<any>`): Mastra's
  // public generic allows `T = undefined`, and `MastraAdapter<undefined>` only
  // satisfies `Adapter<undefined>` — NOT `Adapter<PromptShape<any>>` (whose
  // `__dict` can't be `undefined`). So any non-`any` first param fails the
  // runner's `A extends Adapter<T>` constraint for the undefined case. Removing
  // this would mean dropping `| undefined` from Mastra's own generic — a
  // breaking change to the adapter's public API. The `any` is confined to this
  // private field; the public runPrompt / runExperiment signatures stay precise.
  private readonly runner: WebhookRunner<any, MastraAdapter<T, ToolsInput>>;

  constructor(client: MastraAgentMark<T, MastraAdapter<T, ToolsInput>>) {
    this.runner = new WebhookRunner(
      client,
      new MastraExecutor(),
      createAgentmarkSpanHooks()
    );
  }

  async runPrompt(
    promptAst: Ast,
    options?: RunPromptOptions
  ): Promise<WebhookPromptResponse> {
    const frontmatter = getFrontMatter(promptAst) as Frontmatter;
    if (frontmatter.image_config) {
      throw new Error("Image generation not implemented");
    }
    if (frontmatter.speech_config) {
      throw new Error("Speech generation not implemented");
    }
    // Preserve Mastra's historical non-streaming default: the shared runner
    // defaults `shouldStream` to true, but the standalone Mastra handler always
    // defaulted to false. Keep that so existing callers that omit the flag still
    // get a one-shot response rather than a stream.
    return this.runner.runPrompt(promptAst, {
      ...options,
      shouldStream: options?.shouldStream ?? false,
    });
  }

  runExperiment(
    promptAst: Ast,
    datasetRunName: string,
    options?: RunExperimentOptions
  ): Promise<WebhookDatasetResponse> {
    return this.runner.runExperiment(promptAst, datasetRunName, options);
  }
}
