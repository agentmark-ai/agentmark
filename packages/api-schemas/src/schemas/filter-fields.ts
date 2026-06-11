import { MAX_FILTER_IN_VALUES, MAX_FILTER_PREDICATES } from "./filters";

// ---------------------------------------------------------------------------
// Filterable-field allowlists — part of the public API contract.
//
// The single source of truth for which fields exist on each queryable
// resource (traces/spans share one set; scores have their own), which
// operators each field kind allows, and the dynamic-field patterns. Both
// query surfaces validate against these tables:
//   - the `filter` string DSL on GET /v1/traces and GET /v1/spans
//   - the structured JSON filters on POST /v1/{traces|spans|scores}/search
// and GET /v1/filter-schema serves them verbatim via
// `buildFilterSchemaPayload`, so what the API advertises, what it accepts,
// and what this package types are by construction the same set.
// ---------------------------------------------------------------------------

/**
 * Canonical operator names as emitted into `AnalyticsFilter.operator`.
 * `in` / `notIn` / `between` are JSON-only: the string DSL has no surface
 * syntax for them (membership is expressible as an OR-group).
 */
export type CanonicalOp =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists"
  | "doesNotExist"
  | "in"
  | "notIn"
  | "between";

/** Operators that take no value. */
export const VALUELESS_OPS: ReadonlySet<CanonicalOp> = new Set(["exists", "doesNotExist"]);

/** Operators whose value is a list (`in`/`notIn`: 1..N, `between`: exactly 2). */
export const LIST_OPS: ReadonlySet<CanonicalOp> = new Set(["in", "notIn", "between"]);

export type FieldKind = "string" | "numeric" | "status" | "tags" | "metadata" | "score";

/**
 * Static (non-dynamic) trace/span fields and their kind. Canonical names
 * only — the documented contract. One field set serves BOTH /v1/traces and
 * /v1/spans: a filter expression composes across the two surfaces.
 */
export const STATIC_FIELDS: Record<string, FieldKind> = {
  model: "string",
  user_id: "string",
  session_id: "string",
  trace_id: "string",
  prompt_name: "string",
  input: "string",
  output: "string",
  props: "string",
  semantic_kind: "string",
  latency_ms: "numeric",
  cost: "numeric",
  prompt_tokens: "numeric",
  completion_tokens: "numeric",
  status: "status",
  tags: "tags",
};

/**
 * Operators parseable in the string DSL, per field kind. A (field, operator)
 * pair not listed here is a 400 on the GET surface.
 */
export const DSL_OPS_BY_KIND: Record<FieldKind, ReadonlySet<CanonicalOp>> = {
  string: new Set(["equals", "notEquals", "contains", "notContains", "startsWith", "endsWith"]),
  numeric: new Set(["equals", "notEquals", "gt", "gte", "lt", "lte"]),
  status: new Set(["equals"]),
  tags: new Set(["equals", "notEquals", "contains"]),
  metadata: new Set([
    "equals", "notEquals", "contains", "notContains", "startsWith", "endsWith", "exists", "doesNotExist",
  ]),
  score: new Set(["equals", "notEquals", "gt", "gte", "lt", "lte"]),
};

// Membership/range operators available ONLY in the JSON filter form.
const JSON_EXTRA_OPS_BY_KIND: Record<FieldKind, readonly CanonicalOp[]> = {
  string: ["in", "notIn"],
  numeric: ["in", "notIn", "between"],
  status: [],
  tags: ["in", "notIn"],
  metadata: ["in", "notIn"],
  score: ["between"],
};

function withJsonExtras(kind: FieldKind): ReadonlySet<CanonicalOp> {
  return new Set([...DSL_OPS_BY_KIND[kind], ...JSON_EXTRA_OPS_BY_KIND[kind]]);
}

/** Operators valid in the JSON filter form: the DSL set plus membership. */
export const JSON_OPS_BY_KIND: Record<FieldKind, ReadonlySet<CanonicalOp>> = {
  string: withJsonExtras("string"),
  numeric: withJsonExtras("numeric"),
  status: withJsonExtras("status"),
  tags: withJsonExtras("tags"),
  metadata: withJsonExtras("metadata"),
  score: withJsonExtras("score"),
};

/** Dynamic-field key constraints — what the SQL compilers will execute. */
export const METADATA_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
export const SCORE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/;
export const STATUS_VALUES: ReadonlySet<string> = new Set(["OK", "ERROR", "SUCCESS", "FAIL"]);

/**
 * Numeric values must be finite decimals/scientific notation — intentionally
 * stricter than `Number()` so validators agree with backends that read
 * numeric values via `parseFloat` (`Number('0x10')` is 16 but
 * `parseFloat('0x10')` is 0; `Number('Infinity')` is non-finite).
 */
export const NUMERIC_VALUE_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

// ---------------------------------------------------------------------------
// Scores resource (POST /v1/scores/search)
// ---------------------------------------------------------------------------

export type ScoresFieldKind = "string" | "numeric" | "datetime";

export const SCORES_STATIC_FIELDS: Record<string, ScoresFieldKind> = {
  name: "string",
  source: "string",
  user_id: "string",
  resource_id: "string",
  label: "string",
  score: "numeric",
  created_at: "datetime",
};

export const SCORES_JSON_OPS_BY_KIND: Record<ScoresFieldKind, ReadonlySet<CanonicalOp>> = {
  string: new Set(["equals", "notEquals", "contains", "notContains", "startsWith", "endsWith", "in", "notIn"]),
  numeric: new Set(["equals", "notEquals", "gt", "gte", "lt", "lte", "in", "notIn", "between"]),
  // Range comparisons only — point equality on a DateTime64(3) is a footgun.
  datetime: new Set(["gt", "gte", "lt", "lte", "between"]),
};

// ---------------------------------------------------------------------------
// Discovery payload (GET /v1/filter-schema)
// ---------------------------------------------------------------------------

/**
 * The `data` body of GET /v1/filter-schema, generated from the tables above
 * so any server (cloud gateway, local CLI dev server) serves the same truth.
 */
export function buildFilterSchemaPayload() {
  const limits = {
    max_predicates: MAX_FILTER_PREDICATES,
    max_in_values: MAX_FILTER_IN_VALUES,
  };

  const traceFields = Object.entries(STATIC_FIELDS).map(([name, kind]) => ({
    name,
    kind,
    operators: [...JSON_OPS_BY_KIND[kind]],
  }));

  const traceDynamicFields = [
    {
      pattern: "metadata.<key>",
      key_pattern: METADATA_KEY_RE.source,
      kind: "metadata",
      operators: [...JSON_OPS_BY_KIND.metadata],
    },
    {
      pattern: "score__<name>",
      key_pattern: SCORE_NAME_RE.source,
      kind: "score",
      operators: [...JSON_OPS_BY_KIND.score],
    },
  ];

  // Traces and spans share one field set — a filter composes across both.
  const traceSchema = {
    fields: traceFields,
    dynamic_fields: traceDynamicFields,
    limits,
  };

  return {
    resources: {
      traces: traceSchema,
      spans: traceSchema,
      scores: {
        fields: Object.entries(SCORES_STATIC_FIELDS).map(([name, kind]) => ({
          name,
          kind,
          operators: [...SCORES_JSON_OPS_BY_KIND[kind]],
        })),
        dynamic_fields: [],
        limits,
      },
    },
  };
}
