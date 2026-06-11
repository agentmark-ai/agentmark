import { z } from "zod";
import { PaginationParamsSchema, itemResponse, listResponse } from "./common";
import { noLoneSurrogates, reasonableChDate } from "../validators";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const SpansListParamsSchema = PaginationParamsSchema.extend({
  // Pre-migration contract: spans default limit is 100 (different from the
  // global PAGINATION.defaultLimit of 50). Override here to match the
  // published API default; the runtime handler uses the same fallback.
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  trace_id: z.string().optional(),
  type: z.enum(["SPAN", "GENERATION", "EVENT"]).optional(),
  status: z.enum(["UNSET", "OK", "ERROR"]).optional(),
  name: z.string().optional(),
  model: z.string().optional(),
  min_duration: z.coerce.number().int().min(0).optional(),
  max_duration: z.coerce.number().int().min(0).optional(),
  // Date-range filters. ISO 8601 datetime strings; `reasonableChDate`
  // rejects far-future / far-past values that overflow ClickHouse's
  // DateTime range.
  start_date: z.string().datetime().refine(...reasonableChDate).optional(),
  end_date: z.string().datetime().refine(...reasonableChDate).optional(),
  // Filter by user / session attribution. String fields flow into
  // ClickHouse UTF-8 columns — `noLoneSurrogates` rejects malformed
  // surrogate pairs that would corrupt the column on insert/compare.
  user_id: z.string().refine(...noLoneSurrogates).optional(),
  session_id: z.string().refine(...noLoneSurrogates).optional(),
  // Advanced filter — a human-readable string expression, mirroring the
  // trace-side `filter` parameter (see TracesListParamsSchema for the full
  // grammar). Clauses combine with `and`; a clause is a predicate or a
  // parenthesized OR-group. A malformed filter returns 400.
  filter: z
    .string()
    .optional()
    .describe(
      'Filter expression (string DSL), same grammar as GET /v1/traces. ' +
        'Clauses combined with `and`; a clause is a predicate ' +
        '(`field operator [value]`) or a parenthesized OR-group: ' +
        '`(a = 1 or b = 2)`. Supports `metadata.<key>` with `exists` / ' +
        '`does not exist` / `=` / string operators. Example: ' +
        '`(model = "gpt-4o" or model = "o3") and status = ERROR`. ' +
        'Malformed filters return 400.',
    ),
});

// ---------------------------------------------------------------------------
// Response schemas (snake_case, matching actual API responses)
// ---------------------------------------------------------------------------

export const TraceSpanResponseSchema = z.object({
  id: z.string(),
  trace_id: z.string(),
  parent_id: z.string().nullable(),
  name: z.string(),
  status: z.enum(['UNSET', 'OK', 'ERROR']),
  status_message: z.string(),
  duration_ms: z.number(),
  timestamp: z.string().datetime(),
  type: z.string(),
  model: z.string().nullable(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  cost: z.number(),
  span_kind: z.string(),
  service_name: z.string(),
  prompt_name: z.string().nullable(),
  metadata: z.record(z.string(), z.string()),
});

export const TraceSpansListResponseSchema = itemResponse(z.array(TraceSpanResponseSchema));

export const SpansListResponseSchema = listResponse(TraceSpanResponseSchema);

export const SpanIOSchema = z.object({
  input: z.string(),
  output: z.string(),
  output_object: z.string().nullable(),
  tool_calls: z.string().nullable(),
  // Custom per-span metadata (reserved internal namespaces excluded). Lets a
  // consumer read a span's metadata in isolation without loading the trace.
  metadata: z.record(z.string(), z.string()),
});

export const SpanIOResponseSchema = itemResponse(SpanIOSchema);

export type SpansListParams = z.infer<typeof SpansListParamsSchema>;
export type TraceSpanResponse = z.infer<typeof TraceSpanResponseSchema>;
export type TraceSpansListResponse = z.infer<typeof TraceSpansListResponseSchema>;
export type SpansListResponse = z.infer<typeof SpansListResponseSchema>;
export type SpanIOResponse = z.infer<typeof SpanIOResponseSchema>;
