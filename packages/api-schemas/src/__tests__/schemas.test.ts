import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  PaginationParamsSchema,
  PaginationResponseSchema,
  DateRangeParamsSchema,
  SortParamsSchema,
  ErrorResponseSchema,
  itemResponse,
  listResponse,
  ListPromptsQuerySchema,
  ListPromptsResponseSchema,
  TracesListParamsSchema,
  TraceResponseSchema,
  TraceDetailResponseSchema,
  TracesListResponseSchema,
  SpanInTraceSchema,
  SpansListParamsSchema,
  TraceSpanResponseSchema,
  TraceSpansListResponseSchema,
  SpanIOResponseSchema,
  SessionsListParamsSchema,
  SessionResponseSchema,
  SessionsListResponseSchema,
  SessionTraceResponseSchema,
  SessionTracesResponseSchema,
  CreateScoreBodySchema,
  ScoresListParamsSchema,
  ScoreResponseSchema,
  ScoresListResponseSchema,
  ScoreAggregationSchema,
  ScoreAggregationsResponseSchema,
  ScoreAggregationsParamsSchema,
  ScoreNamesResponseSchema,
  MetricsParamsSchema,
  MetricsSummarySchema,
  MetricsTimeSeriesPointSchema,
  MetricsResponseSchema,
  AnnotationQueuesListParamsSchema,
  RequestsListParamsSchema,
  RequestResponseSchema,
  RequestsListResponseSchema,
} from '../index';

// ---------------------------------------------------------------------------
// Common schemas
// ---------------------------------------------------------------------------

describe('PaginationParamsSchema', () => {
  it('should apply default limit of 50 and offset of 0', () => {
    const result = PaginationParamsSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it('should coerce string values to numbers', () => {
    const result = PaginationParamsSchema.parse({ limit: '25', offset: '10' });
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(10);
  });

  it('should accept limit at lower bound of 1', () => {
    const result = PaginationParamsSchema.parse({ limit: 1 });
    expect(result.limit).toBe(1);
  });

  it('should accept limit at upper bound of 1000', () => {
    const result = PaginationParamsSchema.parse({ limit: 1000 });
    expect(result.limit).toBe(1000);
  });

  it('should reject limit exceeding 1000', () => {
    expect(() => PaginationParamsSchema.parse({ limit: 1001 })).toThrow();
  });

  it('should reject limit of 0', () => {
    expect(() => PaginationParamsSchema.parse({ limit: 0 })).toThrow();
  });

  it('should reject negative limit', () => {
    expect(() => PaginationParamsSchema.parse({ limit: -1 })).toThrow();
  });

  it('should reject negative offset', () => {
    expect(() => PaginationParamsSchema.parse({ offset: -1 })).toThrow();
  });

  it('should reject non-integer limit', () => {
    expect(() => PaginationParamsSchema.parse({ limit: 10.5 })).toThrow();
  });

  it('should reject non-integer offset', () => {
    expect(() => PaginationParamsSchema.parse({ offset: 1.5 })).toThrow();
  });

  it('should accept offset of 0', () => {
    const result = PaginationParamsSchema.parse({ offset: 0 });
    expect(result.offset).toBe(0);
  });
});

describe('PaginationResponseSchema', () => {
  it('should parse valid pagination response', () => {
    const result = PaginationResponseSchema.parse({
      total: 200,
      limit: 50,
      offset: 0,
    });
    expect(result.total).toBe(200);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it('should reject when required fields are missing', () => {
    expect(() => PaginationResponseSchema.parse({ total: 1 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Response envelope helpers
// ---------------------------------------------------------------------------

describe('itemResponse', () => {
  const Schema = itemResponse(z.object({ id: z.string(), name: z.string() }));

  it('accepts a single resource wrapped in { data }', () => {
    expect(() => Schema.parse({ data: { id: '1', name: 'hello' } })).not.toThrow();
  });

  it('rejects when data is missing', () => {
    expect(() => Schema.parse({})).toThrow();
  });

  it('rejects when the resource fails inner validation', () => {
    expect(() => Schema.parse({ data: { id: '1' } })).toThrow();
  });

  it('supports array items via itemResponse(z.array(...))', () => {
    const ArrSchema = itemResponse(z.array(z.string()));
    expect(() => ArrSchema.parse({ data: ['a', 'b'] })).not.toThrow();
  });
});

describe('listResponse', () => {
  const Schema = listResponse(z.object({ id: z.string() }));

  it('accepts { data: [], pagination }', () => {
    const value = { data: [{ id: '1' }], pagination: { total: 1, limit: 10, offset: 0 } };
    expect(() => Schema.parse(value)).not.toThrow();
  });

  it('rejects when pagination is missing', () => {
    expect(() => Schema.parse({ data: [] })).toThrow();
  });

  it('rejects when data is not an array', () => {
    expect(() =>
      Schema.parse({ data: { id: '1' }, pagination: { total: 1, limit: 10, offset: 0 } }),
    ).toThrow();
  });
});

describe('DateRangeParamsSchema', () => {
  it('should accept empty object when both dates are optional', () => {
    const result = DateRangeParamsSchema.parse({});
    expect(result.start_date).toBeUndefined();
    expect(result.end_date).toBeUndefined();
  });

  it('should accept valid date strings', () => {
    const result = DateRangeParamsSchema.parse({
      start_date: '2026-01-01',
      end_date: '2026-01-31',
    });
    expect(result.start_date).toBe('2026-01-01');
    expect(result.end_date).toBe('2026-01-31');
  });

  it('should accept start_date without end_date', () => {
    const result = DateRangeParamsSchema.parse({
      start_date: '2026-01-01',
    });
    expect(result.start_date).toBe('2026-01-01');
    expect(result.end_date).toBeUndefined();
  });
});

describe('SortParamsSchema', () => {
  it('should leave sort_order undefined by default', () => {
    // Per-route overrides restore the exact default where main had one;
    // the shared schema no longer defaults sort_order to "desc" because
    // only /v1/sessions defaulted to "desc" in the pre-migration yaml
    // — other routes (e.g. /v1/traces) left it unset, and setting a
    // default here was flagged as a breaking change by oasdiff.
    const result = SortParamsSchema.parse({});
    expect(result.sort_order).toBeUndefined();
  });

  it('should accept asc sort order', () => {
    const result = SortParamsSchema.parse({ sort_order: 'asc' });
    expect(result.sort_order).toBe('asc');
  });

  it('should reject invalid sort order', () => {
    expect(() => SortParamsSchema.parse({ sort_order: 'random' })).toThrow();
  });

  it('should accept custom sort_by field', () => {
    const result = SortParamsSchema.parse({ sort_by: 'cost' });
    expect(result.sort_by).toBe('cost');
  });

  it('should leave sort_by undefined when not provided', () => {
    const result = SortParamsSchema.parse({});
    expect(result.sort_by).toBeUndefined();
  });
});

describe('ErrorResponseSchema', () => {
  it('should parse canonical error envelope with code + message', () => {
    const result = ErrorResponseSchema.parse({
      error: { code: 'trace_not_found', message: 'Trace not found' },
    });
    expect(result.error.code).toBe('trace_not_found');
    expect(result.error.message).toBe('Trace not found');
  });

  it('should accept extras alongside code + message via passthrough', () => {
    const result = ErrorResponseSchema.parse({
      error: { code: 'invalid_field_value', message: 'Invalid input', field: 'limit' },
    });
    // passthrough preserves the extra key on the parsed output
    expect((result.error as Record<string, unknown>).field).toBe('limit');
  });

  it('should reject flat-string error shape', () => {
    expect(() =>
      ErrorResponseSchema.parse({ error: 'not_found', message: 'Resource not found' }),
    ).toThrow();
  });

  it('should reject when inner error object is missing code or message', () => {
    expect(() =>
      ErrorResponseSchema.parse({ error: { message: 'Missing code field' } }),
    ).toThrow();
    expect(() =>
      ErrorResponseSchema.parse({ error: { code: 'missing_message' } }),
    ).toThrow();
  });

  it('should reject when top-level error field is missing', () => {
    expect(() =>
      ErrorResponseSchema.parse({ message: 'No error wrapper' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Traces schemas
// ---------------------------------------------------------------------------

describe('TracesListParamsSchema', () => {
  it('should inherit pagination defaults and leave sort_order unset', () => {
    const result = TracesListParamsSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
    // /v1/traces left sort_order unset in the pre-migration yaml — only
    // /v1/sessions defaulted to "desc".
    expect(result.sort_order).toBeUndefined();
  });

  it('should accept valid status enum values', () => {
    const ok = TracesListParamsSchema.parse({ status: 'OK' });
    expect(ok.status).toBe('OK');

    const err = TracesListParamsSchema.parse({ status: 'ERROR' });
    expect(err.status).toBe('ERROR');
  });

  it('should reject invalid status value', () => {
    expect(() =>
      TracesListParamsSchema.parse({ status: 'warning' }),
    ).toThrow();
  });

  it('should accept optional filter fields', () => {
    const result = TracesListParamsSchema.parse({
      user_id: 'user-123',
      model: 'gpt-4',
    });
    expect(result.user_id).toBe('user-123');
    expect(result.model).toBe('gpt-4');
  });
});

describe('TraceResponseSchema', () => {
  const validTrace = {
    id: 'trace-1',
    name: 'test-trace',
    status: 'OK',
    start: '2026-01-01T00:00:00Z',
    end: '2026-01-01T00:01:00Z',
    latency_ms: 60000,
    tokens: 500,
    cost: 0.05,
    span_count: 3,
    tags: ['production'],
  };

  it('should parse a complete valid trace', () => {
    const result = TraceResponseSchema.parse(validTrace);
    expect(result.id).toBe('trace-1');
    expect(result.tags).toEqual(['production']);
  });

  it('should accept trace without optional tags', () => {
    const { tags: _, ...noTags } = validTrace;
    const result = TraceResponseSchema.parse(noTags);
    expect(result.tags).toBeUndefined();
  });

  it('should reject when required field is missing', () => {
    const { id: _, ...missing } = validTrace;
    expect(() => TraceResponseSchema.parse(missing)).toThrow();
  });
});

describe('SpanInTraceSchema', () => {
  const validSpan = {
    id: 'span-1',
    trace_id: 'trace-1',
    parent_id: null,
    name: 'root-span',
    status: 'OK',
    duration_ms: 60000,
    timestamp: '2026-01-01T00:00:00Z',
    type: 'llm',
    model: 'gpt-4',
    input_tokens: 100,
    output_tokens: 400,
    tokens: 500,
    cost: 0.05,
  };

  it('should parse a valid span in trace', () => {
    const result = SpanInTraceSchema.parse(validSpan);
    expect(result.id).toBe('span-1');
    expect(result.trace_id).toBe('trace-1');
  });

  it('should accept nullable parent_id and model', () => {
    const result = SpanInTraceSchema.parse({ ...validSpan, parent_id: null, model: null });
    expect(result.parent_id).toBeNull();
    expect(result.model).toBeNull();
  });
});

describe('TraceDetailResponseSchema', () => {
  it('should parse trace detail with spans', () => {
    const detail = {
      data: {
        id: 'trace-1',
        name: 'test',
        status: 'OK',
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-01T00:01:00Z',
        latency_ms: 60000,
        cost: 0.05,
        tokens: 500,
        spans: [
          {
            id: 'span-1',
            trace_id: 'trace-1',
            parent_id: null,
            name: 'root-span',
            status: 'OK',
            duration_ms: 60000,
            timestamp: '2026-01-01T00:00:00Z',
            type: 'llm',
            model: 'gpt-4',
            input_tokens: 100,
            output_tokens: 400,
            tokens: 500,
            cost: 0.05,
          },
        ],
      },
    };

    const result = TraceDetailResponseSchema.parse(detail);
    expect(result.data.spans).toHaveLength(1);
    expect(result.data.spans[0]!.id).toBe('span-1');
  });
});

describe('TracesListResponseSchema', () => {
  it('should parse list with pagination', () => {
    const result = TracesListResponseSchema.parse({
      data: [],
      pagination: { total: 0, limit: 50, offset: 0 },
    });
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Spans schemas
// ---------------------------------------------------------------------------

describe('SpansListParamsSchema', () => {
  it('should default limit to 100 (spans-specific) and offset to 0', () => {
    // /v1/spans had a default limit of 100 in the pre-migration yaml,
    // distinct from the global PAGINATION.defaultLimit of 50. The schema
    // restores that per-route default explicitly.
    const result = SpansListParamsSchema.parse({});
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(0);
  });

  it('should accept valid type enum values', () => {
    const types = ['SPAN', 'GENERATION', 'EVENT'] as const;
    for (const type of types) {
      const result = SpansListParamsSchema.parse({ type });
      expect(result.type).toBe(type);
    }
  });

  it('should reject invalid type value', () => {
    expect(() => SpansListParamsSchema.parse({ type: 'unknown' })).toThrow();
  });
});

describe('TraceSpanResponseSchema', () => {
  const validSpan = {
    id: 'span-1',
    trace_id: 'trace-1',
    parent_id: null,
    name: 'llm-call',
    status: 'OK',
    status_message: '',
    duration_ms: 5000,
    timestamp: '2026-01-01T00:00:00Z',
    type: 'llm',
    model: 'gpt-4',
    input_tokens: 100,
    output_tokens: 200,
    tokens: 300,
    cost: 0.01,
    span_kind: 'INTERNAL',
    service_name: 'my-service',
    prompt_name: null,
    metadata: {},
  };

  it('should parse a complete valid trace span', () => {
    const result = TraceSpanResponseSchema.parse(validSpan);
    expect(result.id).toBe('span-1');
    expect(result.span_kind).toBe('INTERNAL');
  });

  it('should accept nullable parent_id, model, and prompt_name', () => {
    const result = TraceSpanResponseSchema.parse(validSpan);
    expect(result.parent_id).toBeNull();
    expect(result.prompt_name).toBeNull();
  });
});

describe('TraceSpansListResponseSchema', () => {
  it('should parse empty list', () => {
    const result = TraceSpansListResponseSchema.parse({ data: [] });
    expect(result.data).toEqual([]);
  });
});

describe('SpanIOResponseSchema', () => {
  it('should parse span IO data', () => {
    const result = SpanIOResponseSchema.parse({
      data: {
        input: 'Hello',
        output: 'World',
        output_object: null,
        tool_calls: null,
        metadata: { debug_screenshot_url: 'https://example.com/x' },
      },
    });
    expect(result.data.input).toBe('Hello');
    expect(result.data.output_object).toBeNull();
    expect(result.data.metadata).toEqual({ debug_screenshot_url: 'https://example.com/x' });
  });
});

// ---------------------------------------------------------------------------
// Sessions schemas
// ---------------------------------------------------------------------------

describe('SessionsListParamsSchema', () => {
  it('should inherit pagination and sort defaults', () => {
    const result = SessionsListParamsSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
    expect(result.sort_order).toBe('desc');
  });

  it('should accept date range (ISO 8601 datetimes) and search filters', () => {
    // /v1/sessions uses format: date-time per the pre-migration yaml.
    const result = SessionsListParamsSchema.parse({
      start_date: '2026-01-01T00:00:00Z',
      end_date: '2026-01-31T23:59:59Z',
      search: 'test-session',
    });
    expect(result.start_date).toBe('2026-01-01T00:00:00Z');
    expect(result.search).toBe('test-session');
  });
});

describe('SessionResponseSchema', () => {
  it('should parse a valid session', () => {
    const result = SessionResponseSchema.parse({
      id: 'sess-1',
      name: 'Session A',
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-01T01:00:00Z',
      trace_count: 5,
      total_cost: 1.5,
      total_tokens: 1000,
      latency_ms: 30000,
    });
    expect(result.id).toBe('sess-1');
    expect(result.trace_count).toBe(5);
  });

  it('should reject when required field is missing', () => {
    expect(() =>
      SessionResponseSchema.parse({ id: 'sess-1' }),
    ).toThrow();
  });
});

describe('SessionsListResponseSchema', () => {
  it('should parse list with pagination', () => {
    const result = SessionsListResponseSchema.parse({
      data: [],
      pagination: { total: 0, limit: 50, offset: 0 },
    });
    expect(result.data).toEqual([]);
  });
});

describe('SessionTraceResponseSchema', () => {
  it('should parse a session trace with spans', () => {
    const result = SessionTraceResponseSchema.parse({
      id: 'trace-1',
      name: 'test',
      status: 'OK',
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-01T00:01:00Z',
      latency_ms: 60000,
      cost: 0.05,
      tokens: 500,
      spans: [],
    });
    expect(result.id).toBe('trace-1');
    expect(result.spans).toEqual([]);
  });
});

describe('SessionTracesResponseSchema', () => {
  it('should parse list of session traces', () => {
    const result = SessionTracesResponseSchema.parse({ data: [] });
    expect(result.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Scores schemas
// ---------------------------------------------------------------------------

describe('CreateScoreBodySchema', () => {
  it('should parse valid score creation body', () => {
    const result = CreateScoreBodySchema.parse({
      resource_id: 'trace-123',
      name: 'accuracy',
      score: 0.95,
    });
    expect(result.resource_id).toBe('trace-123');
    expect(result.name).toBe('accuracy');
    expect(result.score).toBe(0.95);
    expect(result.source).toBe('api');
  });

  it('should apply default source of api', () => {
    const result = CreateScoreBodySchema.parse({
      resource_id: 'r1',
      name: 'n',
      score: 1,
    });
    expect(result.source).toBe('api');
  });

  it('should accept all source enum values', () => {
    for (const source of ['experiment', 'annotation', 'api'] as const) {
      const result = CreateScoreBodySchema.parse({
        resource_id: 'r1',
        name: 'n',
        score: 1,
        source,
      });
      expect(result.source).toBe(source);
    }
  });

  it('should reject invalid source value', () => {
    expect(() =>
      CreateScoreBodySchema.parse({
        resource_id: 'r1',
        name: 'n',
        score: 1,
        source: 'invalid',
      }),
    ).toThrow();
  });

  it('should reject empty resource_id', () => {
    expect(() =>
      CreateScoreBodySchema.parse({ resource_id: '', name: 'n', score: 1 }),
    ).toThrow();
  });

  it('should reject empty name', () => {
    expect(() =>
      CreateScoreBodySchema.parse({ resource_id: 'r1', name: '', score: 1 }),
    ).toThrow();
  });

  it('should reject missing score', () => {
    expect(() =>
      CreateScoreBodySchema.parse({ resource_id: 'r1', name: 'n' }),
    ).toThrow();
  });

  it('should reject non-numeric score', () => {
    expect(() =>
      CreateScoreBodySchema.parse({
        resource_id: 'r1',
        name: 'n',
        score: 'not-a-number',
      }),
    ).toThrow();
  });

  it('should accept optional label and reason', () => {
    const result = CreateScoreBodySchema.parse({
      resource_id: 'r1',
      name: 'accuracy',
      score: 0.9,
      label: 'good',
      reason: 'Correct answer',
    });
    expect(result.label).toBe('good');
    expect(result.reason).toBe('Correct answer');
  });

  it('should accept negative score values', () => {
    const result = CreateScoreBodySchema.parse({
      resource_id: 'r1',
      name: 'sentiment',
      score: -0.5,
    });
    expect(result.score).toBe(-0.5);
  });

  it('should accept zero as a valid score', () => {
    const result = CreateScoreBodySchema.parse({
      resource_id: 'r1',
      name: 'n',
      score: 0,
    });
    expect(result.score).toBe(0);
  });
});

describe('ScoresListParamsSchema', () => {
  it('should inherit pagination defaults', () => {
    const result = ScoresListParamsSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it('should accept source filter', () => {
    for (const source of ['experiment', 'annotation', 'api'] as const) {
      const result = ScoresListParamsSchema.parse({ source });
      expect(result.source).toBe(source);
    }
  });

  it('should reject invalid source filter', () => {
    expect(() => ScoresListParamsSchema.parse({ source: 'unknown' })).toThrow();
  });

  it('should accept optional resource_id and name filters', () => {
    const result = ScoresListParamsSchema.parse({
      resource_id: 'trace-1',
      name: 'accuracy',
    });
    expect(result.resource_id).toBe('trace-1');
    expect(result.name).toBe('accuracy');
  });

  it('should accept resource_type filter', () => {
    const result = ScoresListParamsSchema.parse({ resource_type: 'trace' });
    expect(result.resource_type).toBe('trace');
  });
});

describe('ScoreResponseSchema', () => {
  it('should parse a valid score response with uuid id', () => {
    // `id` is typed as uuid to match the pre-migration yaml — scores are
    // stored with UUID primary keys in ClickHouse.
    const id = '00000000-0000-4000-8000-000000000001';
    const result = ScoreResponseSchema.parse({
      id,
      resource_id: 'trace-1',
      name: 'accuracy',
      score: 0.95,
      label: 'good',
      source: 'eval',
      reason: 'Correct',
      created_at: '2026-01-01T00:00:00Z',
    });
    expect(result.id).toBe(id);
  });
});

describe('ScoresListResponseSchema', () => {
  it('should parse list with pagination', () => {
    const result = ScoresListResponseSchema.parse({
      data: [],
      pagination: { total: 0, limit: 50, offset: 0 },
    });
    expect(result.data).toEqual([]);
  });
});

describe('ScoreAggregationSchema', () => {
  it('should parse valid aggregation', () => {
    const result = ScoreAggregationSchema.parse({
      name: 'accuracy',
      avg_score: 0.85,
      count: 100,
      min_score: 0.1,
      max_score: 1.0,
    });
    expect(result.name).toBe('accuracy');
    expect(result.avg_score).toBe(0.85);
  });
});

describe('ScoreAggregationsParamsSchema', () => {
  it('should accept optional date range', () => {
    const result = ScoreAggregationsParamsSchema.parse({});
    expect(result.start_date).toBeUndefined();
    expect(result.end_date).toBeUndefined();
  });

  it('should accept date strings', () => {
    const result = ScoreAggregationsParamsSchema.parse({
      start_date: '2026-01-01',
      end_date: '2026-01-31',
    });
    expect(result.start_date).toBe('2026-01-01');
  });
});

describe('ScoreAggregationsResponseSchema', () => {
  it('should parse aggregation list', () => {
    const result = ScoreAggregationsResponseSchema.parse({ data: [] });
    expect(result.data).toEqual([]);
  });
});

describe('ScoreNamesResponseSchema', () => {
  it('should parse list of score names', () => {
    const result = ScoreNamesResponseSchema.parse({
      data: ['accuracy', 'relevance', 'safety'],
    });
    expect(result.data).toHaveLength(3);
    expect(result.data).toContain('accuracy');
  });
});

// ---------------------------------------------------------------------------
// Metrics schemas
// ---------------------------------------------------------------------------

describe('MetricsParamsSchema', () => {
  // /v1/metrics requires ISO 8601 datetime strings (format: date-time)
  // per the pre-migration yaml.
  const startDate = '2026-01-01T00:00:00Z';
  const endDate = '2026-01-31T23:59:59Z';

  it('should apply default extended of false', () => {
    const result = MetricsParamsSchema.parse({
      start_date: startDate,
      end_date: endDate,
    });
    expect(result.extended).toBe(false);
  });

  it('should coerce string boolean for extended', () => {
    const result = MetricsParamsSchema.parse({
      start_date: startDate,
      end_date: endDate,
      extended: 'true',
    });
    expect(result.extended).toBe(true);
  });

  it('should require start_date and end_date', () => {
    expect(() => MetricsParamsSchema.parse({})).toThrow();
  });
});

describe('MetricsSummarySchema', () => {
  it('should parse valid summary', () => {
    const result = MetricsSummarySchema.parse({
      total_requests: 100,
      success_count: 90,
      error_count: 10,
      total_cost: 5.0,
      total_tokens: 50000,
      input_tokens: 20000,
      output_tokens: 30000,
      avg_latency_ms: 250,
      unique_users: 15,
    });
    expect(result.total_requests).toBe(100);
    expect(result.avg_cost_per_request).toBeUndefined();
  });

  it('should accept extended fields', () => {
    const result = MetricsSummarySchema.parse({
      total_requests: 100,
      success_count: 90,
      error_count: 10,
      total_cost: 5.0,
      total_tokens: 50000,
      input_tokens: 20000,
      output_tokens: 30000,
      avg_latency_ms: 250,
      unique_users: 15,
      avg_cost_per_request: 0.05,
      avg_input_tokens_per_request: 200,
      avg_output_tokens_per_request: 300,
      avg_total_tokens_per_request: 500,
      model_count: 3,
    });
    expect(result.avg_cost_per_request).toBe(0.05);
    expect(result.model_count).toBe(3);
  });
});

describe('MetricsTimeSeriesPointSchema', () => {
  it('should parse a valid time series point', () => {
    const result = MetricsTimeSeriesPointSchema.parse({
      date: '2026-01-01',
      hour: 12,
      requests: 50,
      successes: 45,
      errors: 5,
      cost: 2.5,
      tokens: 25000,
      input_tokens: 10000,
      output_tokens: 15000,
      avg_latency_ms: 200,
      unique_users: 8,
    });
    expect(result.date).toBe('2026-01-01');
    expect(result.hour).toBe(12);
  });
});

describe('MetricsResponseSchema', () => {
  it('should parse valid metrics response', () => {
    const result = MetricsResponseSchema.parse({
      data: {
        summary: {
          total_requests: 100,
          success_count: 90,
          error_count: 10,
          total_cost: 5.0,
          total_tokens: 50000,
          input_tokens: 20000,
          output_tokens: 30000,
          avg_latency_ms: 250,
          unique_users: 15,
        },
        time_series: [],
      },
    });
    expect(result.data.summary.total_requests).toBe(100);
    expect(result.data.time_series).toEqual([]);
  });

  it('should reject when summary is missing', () => {
    expect(() => MetricsResponseSchema.parse({ data: { time_series: [] } })).toThrow();
  });

  it('should reject when time_series is missing', () => {
    expect(() =>
      MetricsResponseSchema.parse({
        data: {
          summary: {
            total_requests: 0,
            success_count: 0,
            error_count: 0,
            total_cost: 0,
            total_tokens: 0,
            input_tokens: 0,
            output_tokens: 0,
            avg_latency_ms: 0,
            unique_users: 0,
          },
        },
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Annotation queues schemas
// ---------------------------------------------------------------------------

describe('AnnotationQueuesListParamsSchema — assigned_to_me coercion', () => {
  // Regression: a previous version used `z.coerce.boolean()` which calls the
  // JS `Boolean()` constructor. `Boolean("false") === true`, so a caller
  // passing `?assigned_to_me=false` would silently activate the filter. The
  // current schema preprocesses the canonical string forms before reaching
  // `z.boolean()` so `=true`/`=false` round-trip correctly.

  it('parses ?assigned_to_me=true (string) as true', () => {
    const result = AnnotationQueuesListParamsSchema.parse({ assigned_to_me: 'true' });
    expect(result.assigned_to_me).toBe(true);
  });

  it('parses ?assigned_to_me=false (string) as false (NOT silently true)', () => {
    const result = AnnotationQueuesListParamsSchema.parse({ assigned_to_me: 'false' });
    expect(result.assigned_to_me).toBe(false);
  });

  it('accepts native booleans from SDK callers', () => {
    expect(AnnotationQueuesListParamsSchema.parse({ assigned_to_me: true }).assigned_to_me).toBe(true);
    expect(AnnotationQueuesListParamsSchema.parse({ assigned_to_me: false }).assigned_to_me).toBe(false);
  });

  it('defaults to false when assigned_to_me is omitted', () => {
    const result = AnnotationQueuesListParamsSchema.parse({});
    expect(result.assigned_to_me).toBe(false);
  });

  it('rejects unrecognized string forms (no silent coercion)', () => {
    expect(() => AnnotationQueuesListParamsSchema.parse({ assigned_to_me: 'yes' })).toThrow();
    expect(() => AnnotationQueuesListParamsSchema.parse({ assigned_to_me: '1' })).toThrow();
    expect(() => AnnotationQueuesListParamsSchema.parse({ assigned_to_me: 'TRUE' })).toThrow();
  });
});

describe('ListPromptsQuerySchema', () => {
  it('accepts an empty query (no filter)', () => {
    expect(ListPromptsQuerySchema.parse({})).toEqual({});
  });

  it('accepts a frontmatter-style name', () => {
    expect(ListPromptsQuerySchema.parse({ name: 'hello' })).toEqual({
      name: 'hello',
    });
  });

  it('strips null bytes from `name` (postgres-safety convention)', () => {
    const parsed = ListPromptsQuerySchema.parse({ name: 'foo bar' });
    expect(parsed.name).toBe('foobar');
  });

  it('rejects empty-string `name` (would silently match nothing on filter)', () => {
    expect(() => ListPromptsQuerySchema.parse({ name: '' })).toThrow();
  });

  it('rejects oversized `name` (>255 chars)', () => {
    expect(() =>
      ListPromptsQuerySchema.parse({ name: 'x'.repeat(256) }),
    ).toThrow();
  });
});

describe('ListPromptsResponseSchema', () => {
  // Wire shape: `{ data: { paths: string[] } }` — the canonical envelope
  // enforced gateway-wide by `envelope-coverage.test.ts`.

  it('accepts an empty paths array', () => {
    const value = { data: { paths: [] } };
    expect(ListPromptsResponseSchema.parse(value)).toEqual(value);
  });

  it('accepts multiple paths (collision case)', () => {
    const value = { data: { paths: ['a/x.prompt.mdx', 'b/x.prompt.mdx'] } };
    expect(ListPromptsResponseSchema.parse(value)).toEqual(value);
  });

  it('rejects when the `data` envelope is missing', () => {
    expect(() => ListPromptsResponseSchema.parse({})).toThrow();
  });

  it('rejects when `paths` is missing inside `data`', () => {
    expect(() => ListPromptsResponseSchema.parse({ data: {} })).toThrow();
  });

  it('rejects the legacy flat `{ paths }` shape', () => {
    expect(() => ListPromptsResponseSchema.parse({ paths: [] })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Requests schemas — `/v1/requests`
// ---------------------------------------------------------------------------

describe('RequestsListParamsSchema', () => {
  it('applies pagination + sort_order defaults on empty input', () => {
    const result = RequestsListParamsSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
    expect(result.sort_order).toBe('desc');
  });

  it('coerces string limit/offset and accepts the filter dimensions', () => {
    const result = RequestsListParamsSchema.parse({
      limit: '25',
      offset: '10',
      start_date: '2026-01-01T00:00:00.000Z',
      end_date: '2026-01-02T00:00:00.000Z',
      status: 'ERROR',
      user_id: 'user-1',
      model: 'gpt-4o',
      sort_by: 'latency',
      sort_order: 'asc',
      filter: '[{"field":"model","operator":"equals","value":"gpt-4o"}]',
    });
    expect(result).toMatchObject({
      limit: 25,
      offset: 10,
      status: 'ERROR',
      user_id: 'user-1',
      model: 'gpt-4o',
      sort_by: 'latency',
      sort_order: 'asc',
    });
  });

  it('rejects an unknown status value', () => {
    expect(() => RequestsListParamsSchema.parse({ status: 'WARN' })).toThrow();
  });

  it('rejects a non-datetime start_date', () => {
    expect(() => RequestsListParamsSchema.parse({ start_date: '2026-01-01' })).toThrow();
  });

  it('rejects a negative limit', () => {
    expect(() => RequestsListParamsSchema.parse({ limit: -1 })).toThrow();
  });
});

describe('RequestResponseSchema / RequestsListResponseSchema', () => {
  const sampleRecord = {
    id: 'span-1',
    tenant_id: 'tenant-1',
    app_id: 'app-1',
    cost: 0.0042,
    prompt_tokens: 156,
    completion_tokens: 89,
    latency_ms: 1234,
    model_used: 'gpt-4o',
    status: 'OK',
    input: 'What is the capital of France?',
    output: 'Paris.',
    ts: '2026-01-15T10:30:00.000Z',
    user_id: 'user-1',
    prompt_name: 'geography-qa',
    trace_id: 'trace-abc',
    status_message: '',
    props: '{"lang":"en"}',
  };

  it('accepts a fully-populated record', () => {
    expect(RequestResponseSchema.parse(sampleRecord)).toEqual(sampleRecord);
  });

  it('accepts a null output', () => {
    const value = { ...sampleRecord, output: null };
    expect(RequestResponseSchema.parse(value)).toEqual(value);
  });

  it('rejects camelCase field names', () => {
    const { model_used: _omit, ...rest } = sampleRecord;
    expect(() => RequestResponseSchema.parse({ ...rest, modelUsed: 'gpt-4o' })).toThrow();
  });

  it('wraps records in the canonical { data, pagination } envelope', () => {
    const value = {
      data: [sampleRecord],
      pagination: { total: 1, limit: 50, offset: 0 },
    };
    expect(RequestsListResponseSchema.parse(value)).toEqual(value);
  });

  it('rejects the legacy flat `{ requests }` shape', () => {
    expect(() => RequestsListResponseSchema.parse({ requests: [sampleRecord] })).toThrow();
  });
});
