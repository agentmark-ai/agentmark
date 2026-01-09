/**
 * Trace list item - summary info returned by list_traces
 */
export interface TraceListItem {
  id: string;
  name: string;
  status: string;
  latency: number;
  cost: number;
  tokens: number;
  start: number;
  end: number;
  datasetRunId?: string;
  datasetPath?: string;
  statusMessage?: string;
}

/**
 * Span data object containing detailed span information
 */
export interface SpanDataDetails {
  type?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cost?: number;
  input?: string;
  output?: string;
  outputObject?: string;
  toolCalls?: string;
  finishReason?: string;
  settings?: string;
  sessionId?: string;
  sessionName?: string;
  userId?: string;
  traceName?: string;
  promptName?: string;
  props?: string;
  attributes?: string;
  statusMessage?: string;
  status?: string;
  spanKind?: string;
  serviceName?: string;
  duration?: number;
  metadata?: Record<string, string>;
}

/**
 * Span data returned by get_spans
 */
export interface SpanData {
  id: string;
  name: string;
  duration: number;
  parentId?: string;
  timestamp: number;
  traceId: string;
  status: string;
  data: SpanDataDetails;
}

/**
 * Full trace data returned by get_trace
 */
export interface TraceData {
  id: string;
  name: string;
  spans: SpanData[];
  data: {
    id: string;
    name: string;
    status: string;
    latency: number;
    cost: number;
    tokens: number;
    start: number;
    end: number;
    status_message?: string;
  };
}

/**
 * Options for listing traces
 */
export interface ListTracesOptions {
  limit?: number;
  sessionId?: string;
  datasetRunId?: string;
}

/**
 * Comparison operators for span filters
 */
export type ComparisonOperator = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';

/**
 * Filter for span queries
 */
export interface SpanFilter {
  field: string;
  operator: ComparisonOperator;
  value: string | number;
}

/**
 * Options for getting spans with filtering and pagination
 * traceId is optional - when omitted, searches across all traces
 */
export interface GetSpansOptions {
  traceId?: string;
  filters?: SpanFilter[];
  limit?: number;
  cursor?: string;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
}

/**
 * Error codes for structured error responses
 */
export type ErrorCode =
  | 'CONNECTION_FAILED'
  | 'INVALID_QUERY'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'PARTIAL_FAILURE';

/**
 * Structured error response for MCP tools
 */
export interface ErrorResponse {
  error: string;
  code: ErrorCode;
  details?: Record<string, unknown>;
}

/**
 * Data source interface - abstraction for local or cloud backends
 */
export interface DataSource {
  listTraces(options?: ListTracesOptions): Promise<TraceListItem[]>;
  getTrace(traceId: string): Promise<TraceData | null>;
  getSpans(options: GetSpansOptions): Promise<PaginatedResult<SpanData>>;
}
