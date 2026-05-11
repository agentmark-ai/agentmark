import { z } from "zod";
import {
  PaginationParamsSchema,
  DateRangeParamsSchema,
  SortParamsSchema,
  itemResponse,
  listResponse,
} from "./common";
import { SpanInTraceSchema } from "./traces";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const SessionsListParamsSchema = PaginationParamsSchema
  .merge(DateRangeParamsSchema)
  .merge(SortParamsSchema)
  .extend({
    // Pre-migration contract: ISO 8601 datetime strings (format: date-time).
    // Overrides the shared DateRangeParamsSchema's plain-string typing.
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional(),
    // Sessions are the one route where main defaulted sort_order to "desc";
    // other routes left it unset.
    sort_order: z.enum(["asc", "desc"]).optional().default("desc"),
    search: z.string().optional(),
  });

// ---------------------------------------------------------------------------
// Response schemas (snake_case, matching actual API responses)
// ---------------------------------------------------------------------------

export const SessionResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  trace_count: z.number().int().nonnegative(),
  total_cost: z.number(),
  total_tokens: z.number().int().nonnegative(),
  latency_ms: z.number(),
  tags: z.array(z.string()).optional(),
});

export const SessionsListResponseSchema = listResponse(SessionResponseSchema);

export const SessionTraceResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['UNSET', 'OK', 'ERROR']),
  start: z.string().datetime(),
  end: z.string().datetime(),
  latency_ms: z.number(),
  cost: z.number(),
  tokens: z.number().int().nonnegative(),
  spans: z.array(SpanInTraceSchema),
});

export const SessionTracesResponseSchema = itemResponse(z.array(SessionTraceResponseSchema));

export type SessionsListParams = z.infer<typeof SessionsListParamsSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type SessionsListResponse = z.infer<typeof SessionsListResponseSchema>;
export type SessionTracesResponse = z.infer<typeof SessionTracesResponseSchema>;
