import { z } from "zod";
import { SORT_ORDERS, PAGINATION } from "./constants";

/**
 * Preprocessor that strips U+0000 (null byte) from a string input.
 *
 * Why: PostgreSQL's TEXT/VARCHAR rejects U+0000 with `ERROR: unsupported
 * Unicode escape sequence` — a libpq quirk, not a UTF-8 issue. JSON
 * permits `\u0000`, so clients (and Schemathesis) can produce strings
 * that parse fine but crash the INSERT. Industry convention (Stripe,
 * GitHub, Twilio, and HTML forms) is to strip silently at the edge, so
 * the DB never sees one.
 *
 * Use on every user-supplied string field that lands in a Postgres text
 * column. Pass the inner schema (with whatever `.min()/.max()` etc. the
 * field needs) as the second arg to `z.preprocess`:
 *
 *   name: z.preprocess(stripNullBytes, z.string().min(1).max(255)),
 *   description: z.preprocess(stripNullBytes, z.string().max(1000)).optional(),
 *
 * Non-string inputs pass through unchanged — the inner schema will
 * reject them normally with its usual type error.
 */
export const stripNullBytes = (val: unknown): unknown =>
  typeof val === "string" ? val.replace(/\u0000/g, "") : val;

// ---------------------------------------------------------------------------
// Request parameter schemas (snake_case for REST query params)
// ---------------------------------------------------------------------------

export const PaginationParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
  offset: z.coerce.number().int().min(0).default(0),
});

export const DateRangeParamsSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export const SortParamsSchema = z.object({
  sort_by: z.string().optional(),
  // No default — the pre-migration contract left this unset for /v1/traces
  // and defaulted to "desc" only for /v1/sessions. Per-route overrides
  // restore the precise default where main had one.
  sort_order: z.enum(SORT_ORDERS).optional(),
});

// ---------------------------------------------------------------------------
// Response schemas (snake_case for REST responses)
// ---------------------------------------------------------------------------

export const PaginationResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
});

/**
 * Canonical error envelope for /v1/* endpoints.
 *
 * Shape matches Stripe/OpenAI/Anthropic:
 *   { error: { code: 'trace_not_found', message: 'Trace not found', ...extras } }
 *
 * `.passthrough()` on the inner object keeps room for per-error extras
 * (e.g. `{ field: 'resource_id' }` for validation errors, `{ currentCount,
 * limit, upgradeUrl }` for billing 429s) without requiring a schema bump.
 */
export const ErrorResponseSchema = z.object({
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .passthrough(),
});

// ---------------------------------------------------------------------------
// Response envelopes (canonical shapes for /v1/* endpoints)
// ---------------------------------------------------------------------------

/**
 * Single-resource envelope: `{ data: T }`.
 *
 * The canonical 2xx response shape across the entire /v1/* surface. Use for:
 *   - Detail/show endpoints (`GET /v1/traces/:id` → `{ data: Trace }`)
 *   - Unpaginated collections (`itemResponse(z.array(T))` — the explicit
 *     array makes the non-pagination visible to anyone auditing the surface)
 *   - Mutation acks that need to return operation metadata — the HTTP status
 *     code conveys success; the body carries the useful payload. For example
 *     `POST /v1/traces` → 202 with `{ data: { requestId } }`.
 *
 * Mutations with nothing meaningful to return should emit `204 No Content`
 * (empty body) instead of any envelope.
 *
 * Rationale: RFC 9110 §15.3 defines 2xx as the success signal. A `success:
 * true` body field is redundant with the status line and creates a failure
 * mode when the two disagree. This matches the convention used by Stripe,
 * GitHub, JSON:API, the Google JSON Style Guide, and PostgREST.
 */
export const itemResponse = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: item });

/**
 * Paginated-list envelope: `{ data: T[], pagination }`.
 *
 * Every `list` endpoint that accepts `limit`/`offset` returns this shape.
 * If you find yourself wanting a list without pagination, either add
 * pagination to the endpoint or use `itemResponse(z.array(T))` to make
 * the decision explicit.
 */
export const listResponse = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    pagination: PaginationResponseSchema,
  });

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;
export type PaginationResponse = z.infer<typeof PaginationResponseSchema>;
export type DateRangeParams = z.infer<typeof DateRangeParamsSchema>;
export type SortParams = z.infer<typeof SortParamsSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
