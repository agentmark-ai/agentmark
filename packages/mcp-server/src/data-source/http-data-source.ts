import type {
  DataSource,
  TraceListItem,
  TraceData,
  SpanData,
  ListTracesOptions,
  GetTraceOptions,
  TraceResult,
  PaginatedResult,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Raw trace data from API responses
 */
interface ApiTraceItem {
  id: string;
  name?: string;
  status?: string;
  latency?: number;
  cost?: number;
  tokens?: number;
  start?: number;
  end?: number;
  dataset_run_id?: string;
  dataset_path?: string;
  status_message?: string;
  data?: {
    id?: string;
    name?: string;
    status?: string;
    latency?: number;
    cost?: number;
    tokens?: number;
    start?: number;
    end?: number;
    status_message?: string;
  };
  spans?: SpanData[];
}

interface ApiTracesResponse {
  traces: ApiTraceItem[];
}

interface ApiTraceResponse {
  trace: ApiTraceItem | null;
}

/**
 * HTTP data source that connects to the AgentMark API server (local or cloud)
 */
export class HttpDataSource implements DataSource {
  constructor(
    private baseUrl: string = 'http://localhost:9418',
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
    private apiKey?: string
  ) {}

  private async fetch<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    // Build headers - add auth if API key is present
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `API request failed: ${response.status}`);
      }

      return response.json();
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${this.timeoutMs}ms: ${endpoint}`);
        }
        // Graceful degradation - provide clear error messages
        const cause = (error as Error & { cause?: { code?: string } }).cause;
        if (cause?.code === 'ECONNREFUSED') {
          throw new Error(`Connection failed: Unable to connect to ${this.baseUrl}. Is the AgentMark server running?`);
        }
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Map raw API trace item to TraceListItem
   */
  private mapToTraceListItem(t: ApiTraceItem, useDataField = false): TraceListItem {
    if (useDataField) {
      // Session traces come in full format with data field
      return {
        id: t.id || t.data?.id || '',
        name: t.name || t.data?.name || '',
        status: t.data?.status || '0',
        latency: t.data?.latency || 0,
        cost: t.data?.cost || 0,
        tokens: t.data?.tokens || 0,
        start: t.data?.start || 0,
        end: t.data?.end || 0,
        statusMessage: t.data?.status_message,
      };
    }
    return {
      id: t.id,
      name: t.name || '',
      status: t.status || '0',
      latency: t.latency || 0,
      cost: t.cost || 0,
      tokens: t.tokens || 0,
      start: t.start || 0,
      end: t.end || 0,
      datasetRunId: t.dataset_run_id,
      datasetPath: t.dataset_path,
      statusMessage: t.status_message,
    };
  }

  async listTraces(options?: ListTracesOptions): Promise<PaginatedResult<TraceListItem>> {
    const { limit = DEFAULT_LIMIT, cursor } = options || {};
    const effectiveLimit = Math.min(limit, MAX_LIMIT);

    // Decode cursor for pagination offset
    let offset = 0;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
        offset = decoded.offset || 0;
      } catch {
        // Invalid cursor, start from beginning
        offset = 0;
      }
    }

    let allTraces: TraceListItem[];

    if (options?.sessionId) {
      // Use session-specific endpoint
      const result = await this.fetch<ApiTracesResponse>(
        `/v1/sessions/${encodeURIComponent(options.sessionId)}/traces`
      );
      // Session traces come in full format, extract summary
      allTraces = result.traces.map((t) => this.mapToTraceListItem(t, true));
    } else if (options?.datasetRunId) {
      // Use run-specific endpoint
      const result = await this.fetch<ApiTracesResponse>(
        `/v1/runs/${encodeURIComponent(options.datasetRunId)}/traces`
      );
      allTraces = result.traces.map((t) => this.mapToTraceListItem(t));
    } else {
      // Use general traces endpoint
      const result = await this.fetch<ApiTracesResponse>('/v1/traces');
      allTraces = result.traces.map((t) => this.mapToTraceListItem(t));
    }

    // Apply client-side pagination (API doesn't support limit/offset for traces)
    const paginatedTraces = allTraces.slice(offset, offset + effectiveLimit);
    const hasMore = offset + effectiveLimit < allTraces.length;

    // Generate next cursor if there are more results
    let nextCursor: string | undefined;
    if (hasMore) {
      nextCursor = Buffer.from(
        JSON.stringify({ offset: offset + effectiveLimit })
      ).toString('base64');
    }

    return {
      items: paginatedTraces,
      cursor: nextCursor,
      hasMore,
    };
  }

  async getTrace(traceId: string, options?: GetTraceOptions): Promise<TraceResult | null> {
    try {
      // Fetch trace data
      const traceResult = await this.fetch<ApiTraceResponse>(
        `/v1/traces/${encodeURIComponent(traceId)}`
      );

      if (!traceResult.trace) {
        return null;
      }

      const t = traceResult.trace;
      const traceData: TraceData = {
        id: t.id,
        name: t.name || '',
        spans: t.spans || [],
        data: {
          id: t.data?.id || t.id,
          name: t.data?.name || t.name || '',
          status: t.data?.status || '0',
          latency: t.data?.latency || 0,
          cost: t.data?.cost || 0,
          tokens: t.data?.tokens || 0,
          start: t.data?.start || 0,
          end: t.data?.end || 0,
          status_message: t.data?.status_message,
        },
      };

      // Fetch filtered/paginated spans
      const spans = await this.fetchSpans(traceId, options);

      return {
        trace: traceData,
        spans,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        // Handle not found errors gracefully
        if (error.message?.includes('404') || error.message?.includes('not found')) {
          return null;
        }
        // Handle connection errors gracefully for getTrace
        const cause = (error as Error & { cause?: { code?: string } }).cause;
        if (cause?.code === 'ECONNREFUSED') {
          throw new Error(`Connection failed: Unable to connect to ${this.baseUrl}. Is the AgentMark server running?`);
        }
      }
      throw error;
    }
  }

  /**
   * Fetch spans with filtering and pagination
   * @internal
   */
  private async fetchSpans(traceId: string, options?: GetTraceOptions): Promise<PaginatedResult<SpanData>> {
    const { filters = [], limit = DEFAULT_LIMIT, cursor } = options || {};
    const effectiveLimit = Math.min(limit, MAX_LIMIT);

    // Decode cursor for pagination offset
    let offset = 0;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
        offset = decoded.offset || 0;
      } catch {
        // Invalid cursor, start from beginning
        offset = 0;
      }
    }

    // Build query params for server-side filtering
    const params = new URLSearchParams();
    params.set('traceId', traceId);

    // Map filters to server-side query params
    for (const filter of filters) {
      if (filter.field === 'data.type' && filter.operator === 'eq') {
        params.set('type', String(filter.value));
      } else if (filter.field === 'status' && filter.operator === 'eq') {
        params.set('status', String(filter.value));
      } else if (filter.field === 'name' && filter.operator === 'contains') {
        params.set('name', String(filter.value));
      } else if (filter.field === 'data.model' && filter.operator === 'contains') {
        params.set('model', String(filter.value));
      } else if (filter.field === 'duration') {
        // Map duration filters to minDuration/maxDuration
        if (filter.operator === 'gt' || filter.operator === 'gte') {
          params.set('minDuration', String(filter.value));
        } else if (filter.operator === 'lt' || filter.operator === 'lte') {
          params.set('maxDuration', String(filter.value));
        } else {
          throw new Error(`Unsupported operator '${filter.operator}' for field 'duration'. Use gt, gte, lt, or lte.`);
        }
      } else {
        throw new Error(`Unsupported filter: field '${filter.field}' with operator '${filter.operator}'`);
      }
    }

    // Server-side pagination
    params.set('limit', String(effectiveLimit));
    params.set('offset', String(offset));

    const queryString = params.toString();
    const endpoint = `/v1/spans?${queryString}`;
    const result = await this.fetch<{ spans: SpanData[] }>(endpoint);

    const spans = result.spans;
    const hasMore = spans.length === effectiveLimit;

    // Generate next cursor if there are more results
    let nextCursor: string | undefined;
    if (hasMore) {
      nextCursor = Buffer.from(
        JSON.stringify({ offset: offset + effectiveLimit })
      ).toString('base64');
    }

    return {
      items: spans,
      cursor: nextCursor,
      hasMore,
    };
  }
}
