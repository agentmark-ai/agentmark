export { AgentMark, createAgentMark } from "./agentmark";
export { DefaultAdapter } from "./adapters/default";

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
