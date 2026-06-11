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

// One-call wiring for cloud-dispatched runs: your client + a custom
// `Executor` → a ready-to-serve WebhookRunner with AgentMark span hooks
// defaulted. Loader/evals are read from the client — register them once,
// on `createAgentMark`.
export { createWebhookRunner } from "./create-webhook-runner";
export type { CreateWebhookRunnerOptions } from "./create-webhook-runner";

// Re-export ApiLoader from @agentmark-ai/prompt-core/loader-api for convenience
export { ApiLoader } from "@agentmark-ai/prompt-core/loader-api";
export type { CloudLoaderOptions, LocalLoaderOptions } from "@agentmark-ai/prompt-core/loader-api";
