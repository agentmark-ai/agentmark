/**
 * Platform-agnostic types for the AgentMark webhook server.
 * These types are used by the core handler and all platform adapters.
 */

import type { WebhookPromptResponse, WebhookDatasetResponse } from '@agentmark/prompt-core';

/**
 * Generic webhook handler interface that any adapter can implement.
 * This is the contract that adapters (e.g., VercelAdapterWebhookHandler) must fulfill.
 */
export interface WebhookHandler {
  runPrompt(promptAst: any, options?: { shouldStream?: boolean; customProps?: Record<string, any> }): Promise<WebhookPromptResponse>;
  runExperiment(promptAst: any, datasetRunName: string, datasetPath?: string): Promise<WebhookDatasetResponse>;
}

/**
 * Standardized request format for all platform adapters.
 * Platform adapters translate their specific request formats into this structure.
 */
export interface WebhookRequest {
  type: 'prompt-run' | 'dataset-run';
  data: {
    ast: any;
    customProps?: Record<string, any>;
    options?: { shouldStream?: boolean };
    experimentId?: string;
    datasetPath?: string;
    promptPath?: string;
  };
}

/**
 * Standardized response format from the core handler.
 * Platform adapters translate this into their specific response formats.
 */
export type WebhookResponse =
  | { type: 'json'; data: any; status?: number }
  | { type: 'stream'; stream: ReadableStream; headers: Record<string, string> }
  | { type: 'error'; error: string; details?: string; status: number };

// Re-export prompt-core types for convenience
export type { WebhookPromptResponse, WebhookDatasetResponse } from '@agentmark/prompt-core';
