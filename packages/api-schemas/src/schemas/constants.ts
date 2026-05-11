/**
 * Shared validation constants for the AgentMark API.
 *
 * These constants are the single source of truth for enum values, pagination limits,
 * and field whitelists used across the gateway (public API) and dashboard (internal API).
 * Both consumers import these values to ensure validation rules stay in sync.
 */

// ---------------------------------------------------------------------------
// Enum values
// ---------------------------------------------------------------------------

export const TRACE_STATUS_VALUES = ['OK', 'ERROR'] as const;
export type TraceStatusValue = typeof TRACE_STATUS_VALUES[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = typeof SORT_ORDERS[number];

export const DATE_RANGE_PRESETS = ['today', 'yesterday', '7d', '30d', '90d', 'custom'] as const;
export type DateRangePreset = typeof DATE_RANGE_PRESETS[number];

export const SCORE_RESOURCE_TYPES = ['trace', 'span'] as const;
export type ScoreResourceType = typeof SCORE_RESOURCE_TYPES[number];

export const SCORE_SOURCE_TYPES = ['eval', 'annotation'] as const;
export type ScoreSourceType = typeof SCORE_SOURCE_TYPES[number];

export const PERCENTILE_METRICS = ['latency', 'inputTokens', 'outputTokens', 'totalTokens'] as const;
export type PercentileMetric = typeof PERCENTILE_METRICS[number];

export const SCORE_TREND_INTERVALS = ['hour', 'day', 'week', 'month'] as const;
export type ScoreTrendInterval = typeof SCORE_TREND_INTERVALS[number];

// ---------------------------------------------------------------------------
// Pagination defaults
// ---------------------------------------------------------------------------

export const PAGINATION = {
  defaultLimit: 50,
  maxLimit: 1000,
  maxSessionsLimit: 500,
  defaultSessionsLimit: 50,
  maxExperimentsLimit: 100,
  defaultExperimentsLimit: 25,
} as const;

// ---------------------------------------------------------------------------
// Date range limits
// ---------------------------------------------------------------------------

export const MAX_DATE_RANGE_DAYS = 90;

// ---------------------------------------------------------------------------
// Sort field whitelists
// ---------------------------------------------------------------------------

export const ALLOWED_TRACE_SORT_FIELDS = ['name', 'status', 'latency', 'cost', 'tokens', 'start_time'] as const;
export type TraceSortField = typeof ALLOWED_TRACE_SORT_FIELDS[number];

export const ALLOWED_SESSION_SORT_FIELDS = ['name', 'start', 'end', 'trace_count', 'total_cost', 'total_tokens', 'latency_ms'] as const;
export type SessionSortField = typeof ALLOWED_SESSION_SORT_FIELDS[number];

// ---------------------------------------------------------------------------
// Analytics filter constants
// ---------------------------------------------------------------------------

export const FILTER_CONSTANTS = {
  maxCount: 10,
  maxValueLength: 500,
  minTextSearchLength: 2,

  allowedFields: [
    'model', 'model_used', 'user_id', 'user', 'status',
    'latency_ms', 'latency', 'input', 'output', 'props',
    'prompt_tokens', 'completion_tokens', 'cost',
    'prompt_name', 'trace_id', 'session_id', 'tags',
  ] as const,

  allowedOperators: [
    'equals', '=',
    'notEquals', 'not_equals', '!=',
    'contains', 'like',
    'startsWith', 'starts_with',
    'endsWith', 'ends_with',
    'notContains', 'not_contains',
    'lt', '<', 'lte', '<=',
    'gt', '>', 'gte', '>=',
    'exists', 'doesNotExist', 'does_not_exist',
  ] as const,
} as const;
