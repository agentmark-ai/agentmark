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
  WebhookRequest,
  WebhookResponse,
} from "@agentmark-ai/prompt-core/webhook-runner";
import { createAgentmarkSpanHooks } from "@agentmark-ai/sdk";
import type { Tool } from "ai";
import type { VercelAIAdapter } from "./adapter";
import { VercelAIExecutor } from "./executor";

/**
 * VercelAdapterWebhookHandler is now a thin compatibility shim around the
 * shared WebhookRunner + VercelAIExecutor. Byte-for-byte compatible with
 * the prior per-adapter implementation (see test/runner.snapshot.test.ts).
 *
 * All per-adapter runner duplication (AST loading, span wrapping, NDJSON
 * encoding, experiment loop, eval dispatch) now lives in prompt-core.
 */
export class VercelAdapterWebhookHandler<
  T extends PromptShape<T> = PromptShape<Record<string, never>>
> {
  private readonly runner: WebhookRunner<T, VercelAIAdapter<T, Record<string, Tool>>>;
  /**
   * Surfaced so the shared dispatch can answer control-plane jobs (get-evals)
   * without the caller threading the client separately. AgentMark implements
   * ControlPlaneClient, so this satisfies WebhookHandler's `client`.
   */
  readonly client: AgentMark<T, VercelAIAdapter<T, Record<string, Tool>>>;

  constructor(client: AgentMark<T, VercelAIAdapter<T, Record<string, Tool>>>) {
    this.client = client;
    this.runner = new WebhookRunner(
      client,
      new VercelAIExecutor(),
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

  /**
   * Route a managed-deployment webhook job — prompt-run / dataset-run /
   * get-evals — through the shared runner, sourcing evals from this handler's
   * client. The canonical deployed handler is
   * `export default new VercelAdapterWebhookHandler(client).dispatch`. No
   * per-adapter dispatch code; mirrors `runner.dispatch` and the Python adapters.
   */
  dispatch(request: WebhookRequest): Promise<WebhookResponse> {
    return this.runner.dispatch(request);
  }
}
