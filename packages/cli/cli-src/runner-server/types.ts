/**
 * Back-compat shim. The platform-agnostic webhook types moved to
 * `@agentmark-ai/prompt-core/webhook-runner` alongside `handleWebhookRequest`,
 * so deployed handlers can import them without pulling in the CLI. This file is
 * kept so existing imports of `@agentmark-ai/cli/runner-server` keep working.
 *
 * New code should import these from `@agentmark-ai/prompt-core/webhook-runner`.
 */

export type {
  ControlPlaneClient,
  WebhookHandler,
  WebhookRequest,
  WebhookResponse,
  TelemetryOptions,
  WebhookPromptResponse,
  WebhookDatasetResponse,
} from '@agentmark-ai/prompt-core/webhook-runner';
