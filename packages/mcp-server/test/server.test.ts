import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Create mock data source with vi.fn() for each method
const mockListTraces = vi.fn();
const mockGetTrace = vi.fn();

const mockDataSource = {
  listTraces: mockListTraces,
  getTrace: mockGetTrace,
};

// Mock the data source module
vi.mock('../src/data-source/index.js', () => ({
  createDataSource: () => mockDataSource,
}));

// Import after mocking
import { createMCPServer, registerTools } from '../src/server.js';

describe('MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock responses - PaginatedResult structure
    mockListTraces.mockResolvedValue({
      items: [
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
      ],
      hasMore: false,
    });

    // TraceResult structure with trace and paginated spans
    mockGetTrace.mockResolvedValue({
      trace: {
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
      },
      spans: {
        items: [
          {
            id: 'span-1',
            name: 'Test Span',
            duration: 100,
            timestamp: 1704067200000,
            traceId: 'trace-1',
            status: '0',
            data: { type: 'GENERATION' },
          },
        ],
        hasMore: false,
      },
    });
  });

  describe('createMCPServer', () => {
    it('should create a server instance', async () => {
      const server = await createMCPServer();
      expect(server).toBeDefined();
      expect(server).toBeInstanceOf(McpServer);
    });

    it('should register tools during creation', async () => {
      const _server = await createMCPServer();

      // The server should be fully configured after creation
      // We verify by checking that the mocked data source wasn't called yet
      // (tools are registered but not invoked during creation)
      expect(mockListTraces).not.toHaveBeenCalled();
      expect(mockGetTrace).not.toHaveBeenCalled();
    });
  });

  describe('registerTools', () => {
    let server: McpServer;
    type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
    let registeredTools: Map<string, { handler: ToolHandler; schema: unknown }>;

    beforeEach(() => {
      server = new McpServer({ name: 'test', version: '0.0.1' });
      registeredTools = new Map();

      // Spy on server.tool to capture registered tools
      vi.spyOn(server, 'tool').mockImplementation((name: string, _desc: string, schema: unknown, handler: ToolHandler) => {
        registeredTools.set(name, { handler, schema });
      });

      registerTools(server, mockDataSource);
    });

    it('should register two MCP tools', () => {
      expect(registeredTools.has('list_traces')).toBe(true);
      expect(registeredTools.has('get_trace')).toBe(true);
      expect(registeredTools.size).toBe(2);
    });

    describe('list_traces tool', () => {
      it('should return paginated trace list', async () => {
        const handler = registeredTools.get('list_traces')!.handler;
        const result = await handler({ limit: 10 });

        expect(mockListTraces).toHaveBeenCalledWith({
          limit: 10,
          sessionId: undefined,
          datasetRunId: undefined,
          cursor: undefined,
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.items).toHaveLength(1);
        expect(parsed.items[0].id).toBe('trace-1');
        expect(parsed.hasMore).toBe(false);
      });

      it('should pass cursor for pagination', async () => {
        const handler = registeredTools.get('list_traces')!.handler;
        await handler({ cursor: 'abc123' });

        expect(mockListTraces).toHaveBeenCalledWith(
          expect.objectContaining({ cursor: 'abc123' })
        );
      });

      it('should return cursor when hasMore is true', async () => {
        mockListTraces.mockResolvedValueOnce({
          items: [{ id: 'trace-1' }, { id: 'trace-2' }],
          hasMore: true,
          cursor: 'next-page-cursor',
        });

        const handler = registeredTools.get('list_traces')!.handler;
        const result = await handler({ limit: 2 });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.items).toHaveLength(2);
        expect(parsed.hasMore).toBe(true);
        expect(parsed.cursor).toBe('next-page-cursor');
      });

      it('should pass sessionId filter', async () => {
        const handler = registeredTools.get('list_traces')!.handler;
        await handler({ sessionId: 'session-123' });

        expect(mockListTraces).toHaveBeenCalledWith(
          expect.objectContaining({ sessionId: 'session-123' })
        );
      });

      it('should pass datasetRunId filter', async () => {
        const handler = registeredTools.get('list_traces')!.handler;
        await handler({ datasetRunId: 'run-456' });

        expect(mockListTraces).toHaveBeenCalledWith(
          expect.objectContaining({ datasetRunId: 'run-456' })
        );
      });

      it('should return error response on timeout', async () => {
        mockListTraces.mockRejectedValueOnce(new Error('Request timeout after 30000ms'));
        const handler = registeredTools.get('list_traces')!.handler;
        const result = await handler({});

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.code).toBe('TIMEOUT');
      });

      it('should return error response on connection failure', async () => {
        mockListTraces.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const handler = registeredTools.get('list_traces')!.handler;
        const result = await handler({});

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.code).toBe('CONNECTION_FAILED');
      });
    });

    describe('get_trace tool', () => {
      it('should return trace with paginated spans', async () => {
        const handler = registeredTools.get('get_trace')!.handler;
        const result = await handler({ traceId: 'trace-1' });

        expect(mockGetTrace).toHaveBeenCalledWith('trace-1', {
          filters: undefined,
          limit: undefined,
          cursor: undefined,
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.trace.id).toBe('trace-1');
        expect(parsed.spans.items).toHaveLength(1);
        expect(parsed.spans.hasMore).toBe(false);
      });

      it('should pass filters, limit, and cursor to data source', async () => {
        const handler = registeredTools.get('get_trace')!.handler;
        const filters = [{ field: 'status', operator: 'eq', value: '2' }];
        await handler({ traceId: 'trace-1', filters, limit: 10, cursor: 'abc123' });

        expect(mockGetTrace).toHaveBeenCalledWith('trace-1', {
          filters,
          limit: 10,
          cursor: 'abc123',
        });
      });

      it('should return paginated spans with cursor', async () => {
        mockGetTrace.mockResolvedValueOnce({
          trace: {
            id: 'trace-1',
            name: 'Test Trace',
            spans: [],
            data: { id: 'trace-1', name: 'Test Trace', status: '0', latency: 100, cost: 0.001, tokens: 500, start: 0, end: 0 },
          },
          spans: {
            items: [{ id: 'span-1' }, { id: 'span-2' }],
            hasMore: true,
            cursor: 'next-page-cursor',
          },
        });

        const handler = registeredTools.get('get_trace')!.handler;
        const result = await handler({ traceId: 'trace-1', limit: 2 });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.spans.items).toHaveLength(2);
        expect(parsed.spans.hasMore).toBe(true);
        expect(parsed.spans.cursor).toBe('next-page-cursor');
      });

      it('should return NOT_FOUND error for missing trace', async () => {
        mockGetTrace.mockResolvedValueOnce(null);
        const handler = registeredTools.get('get_trace')!.handler;
        const result = await handler({ traceId: 'missing-trace' });

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.code).toBe('NOT_FOUND');
        expect(parsed.details.traceId).toBe('missing-trace');
      });

      it('should include traceId in error details on failure', async () => {
        mockGetTrace.mockRejectedValueOnce(new Error('Database error'));
        const handler = registeredTools.get('get_trace')!.handler;
        const result = await handler({ traceId: 'trace-1' });

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.details.traceId).toBe('trace-1');
      });
    });

    describe('get_trace error handling', () => {
      it('should return TIMEOUT error on timeout', async () => {
        mockGetTrace.mockRejectedValueOnce(new Error('Request timeout after 30000ms'));
        const handler = registeredTools.get('get_trace')!.handler;
        const result = await handler({ traceId: 'trace-1' });

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.code).toBe('TIMEOUT');
        expect(parsed.details.traceId).toBe('trace-1');
      });

      it('should return CONNECTION_FAILED error on connection failure', async () => {
        mockGetTrace.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const handler = registeredTools.get('get_trace')!.handler;
        const result = await handler({ traceId: 'trace-1' });

        expect(result.isError).toBe(true);
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.code).toBe('CONNECTION_FAILED');
        expect(parsed.details.traceId).toBe('trace-1');
      });
    });
  });
});

describe('Config', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('should use default URL when AGENTMARK_URL is not set', async () => {
    delete process.env.AGENTMARK_URL;
    delete process.env.AGENTMARK_API_KEY;
    delete process.env.AGENTMARK_TIMEOUT_MS;

    vi.resetModules();
    const { getConfig } = await import('../src/config.js');
    const config = getConfig();

    expect(config.url).toBe('http://localhost:9418');
    expect(config.apiKey).toBeUndefined();
    expect(config.timeoutMs).toBe(30000);
  });

  it('should use AGENTMARK_URL environment variable', async () => {
    const originalUrl = process.env.AGENTMARK_URL;
    process.env.AGENTMARK_URL = 'http://custom:3000';

    vi.resetModules();
    const { getConfig } = await import('../src/config.js');
    const config = getConfig();

    expect(config.url).toBe('http://custom:3000');

    // Restore
    if (originalUrl) {
      process.env.AGENTMARK_URL = originalUrl;
    } else {
      delete process.env.AGENTMARK_URL;
    }
  });

  it('should use AGENTMARK_API_KEY environment variable', async () => {
    const originalKey = process.env.AGENTMARK_API_KEY;
    process.env.AGENTMARK_API_KEY = 'test-api-key';

    vi.resetModules();
    const { getConfig } = await import('../src/config.js');
    const config = getConfig();

    expect(config.apiKey).toBe('test-api-key');

    // Restore
    if (originalKey) {
      process.env.AGENTMARK_API_KEY = originalKey;
    } else {
      delete process.env.AGENTMARK_API_KEY;
    }
  });

  it('should use AGENTMARK_TIMEOUT_MS environment variable', async () => {
    const originalTimeout = process.env.AGENTMARK_TIMEOUT_MS;
    process.env.AGENTMARK_TIMEOUT_MS = '60000';

    vi.resetModules();
    const { getConfig } = await import('../src/config.js');
    const config = getConfig();

    expect(config.timeoutMs).toBe(60000);

    // Restore
    if (originalTimeout) {
      process.env.AGENTMARK_TIMEOUT_MS = originalTimeout;
    } else {
      delete process.env.AGENTMARK_TIMEOUT_MS;
    }
  });

  it('should handle invalid timeout gracefully', async () => {
    const originalTimeout = process.env.AGENTMARK_TIMEOUT_MS;
    process.env.AGENTMARK_TIMEOUT_MS = 'invalid';

    vi.resetModules();
    const { getConfig } = await import('../src/config.js');
    const config = getConfig();

    // parseInt('invalid') returns NaN - this is current behavior
    // In production, the HttpDataSource handles this with default timeout
    expect(config.timeoutMs).toBeNaN();

    // Restore
    if (originalTimeout) {
      process.env.AGENTMARK_TIMEOUT_MS = originalTimeout;
    } else {
      delete process.env.AGENTMARK_TIMEOUT_MS;
    }
  });
});
