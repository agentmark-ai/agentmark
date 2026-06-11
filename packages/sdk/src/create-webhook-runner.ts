/**
 * The `@agentmark-ai/sdk` flavor of prompt-core's `createWebhookRunner`:
 * identical options, but `hooks` default to `createAgentmarkSpanHooks()` so
 * every cloud-dispatched run is traced to AgentMark without extra wiring.
 * Pass `hooks: {}` to opt out of tracing.
 *
 * Register loader + evals once, on `createAgentMark`, and pass the `client` —
 * the runner sources both from it.
 *
 * Deployed handlers that want a prompt-core-only dependency tree can import
 * the same factory from `@agentmark-ai/prompt-core/webhook-runner` and pass
 * hooks explicitly.
 */

import type { PromptShape } from "@agentmark-ai/prompt-core";
import type { DefaultAdapter } from "@agentmark-ai/prompt-core";
import {
  createWebhookRunner as buildWebhookRunner,
  WebhookRunner,
} from "@agentmark-ai/prompt-core/webhook-runner";
import type { CreateWebhookRunnerOptions } from "@agentmark-ai/prompt-core/webhook-runner";
import { createAgentmarkSpanHooks } from "./span-hooks";

export type { CreateWebhookRunnerOptions };

export function createWebhookRunner<
  D extends PromptShape<D> = PromptShape<Record<string, never>>,
>(opts: CreateWebhookRunnerOptions<D>): WebhookRunner<D, DefaultAdapter<D>> {
  return buildWebhookRunner<D>({
    ...opts,
    hooks: opts.hooks ?? createAgentmarkSpanHooks(),
  });
}
