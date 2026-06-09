/**
 * Back-compat shim. The platform-agnostic webhook dispatch moved to
 * `@agentmark-ai/prompt-core/webhook-runner` so deployed handlers can import it
 * without pulling in the CLI (which carries an embedded dashboard). This file
 * is kept so existing imports of `@agentmark-ai/cli/runner-server` keep working.
 *
 * New code should import `handleWebhookRequest` from
 * `@agentmark-ai/prompt-core/webhook-runner` directly.
 */

export { handleWebhookRequest } from '@agentmark-ai/prompt-core/webhook-runner';
export type {
  ControlPlaneClient,
  WebhookHandler,
  WebhookRequest,
  WebhookResponse,
} from '@agentmark-ai/prompt-core/webhook-runner';
