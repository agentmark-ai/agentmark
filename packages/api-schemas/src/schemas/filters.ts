import { z } from "zod";
import { PAGINATION, SORT_ORDERS } from "./constants";
import { itemResponse } from "./common";

// ---------------------------------------------------------------------------
// Structured JSON filters (v2 query mechanism)
//
// The JSON form of the `filter` string DSL: an array of leaf predicates and
// one-level OR-groups, combined with AND (conjunctive normal form). Both
// forms compile to the same internal `AnalyticsFilterNode[]` AST.
//
// These schemas validate SHAPE only. Semantic validity — which fields exist
// on a resource, which operators a field kind allows, value typing — is
// enforced by the gateway's filter validator against the same allowlist
// tables the string-DSL parser uses, so the two surfaces cannot drift.
// A semantically invalid filter is a 400, never silently dropped.
// ---------------------------------------------------------------------------

/**
 * Canonical operator names, matching the internal `AnalyticsFilter.operator`
 * vocabulary (NOT a new dialect). `in` / `notIn` / `between` are JSON-only —
 * the string DSL expresses membership via OR-groups instead.
 */
export const FILTER_OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
  "doesNotExist",
  "in",
  "notIn",
  "between",
] as const;

export const FilterOperatorSchema = z.enum(FILTER_OPERATORS);

/** Max values accepted in an `in` / `notIn` membership list. */
export const MAX_FILTER_IN_VALUES = 50;

/** Max leaf predicates per request — grouped or not (mirrors the DSL cap). */
export const MAX_FILTER_PREDICATES = 20;

/**
 * Leaf value. Numbers are accepted for ergonomics and normalized to strings
 * by the gateway before compilation (the SQL compiler's numeric paths parse
 * via `parseFloat`, string paths bind as ClickHouse String params).
 * `exists` / `doesNotExist` take no value.
 */
export const FilterValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z
    .array(z.union([z.string().max(500), z.number().finite()]))
    .max(MAX_FILTER_IN_VALUES),
]);

/**
 * One leaf predicate. `.strict()` so a malformed node carrying both `field`
 * and `or` keys (or any extra key) is rejected at the schema layer instead
 * of being mis-classified downstream.
 */
export const FilterLeafSchema = z
  .object({
    field: z.string().min(1).max(128),
    operator: FilterOperatorSchema,
    value: FilterValueSchema.optional(),
  })
  .strict();

/**
 * One-level OR-group: matches rows satisfying ANY member. Members are
 * leaves only — nesting is rejected here by shape, mirroring the
 * `AnalyticsFilterOrGroup` type and the DSL's no-nesting rule.
 *
 * No member cap at the shape layer ON PURPOSE: the semantic validator
 * enforces MAX_FILTER_PREDICATES across ALL leaves (grouped or not), so
 * every predicate-budget violation surfaces as the same `invalid_filter`
 * 400 — a shape-level cap here would make a 21-member group fail with a
 * generic validation error while 11+10 across two groups failed with
 * `invalid_filter`.
 */
export const FilterOrGroupSchema = z
  .object({
    or: z.array(FilterLeafSchema).min(1),
  })
  .strict();

/** A clause: leaf predicate or OR-group. The filter list ANDs clauses. */
export const FilterNodeSchema = z.union([FilterLeafSchema, FilterOrGroupSchema]);

export const SearchFiltersSchema = z
  .array(FilterNodeSchema)
  .max(MAX_FILTER_PREDICATES);

export type FilterLeaf = z.infer<typeof FilterLeafSchema>;
export type FilterNode = z.infer<typeof FilterNodeSchema>;

// ---------------------------------------------------------------------------
// Search request bodies (POST /v1/{traces|spans|scores}/search)
//
// Body pagination uses plain numbers (no z.coerce — JSON carries real
// numbers, unlike query strings). Bounds mirror the GET endpoints.
// ---------------------------------------------------------------------------

const SearchPaginationFields = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(PAGINATION.maxLimit)
    .default(PAGINATION.defaultLimit),
  offset: z.number().int().min(0).default(0),
};

const SearchDateRangeFields = {
  // ISO 8601. Search endpoints apply a default lookback window when
  // unset and enforce a maximum window — see the route handlers.
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
};

export const TracesSearchBodySchema = z
  .object({
    filters: SearchFiltersSchema.optional(),
    ...SearchPaginationFields,
    ...SearchDateRangeFields,
    sort_by: z.string().optional(),
    sort_order: z.enum(SORT_ORDERS).optional(),
  })
  .strict();

export const SpansSearchBodySchema = z
  .object({
    filters: SearchFiltersSchema.optional(),
    ...SearchPaginationFields,
    ...SearchDateRangeFields,
  })
  .strict();

export const ScoresSearchBodySchema = z
  .object({
    filters: SearchFiltersSchema.optional(),
    ...SearchPaginationFields,
    ...SearchDateRangeFields,
  })
  .strict();

// ---------------------------------------------------------------------------
// Filter-schema discovery (GET /v1/filter-schema)
//
// Machine-readable description of the filterable surface, generated from
// the gateway's allowlist tables (single source of truth — cannot drift
// from what the validator accepts). Exists so agents and SDKs can build
// valid filters without trial-and-error 400s.
// ---------------------------------------------------------------------------

export const FilterFieldDescriptorSchema = z.object({
  /** Field name as used in `filters[].field` (e.g. `model`, `latency_ms`). */
  name: z.string(),
  /** Value kind: string | numeric | status | tags | datetime. */
  kind: z.string(),
  /** Operators valid for this field, in canonical names. */
  operators: z.array(z.string()),
});

export const FilterDynamicFieldDescriptorSchema = z.object({
  /** Field name pattern (e.g. `metadata.<key>`, `score__<name>`). */
  pattern: z.string(),
  /** Regex the dynamic segment must match. */
  key_pattern: z.string(),
  kind: z.string(),
  operators: z.array(z.string()),
});

export const FilterResourceSchemaSchema = z.object({
  fields: z.array(FilterFieldDescriptorSchema),
  dynamic_fields: z.array(FilterDynamicFieldDescriptorSchema),
  /** Hard caps enforced per request. */
  limits: z.object({
    max_predicates: z.number().int(),
    max_in_values: z.number().int(),
  }),
});

export const FilterSchemaResponseSchema = itemResponse(
  z.object({
    resources: z.object({
      traces: FilterResourceSchemaSchema,
      spans: FilterResourceSchemaSchema,
      scores: FilterResourceSchemaSchema,
    }),
  }),
);
