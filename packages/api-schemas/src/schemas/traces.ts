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
  });

export const TraceExportParamsSchema = z.object({
  format: z.enum(["jsonl", "openai", "csv"]).optional().default("jsonl"),
  limit: z.coerce.number().int().min(1).max(2000).optional().default(500),
  lightweight: z.enum(["true", "false"]).optional(),
  // Export uses ISO 8601 datetimes (format: date-time) — matches
  // pre-migration contract. The `cursor` is the timestamp of the last
  // row on the previous page (also a datetime), used for keyset pagination.
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  type: z.enum(["GENERATION", "SPAN", "EVENT", "all"]).optional().default("all"),
  model: z.string().optional(),
  status: z.enum(["STATUS_CODE_UNSET", "STATUS_CODE_OK", "STATUS_CODE_ERROR"]).optional(),
  name: z.string().optional(),
  min_score: z.coerce.number().optional(),
  max_score: z.coerce.number().optional(),
  user_id: z.string().optional(),
  tag: z.string().optional(),
  metadata_key: z.string().optional(),
  metadata_value: z.string().optional(),
  cursor: z.string().datetime().optional(),
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

export const SpanInTraceSchema = z.object({
  id: z.string(),
  trace_id: z.string(),
  parent_id: z.string().nullable(),
  name: z.string(),
  status: z.enum(['UNSET', 'OK', 'ERROR']),
  duration_ms: z.number(),
  timestamp: z.string().datetime(),
  type: z.string(),
  model: z.string().nullable(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  cost: z.number(),
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
// Graph schemas (GET /v1/traces/:traceId/graph)
// ---------------------------------------------------------------------------

export const GraphNodeSchema = z.object({
  parentNodeId: z.string().optional(),
  nodeId: z.string(),
  spanId: z.string(),
  nodeType: z.string(),
  displayName: z.string(),
  spanName: z.string(),
});

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
