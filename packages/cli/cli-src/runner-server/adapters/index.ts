/**
 * Platform adapters for AgentMark webhook server.
 * Import the adapter you need for your deployment platform.
 */

export {
  createExpressMiddleware,
  createWebhookServer as createExpressWebhookServer,
  type ExpressWebhookServerOptions
} from './express';

export {
  createNextAppHandler,
  createNextPagesHandler,
  createNextEdgeHandler
} from './nextjs';

// Re-export types
export type { WebhookHandler, WebhookRequest, WebhookResponse } from '../types';
