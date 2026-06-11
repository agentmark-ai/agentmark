/**
 * One-call wiring for a custom-SDK webhook runner.
 *
 * To serve the cloud/managed-execution path (the dashboard "Run prompt" button,
 * `agentmark dev`'s webhook, experiments the platform drives), a custom SDK
 * needs a handler exposing `runPrompt` / `runExperiment` / `dispatch`.
 * `createWebhookRunner` wraps `new WebhookRunner(client, executor, hooks)`.
 *
 * The runner sources BOTH the prompt loader and the eval registry from the
 * `client` you pass — register them exactly once, on `createAgentMark`:
 *
 *   const client = createAgentMark({ loader, evals });
 *   const runner = createWebhookRunner({ client, executor });
 *
 * Living in prompt-core, this factory keeps a deployed handler's dependency
 * tree to prompt-core + your SDK. It wires NO tracing by default — pass
 * `hooks` (e.g. `createAgentmarkSpanHooks()` from `@agentmark-ai/sdk`), or
 * use the `@agentmark-ai/sdk` re-export of this factory, which defaults the
 * hooks to AgentMark tracing for you. (Python's `create_webhook_runner`
 * defaults to tracing whenever `agentmark_sdk` is importable — same intent,
 * resolved at the layer that can see the SDK.)
 */

import type { AgentMark } from "./agentmark";
import type { DefaultAdapter } from "./adapters/default";
import type { Executor } from "./executor";
import type { PromptShape } from "./types";
import { WebhookRunner } from "./webhook-runner";
import type { WebhookRunnerHooks } from "./webhook-runner";

export interface CreateWebhookRunnerOptions<D extends PromptShape<D>> {
  /**
   * Your AgentMark client (from `createAgentMark`). The runner reads the
   * prompt loader AND the eval registry from it — so evals registered there
   * both run in experiments and list in the dashboard's New Experiment
   * dialog (the `get-evals` control-plane job).
   */
  client: AgentMark<D, DefaultAdapter<D>>;
  /** Your SDK's executor — typically built with `createExecutor`. */
  executor: Executor;
  /**
   * Span/observation hooks for the runner. No default here in prompt-core —
   * for AgentMark tracing pass `createAgentmarkSpanHooks()` from
   * `@agentmark-ai/sdk`, or import this factory from `@agentmark-ai/sdk`,
   * which defaults exactly that.
   */
  hooks?: WebhookRunnerHooks;
}

/**
 * Build a ready-to-serve {@link WebhookRunner} from your client + a custom
 * `Executor`. The returned runner exposes `runPrompt` / `runExperiment` /
 * `dispatch` — exactly the shape the CLI runner-server and the gateway
 * dispatch expect.
 */
export function createWebhookRunner<
  D extends PromptShape<D> = PromptShape<Record<string, never>>,
>(opts: CreateWebhookRunnerOptions<D>): WebhookRunner<D, DefaultAdapter<D>> {
  return new WebhookRunner<D, DefaultAdapter<D>>(opts.client, opts.executor, opts.hooks);
}
