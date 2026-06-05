export { AgentMarkSDK, experimentResultToJUnit } from "./agentmark";
export type { RunExperimentOptions, RunExperimentResult, ExperimentEvaluator } from "./agentmark";
export { span, trace, streamWithSpan } from "./trace";
export { observe, SpanKind } from "./trace";
export { serializeValue } from "./trace";
export { createPiiMasker } from "./trace";
export type {
  SpanContext,
  SpanOptions,
  SpanResult,
  ObserveOptions,
  StreamWithSpanOptions,
  StreamWithSpanResult,
} from "./trace";
export type { MaskFunction, PiiMaskerConfig } from "./trace";

// WebhookRunner hook adapters — plug `span()` into the prompt-core
// PromptSpanHook / ExperimentItemSpanHook contract. This is the canonical
// wiring every official adapter reaches for.
export {
  agentmarkPromptSpanHook,
  agentmarkExperimentItemSpanHook,
  createAgentmarkSpanHooks,
} from "./span-hooks";

// One-call BYO wiring: turn a custom `Executor` into a ready-to-serve
// WebhookRunner (DefaultAdapter + span hooks) for the cloud/managed path.
export { createWebhookRunner } from "./byo";
export type { CreateWebhookRunnerOptions } from "./byo";

// Re-export ApiLoader from @agentmark-ai/loader-api for convenience
export { ApiLoader } from "@agentmark-ai/loader-api";
export type { CloudLoaderOptions, LocalLoaderOptions } from "@agentmark-ai/loader-api";
