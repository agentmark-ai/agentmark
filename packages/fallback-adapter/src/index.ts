/**
 * DEPRECATED shim. The neutral client factory and `DefaultAdapter` live in
 * `@agentmark-ai/prompt-core` now — import from there instead:
 *
 *   import { createAgentMark } from "@agentmark-ai/prompt-core";
 *
 * This package re-exports them unchanged so existing imports keep working.
 */
export { createAgentMark, DefaultAdapter } from "@agentmark-ai/prompt-core";
export type {
  DefaultAgentmark,
  DefaultObjectPrompt,
  FormatWithDatasetOptions,
} from "@agentmark-ai/prompt-core";
