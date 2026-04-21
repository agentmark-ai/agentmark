/**
 * Analytics Service Types
 * Feature: 007-analytics-architecture-evaluation
 *
 * These types define the contract for the analytics service layer,
 * including API request/response shapes and internal data structures.
 */

// ============================================================================
// Branded Types
// ============================================================================

declare const __brand: unique symbol;
export type VerifiedAppId = string & { readonly [__brand]: 'VerifiedAppId' };

// Re-import TenantContext for the IAnalyticsService interface
import type { TenantContext } from './tenant-context';

// ============================================================================
// Common Types
// ============================================================================

/**
 * Date range for analytics queries.
 * Supports preset ranges or custom date selection.
 */
export interface DateRange {
  start: string; // ISO date string (YYYY-MM-DD)
  end: string; // ISO date string (YYYY-MM-DD)
}

/**
 * Preset date range values for quick selection.
 */
export type DateRangePreset = 'today' | '7d' | '30d' | '90d' | 'custom';

/**
 * Standard pagination parameters.
 */
export interface PaginationParams {
  limit: number;
  offset: number;
}

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Summary metrics for the dashboard header.
 * Aggregated from dashboard_hourly_mv materialized view.
 */
export interface MetricsSummary {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
  uniqueUsers: number;
}

/**
 * Time series data point for dashboard charts.
 * Hourly granularity from dashboard_hourly_mv.
 */
export interface TimeSeriesPoint {
  date: string; // ISO date string
  hour: number; // 0-23
  requests: number;
  successes: number;
  errors: number;
  cost: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
  uniqueUsers: number;
}

/**
 * Complete metrics response including summary and time series.
 */
export interface MetricsResponse {
  summary: MetricsSummary;
  timeSeries: TimeSeriesPoint[];
}

// ============================================================================
// Model Stats Types
// ============================================================================

/**
 * Statistics for a single model.
 * Aggregated from model_stats_mv materialized view.
 */
export interface ModelStats {
  model: string;
  requests: number;
  cost: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
  successRate: number;
}

/**
 * Response for top models query.
 */
export interface ModelStatsResponse {
  models: ModelStats[];
}

/**
 * A single ranking item for dimension-grouped queries.
 * Used by getRankingData to return data grouped by any dimension
 * (model, user_id, metadata fields).
 */
export interface RankingDataItem {
  dimensionValue: string;
  requests: number;
  cost: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
  successRate: number;
}

/**
 * Response for dimension-grouped ranking queries.
 */
export interface RankingDataResponse {
  items: RankingDataItem[];
}

// ============================================================================
// Traces Types
// ============================================================================

// ============================================================================
// Saved Filter Config Types
// ============================================================================

/**
 * V1 saved filter config — search-only. Retained for backward compat.
 */
export interface SavedFilterConfigV1 {
  search?: string;
  searchField?: string;
}

/**
 * V2 saved filter config — supports all filter dimensions.
 */
export interface SavedFilterConfig {
  version: 2;
  filters?: AnalyticsFilter[];
  userId?: string;
  dateRange?: { preset?: string; start?: string; end?: string };
  sortBy?: { field: string; order: 'asc' | 'desc' };
}

/**
 * Type guard for v2 saved filter configs.
 */
export function isFilterConfigV2(
  config: SavedFilterConfigV1 | SavedFilterConfig | SavedViewConfig
): config is SavedFilterConfig {
  return 'version' in config && config.version === 2;
}

// ============================================================================
// Saved View Config Types (v3 — for Requests page saved views)
// ============================================================================

/**
 * Display mode for the requests page.
 */
export type RequestsDisplayMode = 'list' | 'aggregate';

/**
 * V3 saved view config — supports display mode, groupBy, and column visibility.
 * Used by the Requests page saved views system.
 */
export interface SavedViewConfig {
  version: 3;
  displayMode: RequestsDisplayMode;
  groupBy?: string;
  filters?: AnalyticsFilter[];
  dateRange?: { preset?: string; start?: string; end?: string };
  sortBy?: { field: string; order: 'asc' | 'desc' };
  columns?: Array<{ field: string; visible: boolean }>;
}

/**
 * Type guard for v3 saved view configs.
 */
export function isViewConfigV3(
  config: SavedFilterConfigV1 | SavedFilterConfig | SavedViewConfig
): config is SavedViewConfig {
  return 'version' in config && config.version === 3;
}

// ============================================================================
// Aggregate Requests Types
// ============================================================================

/**
 * A single row in the aggregate requests table.
 * Groups requests by a dimension (model, user_id, metadata key).
 */
export interface AggregateRequestsRow {
  dimensionValue: string;
  requests: number;
  cost: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
  successRate: number;
}

/**
 * Paginated response for aggregate requests.
 */
export interface AggregateRequestsResponse {
  items: AggregateRequestsRow[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Parameters for aggregate requests query.
 */
export interface AggregateRequestsParams extends PaginationParams {
  dimension: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: AnalyticsFilter[];
  startDate?: string;
  endDate?: string;
}

/**
 * Parameters for listing traces.
 */
export interface TracesParams extends PaginationParams {
  model?: string;
  userId?: string;
  status?: 'OK' | 'ERROR';
  startDate?: string;
  endDate?: string;
  datasetRunId?: string;
  filters?: AnalyticsFilter[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Summary of a trace for list views.
 */
export interface TraceSummary {
  id: string;
  name: string;
  status: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  latencyMs: number;
  cost: number;
  tokens: number;
  spanCount: number;
  tags?: string[];
}

/**
 * Paginated response for trace listing.
 */
export interface TracesResponse {
  traces: TraceSummary[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Individual span within a trace.
 * Includes all available fields from ClickHouse for trace inspection.
 */
export interface Span {
  id: string;
  traceId: string;
  parentId: string | null;
  name: string;
  status: string;
  statusMessage: string;
  durationMs: number;
  timestamp: string; // ISO datetime
  type: 'SPAN' | 'GENERATION' | 'EVENT';
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  cost: number;
  input: string;
  output: string;
  outputObject: string | null;
  toolCalls: string | null;
  finishReason: string | null;
  settings: string | null;
  reasoningTokens: number;
  metadata: Record<string, string>;
  props: string | null;
  spanKind: string;
  serviceName: string;
  promptName: string | null;
}

/**
 * I/O payload for a single span, fetched on demand.
 */
export interface SpanIO {
  input: string;
  output: string;
  outputObject: string | null;
  toolCalls: string | null;
}

/**
 * Complete trace detail with all spans.
 * spanScores is a map from span ID -> scores for that span,
 * populated by a parallel batch query against the scores table.
 */
export interface TraceDetail {
  id: string;
  name: string;
  status: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  latencyMs: number;
  cost: number;
  tokens: number;
  input?: string;
  output?: string;
  spans: Span[];
  /** Eval scores keyed by span ID, batch-fetched in parallel with spans. */
  spanScores?: Record<string, Score[]>;
  /** True when the span scores query failed; scores will be empty in that case. */
  spanScoresError?: boolean;
}

// ============================================================================
// Sessions Types
// ============================================================================

/**
 * Parameters for listing sessions.
 */
export interface SessionsParams extends PaginationParams {
  startDate?: string;
  endDate?: string;
  filters?: AnalyticsFilter[];
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Summary of a session for list views.
 */
export interface SessionSummary {
  id: string;
  name: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  traceCount: number;
  totalCost: number;
  totalTokens: number;
  latencyMs: number;
  tags?: string[];
}

/**
 * Paginated response for session listing.
 */
export interface SessionsResponse {
  sessions: SessionSummary[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// Percentiles Types
// ============================================================================

/**
 * Supported metrics for percentile calculations.
 */
export type PercentileMetric = 'latency' | 'inputTokens' | 'outputTokens' | 'totalTokens';

/**
 * Parameters for percentiles query.
 */
export interface PercentilesParams {
  range: DateRangePreset;
  startDate?: string;
  endDate?: string;
  metric: PercentileMetric;
}

/**
 * Percentile data point for time series.
 */
export interface PercentilePoint {
  timestamp: string; // ISO datetime (hourly)
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

/**
 * Response for percentiles query.
 */
export interface PercentilesResponse {
  metric: PercentileMetric;
  data: PercentilePoint[];
}

// ============================================================================
// Health Check Types
// ============================================================================

/**
 * Status of a dependency.
 */
export type DependencyStatus = 'up' | 'down';

/**
 * Health status of the analytics service.
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Health check response.
 */
export interface HealthResponse {
  status: HealthStatus;
  timestamp: string; // ISO datetime
  dependencies: {
    clickhouse: {
      status: DependencyStatus;
      latencyMs?: number;
      error?: string;
    };
  };
}

// ============================================================================
// Dataset Analytics Types
// ============================================================================

/**
 * Summary of a dataset run for list views.
 * Aggregates data from traces that are part of a dataset evaluation.
 */
export interface DatasetRunSummary {
  id: string;
  name: string;
  datasetPath: string;
  commitSha: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  itemCount: number;
  totalCost: number;
  totalTokens: number;
  avgLatencyMs: number;
  avgScore: number | null;
}

/**
 * Parameters for listing dataset runs.
 */
export interface DatasetRunParams extends Partial<PaginationParams> {
  startDate?: string;
  endDate?: string;
  datasetPath?: string;
}

/**
 * Paginated response for dataset runs listing.
 */
export interface DatasetRunsResponse {
  runs: DatasetRunSummary[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Summary of a single item within a dataset run.
 */
export interface DatasetItemSummary {
  id: string;
  traceId: string;
  name: string;
  expectedOutput: string;
  latencyMs: number;
  cost: number;
  tokens: number;
  score: number | null;
  status: string;
}

/**
 * Complete dataset run detail with all items.
 */
export interface DatasetRunDetail extends DatasetRunSummary {
  items: DatasetItemSummary[];
}

// ============================================================================
// Experiment Analytics Types
// ============================================================================

// Core experiment types are defined in the OSS package and re-exported here
// to maintain backward compatibility for consumers of this types file.
import type {
  ExperimentItemScore as _ExperimentItemScore,
  ExperimentSummary as _ExperimentSummary,
  ExperimentItemSummary as _ExperimentItemSummary,
  ExperimentDetail as _ExperimentDetail,
} from '@agentmark-ai/ui-components';

export type ExperimentItemScore = _ExperimentItemScore;
export type ExperimentSummary = _ExperimentSummary;
export type ExperimentItemSummary = _ExperimentItemSummary;
export type ExperimentDetail = _ExperimentDetail;

/**
 * Parameters for listing experiments.
 */
export interface ExperimentParams extends Partial<PaginationParams> {
  startDate?: string;
  endDate?: string;
  promptName?: string;
  datasetPath?: string;
}

/**
 * Paginated response for experiments listing.
 */
export interface ExperimentsResponse {
  experiments: ExperimentSummary[];
  total: number;
  limit: number;
  offset: number;
  filterOptions?: {
    promptNames: string[];
    datasetPaths: string[];
  };
}

// ============================================================================
// Score Tracking Types
// ============================================================================

/**
 * Score record from the scores table.
 * Scores can be attached to either traces or spans.
 */
export interface Score {
  id: string;
  resourceId: string;
  name: string;
  score: number;
  label: string;
  reason: string;
  source: 'eval' | 'annotation';
  userId?: string;
  createdAt: string; // ISO datetime
}

/**
 * Parameters for querying scores.
 */
export interface ScoresParams extends Partial<PaginationParams> {
  resourceId?: string;
  resourceType?: 'trace' | 'span';
  name?: string;
  source?: 'eval' | 'annotation';
  startDate?: string;
  endDate?: string;
}

/**
 * Paginated response for scores listing.
 */
export interface ScoresResponse {
  scores: Score[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Aggregated statistics for a score name.
 */
export interface ScoreAggregation {
  name: string;
  avgScore: number;
  count: number;
  minScore: number;
  maxScore: number;
}

/**
 * Response for score aggregations query.
 */
export interface ScoreAggregationsResponse {
  aggregations: ScoreAggregation[];
}

/**
 * Response for distinct score names query.
 */
export interface ScoreNamesResponse {
  names: string[];
}

// ============================================================================
// Score Analytics Types
// ============================================================================

/**
 * Detected score type based on data analysis.
 * - 'numeric': scores with varying float values, no labels
 * - 'categorical': scores with non-empty string labels (not just true/false)
 * - 'boolean': scores with labels 'true' and/or 'false' only
 */
export type ScoreType = 'numeric' | 'categorical' | 'boolean';

/**
 * A single histogram bucket for numeric score distribution.
 */
export interface ScoreHistogramBucket {
  bucket: number;
  count: number;
}

/**
 * A single category count for categorical/boolean score distribution.
 */
export interface ScoreCategoryCount {
  label: string;
  count: number;
}

/**
 * Response for score histogram/distribution query.
 */
export interface ScoreHistogramResponse {
  name: string;
  type: ScoreType;
  buckets: ScoreHistogramBucket[];
  categories: ScoreCategoryCount[];
}

/**
 * A single data point in a score trend time series.
 */
export interface ScoreTrendPoint {
  timestamp: string;
  avgScore: number;
  count: number;
}

/**
 * Valid trend interval values.
 */
export type ScoreTrendInterval = 'hour' | 'day' | 'week' | 'month';

/**
 * Response for score trend query.
 */
export interface ScoreTrendResponse {
  name: string;
  interval: ScoreTrendInterval;
  points: ScoreTrendPoint[];
}

/**
 * A cell in the confusion matrix for score comparison.
 */
export interface ScoreComparisonCell {
  labelA: string;
  labelB: string;
  count: number;
}

/**
 * Response for score comparison (confusion matrix) query.
 */
export interface ScoreComparisonResponse {
  nameA: string;
  nameB: string;
  type: ScoreType;
  matrix: ScoreComparisonCell[];
  totalMatched: number;
  totalA: number;
  totalB: number;
}

/**
 * A single point in the scatter plot (paired numeric scores).
 */
export interface ScoreScatterPoint {
  scoreA: number;
  scoreB: number;
}

/**
 * Response for numeric score scatter plot query.
 */
export interface ScoreScatterResponse {
  nameA: string;
  nameB: string;
  points: ScoreScatterPoint[];
  totalMatched: number;
  totalA: number;
  totalB: number;
}

// ============================================================================
// Analytics Filter Types (for dashboard filters)
// ============================================================================

/**
 * Filter for analytics queries from the dashboard.
 * Matches the format used by the filter context.
 */
export interface AnalyticsFilter {
  field: string;
  operator: string;
  value: string | string[];
}

/**
 * Supported filter fields for metrics queries.
 */
export type MetricsFilterField = 'model' | 'user_id' | 'status';

/**
 * Validated filter for metrics queries.
 * Ensures only supported fields are used.
 */
export interface ValidatedMetricsFilter {
  field: MetricsFilterField;
  operator: 'equals' | 'notEquals' | 'contains';
  value: string;
}

// ============================================================================
// Advanced Filtering Types
// ============================================================================

/**
 * String comparison operators for filtering.
 */
export type StringFilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith';

/**
 * Number comparison operators for filtering.
 */
export type NumberFilterOperator =
  | 'equals'
  | 'notEquals'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte';

/**
 * Combined filter operator type.
 */
export type FilterOperator = StringFilterOperator | NumberFilterOperator;

/**
 * Filter condition for a string field.
 */
export interface StringFilter {
  operator: StringFilterOperator;
  value: string;
}

/**
 * Filter condition for a number field.
 */
export interface NumberFilter {
  operator: NumberFilterOperator;
  value: number;
}

/**
 * Extended trace parameters with advanced filtering support.
 */
export interface AdvancedTracesParams extends TracesParams {
  modelFilter?: StringFilter;
  userIdFilter?: StringFilter;
  latencyFilter?: NumberFilter;
  costFilter?: NumberFilter;
}

// ============================================================================
// Extended Metrics Summary
// ============================================================================

/**
 * Extended metrics summary with per-request averages.
 * Provides additional computed metrics for dashboard display.
 */
export interface ExtendedMetricsSummary extends MetricsSummary {
  avgCostPerRequest: number;
  avgInputTokensPerRequest: number;
  avgOutputTokensPerRequest: number;
  avgTotalTokensPerRequest: number;
  modelCount: number;
}

/**
 * Extended metrics response with per-request averages.
 */
export interface ExtendedMetricsResponse {
  summary: ExtendedMetricsSummary;
  timeSeries: TimeSeriesPoint[];
}


// ============================================================================
// Filter Column & Sort Types (for filter popover UI)
// ============================================================================

/**
 * Filter column definition for the filter popover UI.
 */
export interface FilterColumn {
  field: string;
  label: string;
  type: 'string' | 'number' | 'enum';
  operators: string[];
  enumValues?: string[];
}

/**
 * Sort configuration.
 */
export interface SortConfig {
  field: string;
  order: 'asc' | 'desc';
}

/**
 * Date range configuration for saved views.
 */
export interface DateRangeConfig {
  preset: 'today' | '7d' | '30d' | '90d' | 'custom';
  startDate?: string;
  endDate?: string;
}

// ============================================================================
// Trace Filter Config (v4 — for Traces and Sessions page saved views)
// ============================================================================

/**
 * V4 saved view config — supports traces and sessions pages.
 * Used by the Traces/Sessions page saved views system.
 */
export interface TraceFilterConfig {
  version: 4;
  filters?: AnalyticsFilter[];
  dateRange?: DateRangeConfig;
  sortBy?: SortConfig;
  search?: string;
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Analytics service interface.
 * Defines the contract for analytics data access.
 *
 * SECURITY: All methods require TenantContext to ensure both tenantId
 * and appId are provided, enforcing tenant isolation at compile time.
 */
export interface IAnalyticsService {
  // Health
  checkConnectivity(): Promise<boolean>;

  // Core metrics
  getMetrics(ctx: TenantContext, dateRange: DateRange, filters?: AnalyticsFilter[]): Promise<MetricsResponse>;
  getExtendedMetrics(ctx: TenantContext, dateRange: DateRange): Promise<ExtendedMetricsResponse>;
  getModelStats(ctx: TenantContext, dateRange: DateRange, limit?: number, filters?: AnalyticsFilter[]): Promise<ModelStatsResponse>;
  getTraces(ctx: TenantContext, params: TracesParams): Promise<TracesResponse>;
  getTraceDetail(ctx: TenantContext, traceId: string): Promise<TraceDetail | null>;
  getTraceDetailLightweight(ctx: TenantContext, traceId: string): Promise<TraceDetail | null>;
  getSpanIO(ctx: TenantContext, traceId: string, spanId: string): Promise<SpanIO | null>;
  getSessions(ctx: TenantContext, params: SessionsParams): Promise<SessionsResponse>;
  getSessionTraces(ctx: TenantContext, sessionId: string): Promise<TraceDetail[]>;
  getPercentiles(ctx: TenantContext, params: PercentilesParams, filters?: AnalyticsFilter[]): Promise<PercentilesResponse>;

  // Dataset analytics
  getDatasetRuns(ctx: TenantContext, params: DatasetRunParams): Promise<DatasetRunsResponse>;
  getDatasetRunDetail(ctx: TenantContext, runId: string): Promise<DatasetRunDetail | null>;

  // Experiment analytics
  getExperiments(ctx: TenantContext, params: ExperimentParams): Promise<ExperimentsResponse>;
  getExperimentDetail(ctx: TenantContext, experimentId: string): Promise<ExperimentDetail | null>;

  // Score tracking
  getScores(ctx: TenantContext, params: ScoresParams): Promise<ScoresResponse>;
  getScoresBySpanIds(ctx: TenantContext, spanIds: string[]): Promise<Record<string, Score[]>>;
  getScoreAggregations(ctx: TenantContext, dateRange: DateRange): Promise<ScoreAggregationsResponse>;
  getDistinctScoreNames(ctx: TenantContext): Promise<ScoreNamesResponse>;
  detectScoreType(ctx: TenantContext, name: string): Promise<ScoreType>;
  getScoreHistogram(ctx: TenantContext, name: string, dateRange: DateRange, source?: string): Promise<ScoreHistogramResponse>;
  getScoreTrend(ctx: TenantContext, name: string, interval: ScoreTrendInterval, dateRange: DateRange, source?: string): Promise<ScoreTrendResponse>;
  getScoreComparison(ctx: TenantContext, nameA: string, nameB: string, dateRange: DateRange, source?: string): Promise<ScoreComparisonResponse>;
  getScoreScatter(ctx: TenantContext, nameA: string, nameB: string, dateRange: DateRange, source?: string): Promise<ScoreScatterResponse>;
  getDistinctMetadataKeys(ctx: TenantContext): Promise<string[]>;

  // Prompt logs
  getPromptLogs(ctx: TenantContext, params: PromptLogsParams): Promise<PromptLogsResponse>;

  // Dimension-grouped ranking data (for widget groupBy)
  getRankingData(ctx: TenantContext, dateRange: DateRange, dimension: string, limit?: number, filters?: AnalyticsFilter[]): Promise<RankingDataResponse>;

  // Aggregate requests (paginated ranking with sort)
  getAggregateRequests(ctx: TenantContext, params: AggregateRequestsParams): Promise<AggregateRequestsResponse>;

  // Span kind breakdown
  getSpanKindBreakdown(ctx: TenantContext, dateRange: { startDate: string; endDate: string }): Promise<SpanKindBreakdownRecord[]>;

}

export interface SpanKindBreakdownRecord {
  kind: string;
  count: number;
  avgLatencyMs: number;
  totalCost: number;
  totalTokens: number;
}

// ============================================================================
// Prompt Logs Types
// ============================================================================

/**
 * Parameters for listing prompt logs.
 */
export interface PromptLogsParams extends PaginationParams {
  startDate?: string;
  endDate?: string;
  model?: string;
  userId?: string;
  status?: 'OK' | 'ERROR';
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: AnalyticsFilter[];
}

/**
 * Prompt log record (GENERATION type trace with input/output).
 */
export interface PromptLogRecord {
  id: string;
  tenantId: string;
  appId: string;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  modelUsed: string;
  status: string;
  input: string;
  output: string | null;
  ts: string; // ISO datetime
  userId: string;
  promptName: string;
  traceId: string;
  statusMessage: string;
  props: string;
}

/**
 * Paginated response for prompt logs listing.
 */
export interface PromptLogsResponse {
  logs: PromptLogRecord[];
  total: number;
  limit: number;
  offset: number;
}
