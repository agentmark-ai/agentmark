/**
 * React-free type entry point for @agentmark-ai/ui-components.
 *
 * This barrel re-exports only TYPE definitions (interfaces, type aliases)
 * with zero runtime side effects and zero React/MUI/@emotion in the
 * transitive import graph.
 *
 * Consumers that only need types (test environments with
 * `environment: 'node'`, gateway/CLI servers, downstream `api-types`
 * packages) should import from `@agentmark-ai/ui-components/types`
 * instead of the main barrel `@agentmark-ai/ui-components`.
 *
 * Source-of-truth files this barrel re-exports from:
 *   - sections/traces/types          (Trace, SpanData, TraceData, …)
 *   - sections/experiments/types     (ExperimentDetail, ComparisonRow, …)
 *   - sections/requests/type         (Request)
 *
 * If you add a new type, place it in (or re-export from) one of those
 * three pure-type modules and add a re-export here. Do NOT import from
 * any *.tsx file or any module that pulls React/MUI/@emotion.
 */

// Trace-related types — single re-export covers Trace, SpanData, TraceData,
// LLMText, LLMPrompt, ScoreData, Session, SpanIOData.
export type {
  Trace,
  SpanData,
  TraceData,
  LLMText,
  LLMPrompt,
  ScoreData,
  Session,
  SpanIOData,
} from "../sections/traces/types";

// Experiment types — covers ExperimentSummary, ExperimentDetail,
// ExperimentItemSummary, ExperimentItemScore, ComparisonRow,
// ComparisonItemData, ComparisonSummary, ScoreDelta, DiffSegment,
// ComparisonSortMode, ComparisonFilterMode.
export type {
  ExperimentItemScore,
  ExperimentSummary,
  ExperimentItemSummary,
  ExperimentDetail,
  ComparisonItemData,
  ScoreDelta,
  ComparisonRow,
  ComparisonSummary,
  DiffSegment,
  ComparisonSortMode,
  ComparisonFilterMode,
} from "../sections/experiments/types";

// Request type
export type { Request } from "../sections/requests/type";

// Utility-side types that callers of /utilities may also need without
// pulling React. These come from pure utility modules and re-exporting
// them here keeps the type surface co-located.
export type {
  SpanForGrouping,
  WorkflowNodeType,
  NodeGroup,
} from "../sections/traces/utils/span-grouping";
export type { DatasetInputKind } from "../sections/traces/utils/extract-span-data";
