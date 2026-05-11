import { z } from "zod";
import { itemResponse } from "./common";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const MetricsParamsSchema = z.object({
  // Pre-migration contract: ISO 8601 datetime strings (format: date-time).
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
  extended: z.coerce.boolean().optional().default(false),
});

// ---------------------------------------------------------------------------
// Response schemas (snake_case, matching actual API responses)
// ---------------------------------------------------------------------------

export const MetricsSummarySchema = z.object({
  total_requests: z.number().int().nonnegative(),
  success_count: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
  total_cost: z.number(),
  total_tokens: z.number().int().nonnegative(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  avg_latency_ms: z.number(),
  unique_users: z.number().int().nonnegative(),
  // Extended fields (present when extended=true)
  avg_cost_per_request: z.number().optional(),
  avg_input_tokens_per_request: z.number().optional(),
  avg_output_tokens_per_request: z.number().optional(),
  avg_total_tokens_per_request: z.number().optional(),
  model_count: z.number().int().nonnegative().optional(),
});

export const MetricsTimeSeriesPointSchema = z.object({
  date: z.string().date(),
  hour: z.number().int().min(0).max(23),
  requests: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  cost: z.number(),
  tokens: z.number().int().nonnegative(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  avg_latency_ms: z.number(),
  unique_users: z.number().int().nonnegative(),
});

export const MetricsDataSchema = z.object({
  summary: MetricsSummarySchema,
  time_series: z.array(MetricsTimeSeriesPointSchema),
});

export const MetricsResponseSchema = itemResponse(MetricsDataSchema);

export type MetricsParams = z.infer<typeof MetricsParamsSchema>;
export type MetricsSummary = z.infer<typeof MetricsSummarySchema>;
export type MetricsTimeSeriesPoint = z.infer<typeof MetricsTimeSeriesPointSchema>;
export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;
