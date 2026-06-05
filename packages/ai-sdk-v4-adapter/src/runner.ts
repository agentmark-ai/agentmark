import type { Ast } from "@agentmark-ai/templatedx";
import type { AgentMark, PromptShape } from "@agentmark-ai/prompt-core";
import type {
  WebhookDatasetResponse,
  WebhookPromptResponse,
} from "@agentmark-ai/prompt-core";
import { WebhookRunner } from "@agentmark-ai/prompt-core/webhook-runner";
import type {
  RunPromptOptions,
  RunExperimentOptions,
} from "@agentmark-ai/prompt-core/webhook-runner";
import { createAgentmarkSpanHooks } from "@agentmark-ai/sdk";
import type { Tool } from "ai";
import type { VercelAIAdapter } from "./adapter";
import { VercelAIv4Executor } from "./executor";

/**
 * v4 WebhookHandler — thin shim around the shared WebhookRunner.
 * See ai-sdk-v5-adapter's equivalent for architecture.
 */
export class VercelAdapterWebhookHandler<
  T extends PromptShape<T> = PromptShape<Record<string, never>>
> {
  private readonly runner: WebhookRunner<T, VercelAIAdapter<T, Record<string, Tool>>>;

  constructor(client: AgentMark<T, VercelAIAdapter<T, Record<string, Tool>>>) {
    this.runner = new WebhookRunner(
      client,
      new VercelAIv4Executor(),
      createAgentmarkSpanHooks()
    );
  }

  runPrompt(
    promptAst: Ast,
    options?: RunPromptOptions
  ): Promise<WebhookPromptResponse> {
    return this.runner.runPrompt(promptAst, options);
  }

  runExperiment(
    promptAst: Ast,
    datasetRunName: string,
    options?: RunExperimentOptions
  ): Promise<WebhookDatasetResponse> {
    return this.runner.runExperiment(promptAst, datasetRunName, options);
  }
}
