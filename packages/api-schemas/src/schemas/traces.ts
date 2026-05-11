import { z } from "zod";
import { TRACE_STATUS_VALUES } from "./constants";
import {
  PaginationParamsSchema,
  DateRangeParamsSchema,
  SortParamsSchema,
  itemResponse,
  listResponse,
} from "./common";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const TracesListParamsSchema = PaginationParamsSchema
  .merge(DateRangeParamsSchema)
  .merge(SortParamsSchema)
  .extend({
    // Pre-migration contract: YYYY-MM-DD date strings (format: date).
    // Overrides the shared DateRangeParamsSchema's plain-string typing.
    start_date: z.string().date().optional(),
    end_date: z.string().date().optional(),
    status: z.enum(TRACE_STATUS_VALUES).optional(),
    user_id: z.string().optional(),
    model: z.string().optional(),
    // Filter by dataset run ID. Supersedes the deprecated
    // `GET /v1/runs/{runId}/traces` endpoint. Both paths surface the
    // same underlying ClickHouse predicate (DatasetRunId = ?).
    dataset_run_id: z.string().optional(),
    // Filter by session ID. Successor to the deprecated
    // `GET /v1/sessions/{sessionId}/traces` sub-resource — session-
    // scoping is a filter dimension, not a parent relationship, so it
    // belongs as a query param on the canonical list endpoint.
    session_id: z.string().optional(),
    // Filter by trace name (exact match on the root span's
    // `TraceName`). Matches Langfuse's `name` parameter.
    name: z.string().optional(),
    // Filter by tag. Repeatable — `?tag=prod&tag=experiment-42`
    // matches traces carrying ANY of the listed tags (OR semantics,
    // matching Langfuse's `tags` behavior). Single `?tag=prod` is
    // accepted as the one-element case.
    tag: z.union([z.string(), z.array(z.string())]).optional(),
    // Filter by the git commit SHA recorded on the trace. Useful for
    // attributing behavior to a specific deploy — "show me every trace
    // from commit abc1234". Cloud: exact match on the dedicated
    // `CommitSha` column; local CLI: extracted from `Metadata.commit_sha`.
    commit_sha: z.string().optional(),
    // Advanced filter DSL. JSON-serialized
    // `{field, operator, value}[]` array, lifted from the internal
    // dashboard filter machinery (`buildFilterWhereClause`).
    //   - `field`: one of `model`, `user_id`, `session_id`,
    //     `prompt_name`, `trace_id`, `status`, `latency_ms`, `cost`,
    //     `input`, `output`, `tags`, `metadata.<key>`,
    //     `score__<name>`.
    //   - `operator`: varies by field type. Strings accept `equals`,
    //     `notEquals`, `contains`, `notContains`, `startsWith`,
    //     `endsWith`. Metadata also accepts `exists` / `doesNotExist`.
    //     Numbers accept `equals`, `gt`, `gte`, `lt`, `lte`. Tags
    //     accepts `equals`, `notEquals`, `contains`.
    //   - `value`: string or array of strings.
    // Example:
    //   filter=[{"field":"metadata.env","operator":"equals","value":"prod"}]
    filter: z.string().optional(),
  });

// ---------------------------------------------------------------------------
// GET /v1/traces/{traceId} — detail endpoint query params
//
// `fields` opts into server-computed projections that would otherwise
// require a second round trip. Current values:
//   - `graph` — agent-workflow DAG nodes derived from span metadata.
//     Successor to the deprecated `GET /v1/traces/{traceId}/graph`
//     sub-resource.
//   - `scores` — evaluation scores attached to any span in the trace
//     (or the trace itself). Matches Langfuse's `fields=scores`.
// Comma-separated; omitting `fields` returns the base detail shape
// (backward compat — no projections pulled).
// ---------------------------------------------------------------------------

export const TraceDetailQueryParamsSchema = z.object({
  fields: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Response schemas (snake_case, matching actual API responses)
// ---------------------------------------------------------------------------

export const TraceResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['UNSET', 'OK', 'ERROR']),
  start: z.string().datetime(),
  end: z.string().datetime(),
  latency_ms: z.number(),
  cost: z.number(),
  tokens: z.number().int().nonnegative(),
  span_count: z.number().int().nonnegative(),
  tags: z.array(z.string()).optional(),
});

// Wire shape for spans embedded in a trace detail. Principle: this is a
// faithful projection of the service-layer Span — not a hand-curated
// subset. Pre-2026-05 the schema was minimised on the theory that bulk
// trace-detail responses needed to be small; in practice the only field
// where size genuinely scales (long chat histories, tool returns) is
// `input`. Hand-curating which other fields to ship turned out to
// reliably break the trace drawer when new consumers were added (e.g.
// the Test Prompt and Add-to-Dataset buttons silently disabled because
// `prompt_name` / `props` weren't on the wire). All small fields are
// kept here; `input` is `optional()` so a hosted gateway can opt out
// and rely on the lazy `/v1/traces/:id/spans/:id` endpoint for full I/O.
export const SpanInTraceSchema = z.object({
  id: z.string(),
  trace_id: z.string(),
  parent_id: z.string().nullable(),
  name: z.string(),
  status: z.enum(['UNSET', 'OK', 'ERROR']),
  status_message: z.string().nullable().optional(),
  duration_ms: z.number(),
  timestamp: z.string().datetime(),
  type: z.string(),
  model: z.string().nullable(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  reasoning_tokens: z.number().int().nonnegative().optional(),
  cost: z.number(),
  // Heavy fields — `input` can be huge for long chat histories. Both
  // are optional so hosted gateways can strip and serve them lazily
  // via `/v1/traces/:id/spans/:id`. Local SQLite (CLI) ships them by
  // default since the same row is already in memory.
  input: z.string().nullable().optional(),
  output: z.string().nullable().optional(),
  output_object: z.string().nullable().optional(),
  tool_calls: z.string().nullable().optional(),
  // Small but high-value: prompt name / props are required by the
  // trace drawer's button gating (Test Prompt / Add to Dataset).
  prompt_name: z.string().nullable().optional(),
  props: z.string().nullable().optional(),
  finish_reason: z.string().nullable().optional(),
  settings: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  span_kind: z.string().optional(),
  service_name: z.string().optional(),
});

// Graph node — agent-workflow DAG element derived from span metadata.
// Surfaces via the deprecated `/v1/traces/{traceId}/graph` sub-resource
// and (when requested) as the `graph` field on the canonical trace
// detail response.
export const GraphNodeSchema = z.object({
  parentNodeId: z.string().optional(),
  nodeId: z.string(),
  spanId: z.string(),
  nodeType: z.string(),
  displayName: z.string(),
  spanName: z.string(),
});

// Evaluation score attached to a span or trace. Keyed by either
// SpanId (annotations) or TraceId (CLI/LLM-as-judge). Same shape
// the dashboard's score drawer consumes internally.
export const TraceScoreSchema = z.object({
  id: z.string(),
  resource_id: z.string(),
  name: z.string(),
  score: z.number(),
  label: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  source: z.string(),
  user_id: z.string().nullable().optional(),
  created_at: z.string(),
});

export const TraceDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['UNSET', 'OK', 'ERROR']),
  start: z.string().datetime(),
  end: z.string().datetime(),
  latency_ms: z.number(),
  cost: z.number(),
  tokens: z.number().int().nonnegative(),
  input: z.string().optional(),
  output: z.string().optional(),
  spans: z.array(SpanInTraceSchema),
  // Populated only when the caller opts in with `?fields=graph`. Same
  // shape the deprecated `/v1/traces/{traceId}/graph` sub-resource
  // returns; included here so graph-aware consumers don't need a
  // second request.
  graph: z.array(GraphNodeSchema).optional(),
  // Populated only when the caller opts in with `?fields=scores`.
  // Flattened list of every score attached to any span in the trace
  // (or the trace itself).
  scores: z.array(TraceScoreSchema).optional(),
});

export const TraceDetailResponseSchema = itemResponse(TraceDetailSchema);

export const TracesListResponseSchema = listResponse(TraceResponseSchema);

// ---------------------------------------------------------------------------
// Ingestion schemas (POST /v1/traces)
// ---------------------------------------------------------------------------

/** Schema for OTLP ExportTraceServiceRequest body (JSON format). */
export const IngestTracesBodySchema = z.object({
  resourceSpans: z.array(z.object({}).passthrough()),
});

/**
 * Successful ingestion response. The HTTP status code is the success signal
 * (200 when processed inline, 202 when queued). `requestId` is operation
 * metadata — callers use it to correlate with async telemetry.
 */
export const IngestTracesResponseSchema = itemResponse(
  z.object({
    requestId: z.string().uuid().optional(),
  }),
);

// ---------------------------------------------------------------------------
// Graph schema (deprecated GET /v1/traces/:traceId/graph — successor
// is the `graph` field on the trace detail response via
// `GET /v1/traces/{traceId}?fields=graph`).
// ---------------------------------------------------------------------------

export const TraceGraphResponseSchema = itemResponse(z.array(GraphNodeSchema));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IngestTracesBody = z.infer<typeof IngestTracesBodySchema>;
export type IngestTracesResponse = z.infer<typeof IngestTracesResponseSchema>;
export type TracesListParams = z.infer<typeof TracesListParamsSchema>;
export type TraceResponse = z.infer<typeof TraceResponseSchema>;
export type TraceDetailResponse = z.infer<typeof TraceDetailResponseSchema>;
export type TracesListResponse = z.infer<typeof TracesListResponseSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type TraceGraphResponse = z.infer<typeof TraceGraphResponseSchema>;
export type TraceScore = z.infer<typeof TraceScoreSchema>;
