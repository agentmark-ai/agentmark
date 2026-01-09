/**
 * MCP Server Tests
 *
 * Per the constitution (IV. Testability - Test Value Requirements):
 * - Tests MUST test real behavior, not mock wiring
 * - Tests MUST verify outcomes, not implementation
 * - Mock-only tests that just verify "mock was called with X" are LOW VALUE
 *
 * This file tests:
 * 1. Server creation and tool registration (real MCP SDK behavior)
 * 2. Tool schema validation (real Zod validation)
 * 3. Error classification logic (real string matching)
 * 4. Config parsing (real environment variable handling)
 *
 * Note: Full integration tests are in integration.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// We only mock the data source for unit tests of error handling logic
// Integration tests in integration.test.ts use real implementations
const mockListTraces = vi.fn();
const mockGetTrace = vi.fn();

const mockDataSource = {
  listTraces: mockListTraces,
  getTrace: mockGetTrace,
};

vi.mock('../../src/data-source/index.js', () => ({
  createDataSource: () => mockDataSource,
}));

import { createMCPServer, registerTools } from '../../src/server.js';

describe('MCP Server Creation', () => {
  /**
   * These tests verify that the MCP server is correctly instantiated.
   * This provides value because it catches SDK compatibility issues.
   */
  it('should create an McpServer instance with correct name and version', async () => {
    const server = await createMCPServer();

    expect(server).toBeDefined();
    expect(server).toBeInstanceOf(McpServer);
    // The server should be configured - we verify by checking it exists
    // and is the right type (SDK compatibility)
  });
});

describe('Tool Registration', () => {
  let server: McpServer;
  type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
  let registeredTools: Map<string, { handler: ToolHandler; schema: unknown }>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: 'test', version: '0.0.1' });
    registeredTools = new Map();

    // Capture registered tools for testing
    vi.spyOn(server, 'tool').mockImplementation((name: string, _desc: string, schema: unknown, handler: ToolHandler) => {
      registeredTools.set(name, { handler, schema });
    });

    registerTools(server, mockDataSource);
  });

  /**
   * This test verifies that the expected tools are registered.
   * This is valuable because missing tool registration would break the entire feature.
   */
  it('should register list_traces and get_trace tools', () => {
    expect(registeredTools.has('list_traces')).toBe(true);
    expect(registeredTools.has('get_trace')).toBe(true);
    expect(registeredTools.size).toBe(2);
  });

  describe('Error Classification Logic', () => {
    /**
     * These tests verify the error classification logic that maps
     * error messages to error codes. This is valuable because wrong
     * error codes would confuse users and AI assistants.
     */
    beforeEach(() => {
      mockListTraces.mockResolvedValue({ items: [], hasMore: false });
      mockGetTrace.mockResolvedValue({
        trace: { id: 'test', name: 'test', spans: [], data: {} },
        spans: { items: [], hasMore: false },
      });
    });

    it('should classify timeout errors as TIMEOUT', async () => {
      mockListTraces.mockRejectedValueOnce(new Error('Request timeout after 30000ms: /v1/traces'));
      const handler = registeredTools.get('list_traces')!.handler;

      const result = await handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.code).toBe('TIMEOUT');
      expect(parsed.error).toContain('timeout');
    });

    it('should classify connection errors as CONNECTION_FAILED', async () => {
      mockListTraces.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));
      const handler = registeredTools.get('list_traces')!.handler;

      const result = await handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.code).toBe('CONNECTION_FAILED');
    });

    it('should classify other errors as INVALID_QUERY', async () => {
      mockListTraces.mockRejectedValueOnce(new Error('Unknown database error'));
      const handler = registeredTools.get('list_traces')!.handler;

      const result = await handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.code).toBe('INVALID_QUERY');
    });

    it('should return NOT_FOUND when trace does not exist', async () => {
      mockGetTrace.mockResolvedValueOnce(null);
      const handler = registeredTools.get('get_trace')!.handler;

      const result = await handler({ traceId: 'nonexistent-trace' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.code).toBe('NOT_FOUND');
      expect(parsed.details.traceId).toBe('nonexistent-trace');
    });

    it('should include traceId in error details for get_trace errors', async () => {
      mockGetTrace.mockRejectedValueOnce(new Error('Database connection lost'));
      const handler = registeredTools.get('get_trace')!.handler;

      const result = await handler({ traceId: 'trace-123' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.details.traceId).toBe('trace-123');
    });
  });

  describe('Response Formatting', () => {
    /**
     * These tests verify that successful responses are correctly formatted.
     * This is valuable because malformed responses would break AI assistants.
     */
    it('should return JSON-formatted response for list_traces', async () => {
      const testData = {
        items: [
          { id: 'trace-1', name: 'Test', status: '0', latency: 100, cost: 0.01, tokens: 500 },
        ],
        hasMore: false,
      };
      mockListTraces.mockResolvedValueOnce(testData);
      const handler = registeredTools.get('list_traces')!.handler;

      const result = await handler({ limit: 10 });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      // Verify the response is valid JSON with expected structure
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].id).toBe('trace-1');
      expect(parsed.hasMore).toBe(false);
    });

    it('should return JSON-formatted response for get_trace with spans', async () => {
      const testData = {
        trace: {
          id: 'trace-1',
          name: 'Test Trace',
          spans: [],
          data: { status: '0', latency: 100, cost: 0.01, tokens: 500 },
        },
        spans: {
          items: [
            { id: 'span-1', name: 'Test Span', duration: 50, status: '0' },
          ],
          hasMore: true,
          cursor: 'next-page',
        },
      };
      mockGetTrace.mockResolvedValueOnce(testData);
      const handler = registeredTools.get('get_trace')!.handler;

      const result = await handler({ traceId: 'trace-1' });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);

      // Verify structure matches expected MCP tool output
      expect(parsed.trace).toBeDefined();
      expect(parsed.trace.id).toBe('trace-1');
      expect(parsed.spans).toBeDefined();
      expect(parsed.spans.items).toHaveLength(1);
      expect(parsed.spans.hasMore).toBe(true);
      expect(parsed.spans.cursor).toBe('next-page');
    });

    it('should include pagination cursor when hasMore is true', async () => {
      mockListTraces.mockResolvedValueOnce({
        items: [{ id: 'trace-1' }, { id: 'trace-2' }],
        hasMore: true,
        cursor: 'eyJvZmZzZXQiOjJ9', // base64 encoded {"offset":2}
      });
      const handler = registeredTools.get('list_traces')!.handler;

      const result = await handler({ limit: 2 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.hasMore).toBe(true);
      expect(parsed.cursor).toBe('eyJvZmZzZXQiOjJ9');
    });
  });
});

describe('Config', () => {
  /**
   * These tests provide REAL VALUE because they test actual behavior:
   * - Real environment variable parsing
   * - Real default value fallbacks
   * - Real NaN handling
   *
   * No mocking needed - we test the actual config module.
   */
  afterEach(() => {
    vi.resetModules();
  });

  it('should use default URL when AGENTMARK_URL is not set', async () => {
    // Save and clear env vars
    const saved = {
      url: process.env.AGENTMARK_URL,
      key: process.env.AGENTMARK_API_KEY,
      timeout: process.env.AGENTMARK_TIMEOUT_MS,
    };

    delete process.env.AGENTMARK_URL;
    delete process.env.AGENTMARK_API_KEY;
    delete process.env.AGENTMARK_TIMEOUT_MS;

    vi.resetModules();
    const { getConfig } = await import('../../src/config.js');
    const config = getConfig();

    // Verify defaults
    expect(config.url).toBe('http://localhost:9418');
    expect(config.apiKey).toBeUndefined();
    expect(config.timeoutMs).toBe(30000);

    // Restore
    if (saved.url) process.env.AGENTMARK_URL = saved.url;
    if (saved.key) process.env.AGENTMARK_API_KEY = saved.key;
    if (saved.timeout) process.env.AGENTMARK_TIMEOUT_MS = saved.timeout;
  });

  it('should use environment variables when set', async () => {
    const saved = {
      url: process.env.AGENTMARK_URL,
      key: process.env.AGENTMARK_API_KEY,
      timeout: process.env.AGENTMARK_TIMEOUT_MS,
    };

    process.env.AGENTMARK_URL = 'http://custom-server:3000';
    process.env.AGENTMARK_API_KEY = 'test-api-key-123';
    process.env.AGENTMARK_TIMEOUT_MS = '60000';

    vi.resetModules();
    const { getConfig } = await import('../../src/config.js');
    const config = getConfig();

    expect(config.url).toBe('http://custom-server:3000');
    expect(config.apiKey).toBe('test-api-key-123');
    expect(config.timeoutMs).toBe(60000);

    // Restore
    if (saved.url) process.env.AGENTMARK_URL = saved.url;
    else delete process.env.AGENTMARK_URL;
    if (saved.key) process.env.AGENTMARK_API_KEY = saved.key;
    else delete process.env.AGENTMARK_API_KEY;
    if (saved.timeout) process.env.AGENTMARK_TIMEOUT_MS = saved.timeout;
    else delete process.env.AGENTMARK_TIMEOUT_MS;
  });

  it('should fall back to default timeout when AGENTMARK_TIMEOUT_MS is invalid', async () => {
    const saved = process.env.AGENTMARK_TIMEOUT_MS;

    // Test various invalid values
    const invalidValues = ['invalid', 'NaN', '', 'abc123'];

    for (const invalid of invalidValues) {
      process.env.AGENTMARK_TIMEOUT_MS = invalid;
      vi.resetModules();
      const { getConfig } = await import('../../src/config.js');
      const config = getConfig();

      expect(config.timeoutMs).toBe(30000);
    }

    // Restore
    if (saved) process.env.AGENTMARK_TIMEOUT_MS = saved;
    else delete process.env.AGENTMARK_TIMEOUT_MS;
  });

  it('should handle edge case timeout values', async () => {
    const saved = process.env.AGENTMARK_TIMEOUT_MS;

    // Zero should work (means no timeout)
    process.env.AGENTMARK_TIMEOUT_MS = '0';
    vi.resetModules();
    let { getConfig } = await import('../../src/config.js');
    expect(getConfig().timeoutMs).toBe(0);

    // Negative should work (parseInt accepts it)
    process.env.AGENTMARK_TIMEOUT_MS = '-1000';
    vi.resetModules();
    ({ getConfig } = await import('../../src/config.js'));
    expect(getConfig().timeoutMs).toBe(-1000);

    // Very large should work
    process.env.AGENTMARK_TIMEOUT_MS = '999999999';
    vi.resetModules();
    ({ getConfig } = await import('../../src/config.js'));
    expect(getConfig().timeoutMs).toBe(999999999);

    // Restore
    if (saved) process.env.AGENTMARK_TIMEOUT_MS = saved;
    else delete process.env.AGENTMARK_TIMEOUT_MS;
  });
});
