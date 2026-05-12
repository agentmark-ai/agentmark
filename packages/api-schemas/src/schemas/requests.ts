import { z } from "zod";
import { TRACE_STATUS_VALUES } from "./constants";
import {
  PaginationParamsSchema,
  DateRangeParamsSchema,
  SortParamsSchema,
  listResponse,
} from "./common";

// ---------------------------------------------------------------------------
// Request schemas — `/v1/requests`
//
// A "request" is a single LLM-call record: a GENERATION-type trace with
// input/output, model, token counts, cost, and latency. (Other tools call
// this a "generation" or "run".) Cloud surfaces the same data through the
// dashboard's `/api/analytics/requests` route; this is the public REST
// shape exposed by the local dev server.
// ---------------------------------------------------------------------------

export const RequestsListParamsSchema = PaginationParamsSchema
  .merge(DateRangeParamsSchema)
  .merge(SortParamsSchema)
  .extend({
    // ISO 8601 datetime strings (format: date-time). Overrides the
    // shared DateRangeParamsSchema's plain-string typing.
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional(),
    // Filter to a single status. GENERATION spans are normalised to
    // OK / ERROR (UNSET collapses to OK in the wire form).
    status: z.enum(TRACE_STATUS_VALUES).optional(),
    // Filter by the user attributed to the request.
    user_id: z.string().optional(),
    // Filter by the model used (exact match on `Model`).
    model: z.string().optional(),
    // Default sort is newest-first; only `desc` is honoured today
    // (rows are ordered by timestamp).
    sort_order: z.enum(["asc", "desc"]).optional().default("desc"),
    // Advanced filter DSL — JSON-serialized `{field, operator, value}[]`,
    // same machinery as `/v1/traces?filter=`. Honoured by the cloud
    // ClickHouse backend; the local SQLite dev server ignores it.
    filter: z.string().optional(),
  });

// ---------------------------------------------------------------------------
// Response schemas (snake_case, matching actual API responses)
// ---------------------------------------------------------------------------

export const RequestResponseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  app_id: z.string(),
  cost: z.number(),
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  latency_ms: z.number(),
  model_used: z.string(),
  status: z.string(),
  input: z.string(),
  output: z.string().nullable(),
  ts: z.string().datetime(),
  user_id: z.string(),
  prompt_name: z.string(),
  trace_id: z.string(),
  status_message: z.string(),
  props: z.string(),
});

export const RequestsListResponseSchema = listResponse(RequestResponseSchema);

export type RequestsListParams = z.infer<typeof RequestsListParamsSchema>;
export type RequestResponse = z.infer<typeof RequestResponseSchema>;
export type RequestsListResponse = z.infer<typeof RequestsListResponseSchema>;
