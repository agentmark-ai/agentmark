// The neutral pass-through adapter lives in `@agentmark-ai/prompt-core` so the
// BYO `createWebhookRunner` path and this package share ONE class (no drift
// between two identical "default" adapters). Re-exported here to preserve the
// `@agentmark-ai/fallback-adapter` public surface.
export { DefaultAdapter } from "@agentmark-ai/prompt-core";
