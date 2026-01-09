import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpDataSource } from '../src/data-source/http-data-source.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('HttpDataSource', () => {
  let dataSource: HttpDataSource;

  beforeEach(() => {
    dataSource = new HttpDataSource('http://localhost:9418');
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listTraces', () => {
    it('should fetch traces from /v1/traces', async () => {
      const mockTraces = [
        {
          id: 'trace-1',
          name: 'Test Trace',
          status: '0',
          latency: 100,
          cost: 0.001,
          tokens: 500,
          start: 1704067200000,
          end: 1704067201000,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: mockTraces }),
      });

      const result = await dataSource.listTraces();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9418/v1/traces',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('trace-1');
    });

    it('should apply limit parameter', async () => {
      const mockTraces = Array.from({ length: 100 }, (_, i) => ({
        id: `trace-${i}`,
        name: `Test Trace ${i}`,
        status: '0',
        latency: 100,
        cost: 0.001,
        tokens: 500,
        start: 1704067200000,
        end: 1704067201000,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: mockTraces }),
      });

      const result = await dataSource.listTraces({ limit: 10 });

      expect(result).toHaveLength(10);
    });

    it('should fetch by sessionId when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [] }),
      });

      await dataSource.listTraces({ sessionId: 'session-123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9418/v1/sessions/session-123/traces',
        expect.any(Object)
      );
    });

    it('should map session traces correctly using data field', async () => {
      // Session traces come in a different format with nested data field
      const sessionTraces = [
        {
          id: 'trace-1',
          name: 'Session Trace',
          data: {
            id: 'trace-1',
            name: 'Session Trace',
            status: '2',
            latency: 500,
            cost: 0.05,
            tokens: 1000,
            start: 1704067200000,
            end: 1704067205000,
            status_message: 'Error occurred',
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: sessionTraces }),
      });

      const result = await dataSource.listTraces({ sessionId: 'session-123' });

      expect(result).toHaveLength(1);
      // Should extract values from nested data field
      expect(result[0]).toEqual({
        id: 'trace-1',
        name: 'Session Trace',
        status: '2',
        latency: 500,
        cost: 0.05,
        tokens: 1000,
        start: 1704067200000,
        end: 1704067205000,
        statusMessage: 'Error occurred',
      });
    });

    it('should fetch by datasetRunId when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [] }),
      });

      await dataSource.listTraces({ datasetRunId: 'run-456' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9418/v1/runs/run-456/traces',
        expect.any(Object)
      );
    });
  });

  describe('getTrace', () => {
    it('should fetch a single trace by ID', async () => {
      const mockTrace = {
        id: 'trace-1',
        name: 'Test Trace',
        spans: [],
        data: {
          id: 'trace-1',
          name: 'Test Trace',
          status: '0',
          latency: 100,
          cost: 0.001,
          tokens: 500,
          start: 1704067200000,
          end: 1704067201000,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: mockTrace }),
      });

      const result = await dataSource.getTrace('trace-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9418/v1/traces/trace-1',
        expect.any(Object)
      );
      expect(result).not.toBeNull();
      expect(result?.id).toBe('trace-1');
    });

    it('should return null for non-existent trace', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: null }),
      });

      const result = await dataSource.getTrace('non-existent');

      expect(result).toBeNull();
    });

    it('should handle 404 errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Trace not found' }),
      });

      const result = await dataSource.getTrace('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getSpans', () => {
    const createMockSpans = () => [
      {
        id: 'span-1',
        name: 'Generation Span',
        duration: 100,
        timestamp: 1704067200000,
        traceId: 'trace-1',
        status: '0',
        data: { type: 'GENERATION', model: 'claude-3-opus' },
      },
      {
        id: 'span-2',
        name: 'Error Span',
        duration: 50,
        timestamp: 1704067201000,
        traceId: 'trace-1',
        status: '2',
        data: { type: 'SPAN' },
      },
      {
        id: 'span-3',
        name: 'Event Span',
        duration: 200,
        timestamp: 1704067202000,
        traceId: 'trace-1',
        status: '0',
        data: { type: 'EVENT', model: 'gpt-4' },
      },
    ];

    it('should fetch spans from /v1/spans with traceId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: createMockSpans() }),
      });

      const result = await dataSource.getSpans({ traceId: 'trace-1' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/spans?traceId=trace-1'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(3);
      expect(result.hasMore).toBe(false);
    });

    it('should filter spans by status using server-side filtering', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [createMockSpans()[1]] }), // Only error span
      });

      const result = await dataSource.getSpans({
        traceId: 'trace-1',
        filters: [{ field: 'status', operator: 'eq', value: '2' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=2'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('span-2');
    });

    it('should filter spans by data.type using server-side filtering', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [createMockSpans()[0]] }), // Only GENERATION
      });

      const result = await dataSource.getSpans({
        traceId: 'trace-1',
        filters: [{ field: 'data.type', operator: 'eq', value: 'GENERATION' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('type=GENERATION'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('span-1');
    });

    it('should filter spans by name with contains operator', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [createMockSpans()[0]] }), // Only "Generation" in name
      });

      const result = await dataSource.getSpans({
        traceId: 'trace-1',
        filters: [{ field: 'name', operator: 'contains', value: 'Generation' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('name=Generation'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('span-1');
    });

    it('should filter spans by data.model with contains operator', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [createMockSpans()[0]] }), // Only claude model
      });

      const result = await dataSource.getSpans({
        traceId: 'trace-1',
        filters: [{ field: 'data.model', operator: 'contains', value: 'claude' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('model=claude'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('span-1');
    });

    it('should filter spans by duration with gt operator using server-side minDuration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [createMockSpans()[2]] }), // Server returns filtered result
      });

      const result = await dataSource.getSpans({
        traceId: 'trace-1',
        filters: [{ field: 'duration', operator: 'gt', value: 100 }],
      });

      // Should send minDuration to server
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('minDuration=100'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(1);
    });

    it('should filter spans by duration with gte operator using server-side minDuration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: createMockSpans().slice(0, 2) }),
      });

      const result = await dataSource.getSpans({
        traceId: 'trace-1',
        filters: [{ field: 'duration', operator: 'gte', value: 100 }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('minDuration=100'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(2);
    });

    it('should filter spans by duration with lt operator using server-side maxDuration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [createMockSpans()[1]] }),
      });

      const result = await dataSource.getSpans({
        traceId: 'trace-1',
        filters: [{ field: 'duration', operator: 'lt', value: 100 }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('maxDuration=100'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(1);
    });

    it('should filter spans by duration with lte operator using server-side maxDuration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: createMockSpans().slice(0, 2) }),
      });

      const result = await dataSource.getSpans({
        traceId: 'trace-1',
        filters: [{ field: 'duration', operator: 'lte', value: 100 }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('maxDuration=100'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(2);
    });

    it('should apply limit parameter with server-side pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: createMockSpans().slice(0, 2) }),
      });

      const result = await dataSource.getSpans({ traceId: 'trace-1', limit: 2 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=2'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it('should enforce MAX_LIMIT of 200 when limit exceeds it', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [] }),
      });

      await dataSource.getSpans({ traceId: 'trace-1', limit: 500 });

      // Should clamp to MAX_LIMIT (200)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=200'),
        expect.any(Object)
      );
    });

    it('should return cursor for pagination when hasMore is true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: createMockSpans().slice(0, 2) }),
      });

      const result = await dataSource.getSpans({ traceId: 'trace-1', limit: 2 });

      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBeDefined();
      expect(typeof result.cursor).toBe('string');
    });

    it('should use cursor to get next page', async () => {
      // First page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: createMockSpans().slice(0, 2) }),
      });

      const firstResult = await dataSource.getSpans({ traceId: 'trace-1', limit: 2 });
      expect(firstResult.items).toHaveLength(2);
      expect(firstResult.cursor).toBeDefined();

      // Second page using cursor
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [createMockSpans()[2]] }),
      });

      const secondResult = await dataSource.getSpans({
        traceId: 'trace-1',
        limit: 2,
        cursor: firstResult.cursor,
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('offset=2'),
        expect.any(Object)
      );
      expect(secondResult.items).toHaveLength(1);
      expect(secondResult.hasMore).toBe(false);
    });

    it('should combine multiple filters with AND logic using server-side params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [createMockSpans()[0], createMockSpans()[2]] }), // Server returns filtered
      });

      const result = await dataSource.getSpans({
        traceId: 'trace-1',
        filters: [
          { field: 'status', operator: 'eq', value: '0' },
          { field: 'duration', operator: 'gte', value: 100 },
        ],
      });

      // Should send both filters to server
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=0'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('minDuration=100'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(2);
    });

    it('should handle empty spans response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [] }),
      });

      const result = await dataSource.getSpans({ traceId: 'trace-1' });

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('should handle invalid cursor gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: createMockSpans() }),
      });

      // Invalid base64 cursor should reset to offset 0
      const result = await dataSource.getSpans({
        traceId: 'trace-1',
        cursor: 'not-valid-base64!!!',
      });

      expect(result.items).toHaveLength(3);
    });

    it('should handle malformed JSON in cursor gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: createMockSpans() }),
      });

      // Valid base64 but invalid JSON should reset to offset 0
      const invalidJsonCursor = Buffer.from('not json').toString('base64');
      const result = await dataSource.getSpans({
        traceId: 'trace-1',
        cursor: invalidJsonCursor,
      });

      expect(result.items).toHaveLength(3);
    });

    it('should throw error for unsupported filter field', async () => {
      await expect(
        dataSource.getSpans({
          traceId: 'trace-1',
          filters: [{ field: 'data.metadata.nested.value', operator: 'eq', value: 'found' }],
        })
      ).rejects.toThrow("Unsupported filter: field 'data.metadata.nested.value' with operator 'eq'");
    });

    it('should throw error for unsupported operator on duration field', async () => {
      await expect(
        dataSource.getSpans({
          traceId: 'trace-1',
          filters: [{ field: 'duration', operator: 'eq', value: 100 }],
        })
      ).rejects.toThrow("Unsupported operator 'eq' for field 'duration'. Use gt, gte, lt, or lte.");
    });

    it('should throw error for unsupported operator on supported field', async () => {
      await expect(
        dataSource.getSpans({
          traceId: 'trace-1',
          filters: [{ field: 'status', operator: 'contains', value: '2' }],
        })
      ).rejects.toThrow("Unsupported filter: field 'status' with operator 'contains'");
    });

    // Cross-trace search tests (traceId omitted)
    it('should fetch spans without traceId for cross-trace search', async () => {
      const crossTraceSpans = [
        { id: 'span-1', traceId: 'trace-1', name: 'Span from trace 1', status: '2' },
        { id: 'span-2', traceId: 'trace-2', name: 'Span from trace 2', status: '2' },
        { id: 'span-3', traceId: 'trace-3', name: 'Span from trace 3', status: '0' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: crossTraceSpans }),
      });

      const result = await dataSource.getSpans({});

      // Should NOT include traceId in URL params
      expect(mockFetch).toHaveBeenCalledWith(
        expect.not.stringContaining('traceId='),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(3);
    });

    it('should filter across all traces when traceId is omitted', async () => {
      const errorSpans = [
        { id: 'span-1', traceId: 'trace-1', status: '2' },
        { id: 'span-2', traceId: 'trace-2', status: '2' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: errorSpans }),
      });

      const result = await dataSource.getSpans({
        filters: [{ field: 'status', operator: 'eq', value: '2' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=2'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.not.stringContaining('traceId='),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(2);
      // Spans come from different traces
      expect(result.items[0].traceId).toBe('trace-1');
      expect(result.items[1].traceId).toBe('trace-2');
    });

    it('should paginate cross-trace search results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          spans: [
            { id: 'span-1', traceId: 'trace-1' },
            { id: 'span-2', traceId: 'trace-2' },
          ],
        }),
      });

      const result = await dataSource.getSpans({ limit: 2 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=2'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should throw on API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Internal server error' }),
      });

      await expect(dataSource.listTraces()).rejects.toThrow('Internal server error');
    });

    it('should handle timeout errors', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(dataSource.listTraces()).rejects.toThrow('Request timeout');
    });

    it('should handle connection refused error gracefully', async () => {
      const error = new Error('fetch failed');
      (error as Error & { cause?: { code?: string } }).cause = { code: 'ECONNREFUSED' };
      mockFetch.mockRejectedValueOnce(error);

      await expect(dataSource.listTraces()).rejects.toThrow(/Connection failed.*Is the AgentMark server running\?/);
    });

    it('should provide helpful error for connection refused in getTrace', async () => {
      const error = new Error('fetch failed');
      (error as Error & { cause?: { code?: string } }).cause = { code: 'ECONNREFUSED' };
      mockFetch.mockRejectedValueOnce(error);

      await expect(dataSource.getTrace('trace-1')).rejects.toThrow('Connection failed');
    });

    it('should return null for 404 not found in getTrace', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Trace not found (404)' }),
      });

      const result = await dataSource.getTrace('missing');

      expect(result).toBeNull();
    });
  });

  describe('authentication', () => {
    it('should include Authorization header when apiKey is provided', async () => {
      const authenticatedDataSource = new HttpDataSource(
        'http://localhost:9418',
        30000,
        'test-api-key'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [] }),
      });

      await authenticatedDataSource.listTraces();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9418/v1/traces',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          },
        })
      );
    });

    it('should not include Authorization header when apiKey is not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [] }),
      });

      await dataSource.listTraces();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9418/v1/traces',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty traces response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [] }),
      });

      const result = await dataSource.listTraces();

      expect(result).toEqual([]);
    });

    it('should URL-encode special characters in trace ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: { id: 'trace/with/slashes', name: 'Test', spans: [], data: {} } }),
      });

      await dataSource.getTrace('trace/with/slashes');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9418/v1/traces/trace%2Fwith%2Fslashes',
        expect.any(Object)
      );
    });

    it('should URL-encode special characters in session ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: [] }),
      });

      await dataSource.listTraces({ sessionId: 'session with spaces' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9418/v1/sessions/session%20with%20spaces/traces',
        expect.any(Object)
      );
    });

    it('should handle trace with missing optional fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          traces: [
            { id: 'minimal-trace' }, // Only required field
          ],
        }),
      });

      const result = await dataSource.listTraces();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'minimal-trace',
        name: '',
        status: '0',
        latency: 0,
        cost: 0,
        tokens: 0,
        start: 0,
        end: 0,
        datasetRunId: undefined,
        datasetPath: undefined,
        statusMessage: undefined,
      });
    });

    it('should handle spans with missing data field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          spans: [
            { id: 'span-1', name: 'Test', timestamp: 1000 }, // No data field
          ],
        }),
      });

      const result = await dataSource.getSpans({ traceId: 'trace-1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('span-1');
    });

    it('should handle empty filters array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [{ id: 'span-1' }, { id: 'span-2' }] }),
      });

      const result = await dataSource.getSpans({ traceId: 'trace-1', filters: [] });

      expect(result.items).toHaveLength(2);
    });
  });
});
