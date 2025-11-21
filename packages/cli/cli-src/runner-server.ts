/**
 * AgentMark Webhook Server
 *
 * This file provides the main entry point for the webhook server, which is used
 * during local development to execute prompts and experiments.
 *
 * The implementation uses a platform adapter architecture, where the core
 * logic is platform-agnostic and adapters translate between platform-specific
 * request/response formats.
 *
 * For backwards compatibility, this file delegates to the Express adapter.
 * For production deployments, see the platform adapters:
 * - Express: runner-server/adapters/express.ts
 * - Next.js: runner-server/adapters/nextjs.ts
 * - AWS Lambda: See PLATFORM_ADAPTERS.md
 * - Azure Functions: See PLATFORM_ADAPTERS.md
 */

import { type WebhookPromptResponse, type WebhookDatasetResponse } from '@agentmark/prompt-core';
import { createWebhookServer as createExpressWebhookServer } from './runner-server/adapters/express';

/**
 * Generic webhook handler interface that any adapter can implement
 */
export interface WebhookHandler {
  runPrompt(promptAst: any, options?: { shouldStream?: boolean; customProps?: Record<string, any> }): Promise<WebhookPromptResponse>;
  runExperiment(promptAst: any, datasetRunName: string, datasetPath?: string): Promise<WebhookDatasetResponse>;
}

export interface WebhookServerOptions {
  port?: number;
  handler: WebhookHandler;
  fileServerUrl?: string;
  templatesDirectory?: string;
}

/**
 * Creates an HTTP server that wraps a webhook handler instance.
 * This server provides endpoints for executing prompts and experiments via HTTP.
 * Used by the CLI and local development workflows.
 *
 * This function delegates to the Express adapter for implementation.
 * The public API remains unchanged for backwards compatibility.
 *
 * @param options - Server configuration options
 * @returns HTTP server instance
 */
export async function createWebhookServer(options: WebhookServerOptions) {
  return createExpressWebhookServer(options);
}

// Re-export platform adapters for advanced use cases
export { createExpressMiddleware } from './runner-server/adapters/express';
// Note: Next.js adapters should be imported directly from './runner-server/adapters/nextjs'
// to avoid bundling Next.js dependencies when they're not needed
export { handleWebhookRequest } from './runner-server/core';
export type { WebhookRequest, WebhookResponse } from './runner-server/types';
