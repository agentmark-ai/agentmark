import { z } from "zod";
import { PaginationParamsSchema, itemResponse, listResponse } from "./common";

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
});

export const SpanIOResponseSchema = itemResponse(SpanIOSchema);

export type SpansListParams = z.infer<typeof SpansListParamsSchema>;
export type TraceSpanResponse = z.infer<typeof TraceSpanResponseSchema>;
export type TraceSpansListResponse = z.infer<typeof TraceSpansListResponseSchema>;
export type SpansListResponse = z.infer<typeof SpansListResponseSchema>;
export type SpanIOResponse = z.infer<typeof SpanIOResponseSchema>;
