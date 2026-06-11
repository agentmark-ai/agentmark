/**
 * One-call wiring for a bring-your-own-SDK webhook runner.
 *
 * To serve the cloud/managed-execution path (the dashboard "Run prompt" button,
 * `agentmark dev`'s webhook, experiments the platform drives), a BYO SDK needs
 * a handler exposing `runPrompt` / `runExperiment`. Assembling that by hand is:
 *
 *   const client = createAgentMark({ loader });
 *   const runner = new WebhookRunner(client, executor, createAgentmarkSpanHooks());
 *
 * `createWebhookRunner` collapses that to a single call and picks the sensible
 * BYO defaults — the neutral `DefaultAdapter` (so your `Executor` receives the
 * rendered prompt config as `formatted`) and AgentMark's OTEL span hooks (so
 * every run is traced to the cloud). Pair it with `createExecutor` from
 * `@agentmark-ai/prompt-core` and you have the full path in ~25 lines total.
 */

import { createAgentMark, DefaultAdapter } from "@agentmark-ai/prompt-core";
import type {
  Executor,
  Loader,
  PromptShape,
  EvalRegistry,
} from "@agentmark-ai/prompt-core";
import { WebhookRunner } from "@agentmark-ai/prompt-core/webhook-runner";
import type { WebhookRunnerHooks } from "@agentmark-ai/prompt-core/webhook-runner";
import { createAgentmarkSpanHooks } from "./span-hooks";

export interface CreateWebhookRunnerOptions<D extends PromptShape<D>> {
  /** Your SDK's executor — typically built with `createExecutor`. */
  executor: Executor;
  /** Prompt loader (FileLoader for local, ApiLoader.cloud() for cloud prompts). */
  loader?: Loader<D>;
  /**
   * Eval registry — a map of eval name → eval function. Threaded into the
   * client so the runner BOTH runs these evals during experiments AND lists
   * them for the dashboard's New Experiment dialog (the `get-evals`
   * control-plane job). Register evals once, here: the absence of this input
   * was exactly why BYO-SDK apps silently showed "No evals available".
   */
  evals?: EvalRegistry;
  /**
   * Override the runner's span/observation hooks. Defaults to
   * `createAgentmarkSpanHooks()` (traces every run to AgentMark). Pass
   * `{}` to opt out of tracing.
   */
  hooks?: WebhookRunnerHooks;
}

/**
 * Build a ready-to-serve {@link WebhookRunner} from a BYO `Executor`, wired
 * with the neutral `DefaultAdapter` + AgentMark span hooks. The returned
 * runner exposes `runPrompt` / `runExperiment` — exactly the shape the CLI
 * runner-server and the gateway dispatch expect.
 */
export function createWebhookRunner<
  D extends PromptShape<D> = PromptShape<Record<string, never>>,
>(opts: CreateWebhookRunnerOptions<D>): WebhookRunner<D, DefaultAdapter<D>> {
  const client = createAgentMark<D>({
    loader: opts.loader,
    evals: opts.evals,
  });
  return new WebhookRunner<D, DefaultAdapter<D>>(
    client,
    opts.executor,
    opts.hooks ?? createAgentmarkSpanHooks(),
  );
}
