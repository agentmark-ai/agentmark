export { AgentMark, createAgentMark } from "./agentmark";
export { buildEvalsResponse } from "./control-plane";
export type { ControlPlaneClient, EvalsResponse } from "./control-plane";
export { DefaultAdapter } from "./adapters/default";
export { createAgentMarkClient } from "./adapters/default-client";
export type { DefaultAgentmark, DefaultObjectPrompt } from "./adapters/default-client";

export { TemplateDXTemplateEngine } from "./template_engines/templatedx";
export { getTemplateDXInstance } from "./template_engines/templatedx-instances";
export { ObjectPrompt, TextPrompt } from "./prompts";
export type { PromptFormatParams } from "./prompts";
export type { AgentMarkOptions } from "./agentmark";

export { TextConfigSchema, ObjectConfigSchema, TestSettingsSchema } from "./schemas";

export { applySampling, parseRowSelection, parseSplitSpec, validateSamplingOptions } from './sampling';

export { hashRowInput } from './hash-input';

export { isRegression, evaluateExperimentGate } from './gate';
export type { GateEval, GateRow, GateInput, GateResult, GateRowResult, ScoreThresholdResult } from './gate';

// JUnit rendering of a gate result — single-sourced here so the CLI (prompt
// experiments) and the SDK (code/agent/workflow experiments) emit the identical
// report and surface the same way in CI.
export {
  buildJUnitXml,
  buildJUnitReport,
  escapeXmlAttribute,
  escapeXmlText,
  wrapCdata,
  stringifyForXml,
} from './junit';
export type { JUnitRow, JUnitEval, JUnitSuiteOptions, JUnitReport } from './junit';

export { baselineKey, baselineRequestQuery, parseBaselineResponse } from './baseline';
export type { BaselineResolved, ParsedBaseline } from './baseline';

export type {
  TextConfig,
  ImageConfig,
  SpeechConfig,
  ObjectConfig,
  Adapter,
  PromptMetadata,
  ChatMessage,
  RichChatMessage,
  AdaptOptions,
  PromptShape,
  PromptKey,
  KeysWithKind,
  TemplateEngine,
  Loader,
  PromptKind,
  TestSettings,
  DatasetStreamChunk,
  DatasetErrorChunk,
  FormatWithDatasetOptions,
  SamplingOptions,
} from "./types";

export type { EvalRegistry } from "./eval-registery";
export type { EvalFunction, EvalResult } from "./types";
export { createPromptTelemetry } from "./runner";
export type { WebhookDatasetResponse, WebhookDatasetChunk, WebhookPromptResponse, WebhookTextResponse, WebhookObjectResponse, WebhookImageResponse, WebhookSpeechResponse } from "./runner";

// Experiment runner concurrency
export {
  runDatasetPool,
  experimentErrorChunk,
  DEFAULT_EXPERIMENT_CONCURRENCY,
} from "./experiment";

// NDJSON wire contract — the typed line format the WebhookRunner streams and
// the cloud + dashboard consume. Import `WireChunk` on the consumer side to
// parse with the same union the producer is checked against. The event→chunk
// mappers are exported for the cross-language wire vectors (and any BYO
// runner that wants byte-identical chunks).
export {
  wireJson,
  usageToWire,
  textEventToWire,
  objectEventToWire,
  datasetRowToWire,
  textResponseToWire,
  objectResponseToWire,
} from "./wire";
export type {
  WireChunk,
  WireUsage,
  WireDatasetResult,
  DatasetRowParams,
  WireTextResponse,
  WireObjectResponse,
} from "./wire";

// MCP helpers and types
export {
  parseMcpUri,
  interpolateEnvInObject,
  normalizeToolsList,
} from "./mcp";
export type {
  NormalizedTool,
  McpUrlServerConfig,
  McpStdioServerConfig,
  McpServerConfig,
  McpServers,
} from "./mcp";

// Shared MCP registry (generic over tool type)
export { McpServerRegistry } from "./mcp-registry";
export type { McpClient, McpClientFactory } from "./mcp-registry";

// Base adapter primitives — shared tool resolution, telemetry, paramMap
export {
  BaseAdapter,
  applyParamMap,
  buildTelemetryMetadata,
} from "./base-adapter";
export type { ParamMap, ParamMapEntry } from "./base-adapter";

// Executor protocol — public BYO-SDK contract
export type {
  AgentEvent,
  TextStreamEvent,
  ObjectStreamEvent,
  FinishEvent,
  ErrorEvent,
  AgentUsage,
  ExecCtx,
  Executor,
  ExecutorCapabilities,
} from "./executor";

// Cross-adapter executor primitives — shared invariants (totalTokens
// fallback, error normalization) that every adapter needs.
export { finalizeUsage, normalizeError } from "./executor-helpers";
export type { CanonicalUsage, FinalizedUsage } from "./executor-helpers";

// Generic Executor builder — the low-friction BYO-SDK path. Turn one-shot
// "call my SDK, return {text|object, usage}" handlers into a protocol-correct
// Executor (conformance-by-construction). SDK-shape agnostic.
export { createExecutor } from "./executor-builder";
export type {
  ExecutorDefinition,
  ExecutorTextResult,
  ExecutorObjectResult,
  ImageResult,
  SpeechResult,
} from "./executor-builder";

// Post-hoc observation shape — OTel-GenAI-aligned summary of a run.
// Complements the live AgentEvent stream.
export type {
  AgentMarkObservation,
  AgentMarkToolInvocation,
  AgentMarkUsage,
  ObservationHook,
} from "./observation";

// Span-hook primitives — adapters bring their own OTEL integration so
// prompt-core itself stays SDK-agnostic. Mirrors prompt-core-python's
// ExperimentItemSpanHook (the PromptSpanHook is a TS-only concern since
// Python doesn't wrap prompt-level spans at the runner layer).
export type {
  SpanLike,
  PromptSpanParams,
  PromptSpanHook,
  ExperimentItemParams,
  ExperimentItemSpanHook,
} from "./span-hook";
export {
  nullPromptSpanHook,
  nullExperimentItemSpanHook,
} from "./span-hook";

// Conformance suite for Executor implementations (BYO-SDK + official adapters)
export {
  assertTextStream,
  assertObjectStream,
  assertErrorStream,
  assertAbortStream,
  assertUsageShape,
  runConformance,
  runExecutorConformance,
  ConformanceError,
} from "./executor-conformance";
export type {
  ScenarioDriver,
  ConformanceViolation,
  ExecutorConformanceInputs,
} from "./executor-conformance";

// WebhookRunner lives at `@agentmark-ai/prompt-core/webhook-runner` so
// browser-facing consumers (dashboards, CLI web UI) that only need types can
// import from the main entry without pulling in @agentmark-ai/sdk + OTEL.
