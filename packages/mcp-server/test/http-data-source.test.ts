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
    it('should fetch traces from /v1/traces and return paginated result', async () => {
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
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('trace-1');
      expect(result.hasMore).toBe(false);
    });

    it('should apply limit parameter and return hasMore when more results exist', async () => {
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

      expect(result.items).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBeDefined();
    });

    it('should use cursor to paginate results', async () => {
      const mockTraces = Array.from({ length: 25 }, (_, i) => ({
        id: `trace-${i}`,
        name: `Test Trace ${i}`,
        status: '0',
        latency: 100,
        cost: 0.001,
        tokens: 500,
        start: 1704067200000,
        end: 1704067201000,
      }));

      // First page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: mockTraces }),
      });

      const firstResult = await dataSource.listTraces({ limit: 10 });
      expect(firstResult.items).toHaveLength(10);
      expect(firstResult.items[0].id).toBe('trace-0');
      expect(firstResult.hasMore).toBe(true);

      // Second page using cursor
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: mockTraces }),
      });

      const secondResult = await dataSource.listTraces({ limit: 10, cursor: firstResult.cursor });
      expect(secondResult.items).toHaveLength(10);
      expect(secondResult.items[0].id).toBe('trace-10');
      expect(secondResult.hasMore).toBe(true);

      // Third page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traces: mockTraces }),
      });

      const thirdResult = await dataSource.listTraces({ limit: 10, cursor: secondResult.cursor });
      expect(thirdResult.items).toHaveLength(5);
      expect(thirdResult.items[0].id).toBe('trace-20');
      expect(thirdResult.hasMore).toBe(false);
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

      expect(result.items).toHaveLength(1);
      // Should extract values from nested data field
      expect(result.items[0]).toEqual({
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

    const mockSpans = [
      {
        id: 'span-1',
        name: 'Generation Span',
        duration: 100,
        timestamp: 1704067200000,
        traceId: 'trace-1',
        status: '0',
        data: { type: 'GENERATION', model: 'claude-3-opus' },
      },
    ];

    it('should fetch trace and spans by ID', async () => {
      // First call - get trace
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: mockTrace }),
      });
      // Second call - get spans
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: mockSpans }),
      });

      const result = await dataSource.getTrace('trace-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9418/v1/traces/trace-1',
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/spans?traceId=trace-1'),
        expect.any(Object)
      );
      expect(result).not.toBeNull();
      expect(result?.trace.id).toBe('trace-1');
      expect(result?.spans.items).toHaveLength(1);
    });

    it('should pass filters to span fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: mockTrace }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [mockSpans[0]] }),
      });

      await dataSource.getTrace('trace-1', {
        filters: [{ field: 'status', operator: 'eq', value: '2' }],
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('status=2'),
        expect.any(Object)
      );
    });

    it('should pass limit and cursor to span fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: mockTrace }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: mockSpans }),
      });

      const cursor = Buffer.from(JSON.stringify({ offset: 10 })).toString('base64');
      await dataSource.getTrace('trace-1', { limit: 5, cursor });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('limit=5'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('offset=10'),
        expect.any(Object)
      );
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

  describe('getTrace span filtering', () => {
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

    // Helper to mock both trace and spans fetch
    const mockTraceFetch = (spans = createMockSpans()) => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: mockTrace }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans }),
      });
    };

    it('should filter spans by status', async () => {
      mockTraceFetch([createMockSpans()[1]]);

      const result = await dataSource.getTrace('trace-1', {
        filters: [{ field: 'status', operator: 'eq', value: '2' }],
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('status=2'),
        expect.any(Object)
      );
      expect(result?.spans.items).toHaveLength(1);
      expect(result?.spans.items[0].id).toBe('span-2');
    });

    it('should filter spans by data.type', async () => {
      mockTraceFetch([createMockSpans()[0]]);

      const result = await dataSource.getTrace('trace-1', {
        filters: [{ field: 'data.type', operator: 'eq', value: 'GENERATION' }],
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('type=GENERATION'),
        expect.any(Object)
      );
      expect(result?.spans.items).toHaveLength(1);
      expect(result?.spans.items[0].id).toBe('span-1');
    });

    it('should filter spans by name with contains operator', async () => {
      mockTraceFetch([createMockSpans()[0]]);

      const result = await dataSource.getTrace('trace-1', {
        filters: [{ field: 'name', operator: 'contains', value: 'Generation' }],
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('name=Generation'),
        expect.any(Object)
      );
      expect(result?.spans.items).toHaveLength(1);
    });

    it('should filter spans by data.model', async () => {
      mockTraceFetch([createMockSpans()[0]]);

      const result = await dataSource.getTrace('trace-1', {
        filters: [{ field: 'data.model', operator: 'contains', value: 'claude' }],
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('model=claude'),
        expect.any(Object)
      );
      expect(result?.spans.items).toHaveLength(1);
    });

    it('should filter spans by duration with gt operator', async () => {
      mockTraceFetch([createMockSpans()[2]]);

      const result = await dataSource.getTrace('trace-1', {
        filters: [{ field: 'duration', operator: 'gt', value: 100 }],
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('minDuration=100'),
        expect.any(Object)
      );
      expect(result?.spans.items).toHaveLength(1);
    });

    it('should filter spans by duration with lt operator', async () => {
      mockTraceFetch([createMockSpans()[1]]);

      const result = await dataSource.getTrace('trace-1', {
        filters: [{ field: 'duration', operator: 'lt', value: 100 }],
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('maxDuration=100'),
        expect.any(Object)
      );
      expect(result?.spans.items).toHaveLength(1);
    });

    it('should enforce MAX_LIMIT of 200 when limit exceeds it', async () => {
      mockTraceFetch([]);

      await dataSource.getTrace('trace-1', { limit: 500 });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('limit=200'),
        expect.any(Object)
      );
    });

    it('should return cursor for pagination when hasMore is true', async () => {
      mockTraceFetch(createMockSpans().slice(0, 2));

      const result = await dataSource.getTrace('trace-1', { limit: 2 });

      expect(result?.spans.hasMore).toBe(true);
      expect(result?.spans.cursor).toBeDefined();
    });

    it('should throw error for unsupported filter field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: mockTrace }),
      });

      await expect(
        dataSource.getTrace('trace-1', {
          filters: [{ field: 'data.metadata.nested.value', operator: 'eq', value: 'found' }],
        })
      ).rejects.toThrow("Unsupported filter: field 'data.metadata.nested.value' with operator 'eq'");
    });

    it('should throw error for unsupported operator on duration field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: mockTrace }),
      });

      await expect(
        dataSource.getTrace('trace-1', {
          filters: [{ field: 'duration', operator: 'eq', value: 100 }],
        })
      ).rejects.toThrow("Unsupported operator 'eq' for field 'duration'. Use gt, gte, lt, or lte.");
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

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('should URL-encode special characters in trace ID', async () => {
      // First call - get trace
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: { id: 'trace/with/slashes', name: 'Test', spans: [], data: {} } }),
      });
      // Second call - get spans
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [] }),
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

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
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
      expect(result.hasMore).toBe(false);
    });

    it('should handle spans with missing data field in getTrace', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: { id: 'trace-1', name: 'Test', spans: [], data: {} } }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          spans: [
            { id: 'span-1', name: 'Test', timestamp: 1000 }, // No data field
          ],
        }),
      });

      const result = await dataSource.getTrace('trace-1');

      expect(result?.spans.items).toHaveLength(1);
      expect(result?.spans.items[0].id).toBe('span-1');
    });

    it('should handle empty filters array in getTrace', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: { id: 'trace-1', name: 'Test', spans: [], data: {} } }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spans: [{ id: 'span-1' }, { id: 'span-2' }] }),
      });

      const result = await dataSource.getTrace('trace-1', { filters: [] });

      expect(result?.spans.items).toHaveLength(2);
    });
  });
});
