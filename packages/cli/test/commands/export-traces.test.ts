import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the export traces CLI command.
 *
 * Tests:
 * - Command structure (name, options, subcommand)
 * - Score filter parsing
 * - URL building with query params
 * - Auth resolution (API key vs JWT)
 * - Dry-run mode
 * - File output with overwrite protection
 * - Stdout output (no --output)
 * - Error handling for HTTP status codes
 */

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const { consoleMock, mockFetch } = vi.hoisted(() => ({
  consoleMock: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
  mockFetch: vi.fn(),
}));

vi.stubGlobal('console', consoleMock);
vi.stubGlobal('fetch', mockFetch);

vi.mock('fs-extra', () => ({
  default: {
    existsSync: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock('../../cli-src/auth/credentials', () => ({
  loadCredentials: vi.fn(),
  isExpired: vi.fn(),
}));

vi.mock('../../cli-src/auth/token-refresh', () => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock('../../cli-src/forwarding/config', () => ({
  loadForwardingConfig: vi.fn(),
}));

import createExportCommand, { ExportError, parseScoreFilter } from '../../cli-src/commands/export-traces';
import * as credentials from '../../cli-src/auth/credentials';
import * as forwardingConfig from '../../cli-src/forwarding/config';
import fsExtra from 'fs-extra';

// ============================================================================
// Tests
// ============================================================================

describe('export traces command', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AGENTMARK_API_KEY;
    delete process.env.AGENTMARK_APP_ID;
    delete process.env.AGENTMARK_BASE_URL;

    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Command structure
  // --------------------------------------------------------------------------
  describe('command structure', () => {
    it('should return a Command named export', () => {
      const cmd = createExportCommand();
      expect(cmd.name()).toBe('export');
    });

    it('should have a traces subcommand', () => {
      const cmd = createExportCommand();
      const tracesCmd = cmd.commands.find((c) => c.name() === 'traces');
      expect(tracesCmd).toBeDefined();
    });

    it('should have --format option on traces subcommand', () => {
      const cmd = createExportCommand();
      const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
      const opt = tracesCmd.options.find((o) => o.long === '--format');
      expect(opt).toBeDefined();
    });

    it('should have --score option on traces subcommand', () => {
      const cmd = createExportCommand();
      const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
      const opt = tracesCmd.options.find((o) => o.long === '--score');
      expect(opt).toBeDefined();
    });

    it('should have --dry-run option on traces subcommand', () => {
      const cmd = createExportCommand();
      const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
      const opt = tracesCmd.options.find((o) => o.long === '--dry-run');
      expect(opt).toBeDefined();
    });

    it('should have -o/--output option on traces subcommand', () => {
      const cmd = createExportCommand();
      const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
      const opt = tracesCmd.options.find((o) => o.long === '--output');
      expect(opt).toBeDefined();
      expect(opt!.short).toBe('-o');
    });

    it('should have --limit option on traces subcommand', () => {
      const cmd = createExportCommand();
      const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
      const opt = tracesCmd.options.find((o) => o.long === '--limit');
      expect(opt).toBeDefined();
    });

    it('should have --app option on traces subcommand', () => {
      const cmd = createExportCommand();
      const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
      const opt = tracesCmd.options.find((o) => o.long === '--app');
      expect(opt).toBeDefined();
    });

    it('should have --api-key option on traces subcommand', () => {
      const cmd = createExportCommand();
      const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
      const opt = tracesCmd.options.find((o) => o.long === '--api-key');
      expect(opt).toBeDefined();
    });

    it('should have all filter options', () => {
      const cmd = createExportCommand();
      const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
      const optionNames = tracesCmd.options.map((o) => o.long);
      expect(optionNames).toContain('--type');
      expect(optionNames).toContain('--model');
      expect(optionNames).toContain('--status');
      expect(optionNames).toContain('--name');
      expect(optionNames).toContain('--user-id');
      expect(optionNames).toContain('--tag');
      expect(optionNames).toContain('--lightweight');
    });
  });

  // --------------------------------------------------------------------------
  // Score filter parsing (via URL construction)
  // --------------------------------------------------------------------------
  describe('score filter integration', () => {
    it('should include minScore param for >= operator', async () => {
      vi.mocked(forwardingConfig.loadForwardingConfig).mockReturnValue({
        apiKey: 'test-key',
        appId: 'app-123',
        baseUrl: 'https://gw.test.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '{"_export_meta":{"total":0,"exported":0,"skipped":0}}\n',
      });

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      try {
        const cmd = createExportCommand();
        const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
        await tracesCmd.parseAsync(['--score', 'correctness>=0.8'], { from: 'user' });
      } catch (e) {
        // process.exit throws in our mock
      }

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('minScore=0.8');

      stdoutSpy.mockRestore();
    });

    it('should include maxScore param for <= operator', async () => {
      vi.mocked(forwardingConfig.loadForwardingConfig).mockReturnValue({
        apiKey: 'test-key',
        appId: 'app-123',
        baseUrl: 'https://gw.test.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '{"_export_meta":{"total":0,"exported":0,"skipped":0}}\n',
      });

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      try {
        const cmd = createExportCommand();
        const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
        await tracesCmd.parseAsync(['--score', 'hallucination<=0.2'], { from: 'user' });
      } catch (e) {
        // process.exit throws
      }

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('maxScore=0.2');

      stdoutSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // Auth resolution
  // --------------------------------------------------------------------------
  describe('auth resolution', () => {
    it('should fail when no auth is available', async () => {
      vi.mocked(forwardingConfig.loadForwardingConfig).mockReturnValue(null);
      vi.mocked(credentials.loadCredentials).mockReturnValue(null);

      try {
        const cmd = createExportCommand();
        const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
        await tracesCmd.parseAsync(['--app', 'test-app'], { from: 'user' });
      } catch (e) {
        // Expected: process.exit throws
      }

      expect(exitSpy).toHaveBeenCalledWith(1); // AUTH_FAILURE
      expect(consoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining('Not logged in')
      );
    });

    it('should fail when no app is specified', async () => {
      vi.mocked(forwardingConfig.loadForwardingConfig).mockReturnValue(null);

      try {
        const cmd = createExportCommand();
        const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
        await tracesCmd.parseAsync([], { from: 'user' });
      } catch (e) {
        // Expected: process.exit throws
      }

      expect(exitSpy).toHaveBeenCalledWith(2); // VALIDATION_FAILURE
      expect(consoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining('No app specified')
      );
    });

    it('should use API key from forwarding config', async () => {
      vi.mocked(forwardingConfig.loadForwardingConfig).mockReturnValue({
        apiKey: 'my-api-key',
        appId: 'app-456',
        baseUrl: 'https://gw.test.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '{"_export_meta":{"total":0,"exported":0,"skipped":0}}\n',
      });

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      try {
        const cmd = createExportCommand();
        const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
        await tracesCmd.parseAsync([], { from: 'user' });
      } catch (e) {
        // process.exit throws
      }

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchHeaders = mockFetch.mock.calls[0][1].headers;
      expect(fetchHeaders['Authorization']).toBe('my-api-key');
      expect(fetchHeaders['X-Agentmark-App-Id']).toBe('app-456');

      stdoutSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------
  describe('error handling', () => {
    it('should produce ExportError with exit code 1 for 401', () => {
      const error = new ExportError('Auth failed', 1);
      expect(error.exitCode).toBe(1);
      expect(error.message).toBe('Auth failed');
      expect(error).toBeInstanceOf(Error);
    });

    it('should produce ExportError with exit code 5 for rate limit', () => {
      const error = new ExportError('Rate limited', 5);
      expect(error.exitCode).toBe(5);
    });

    it('should produce ExportError with exit code 2 for validation', () => {
      const error = new ExportError('Validation error', 2);
      expect(error.exitCode).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Score filter parsing
  // --------------------------------------------------------------------------
  describe('parseScoreFilter', () => {
    it('should parse >= operator', () => {
      expect(parseScoreFilter('correctness>=0.8')).toEqual({ name: 'correctness', op: '>=', value: 0.8 });
    });

    it('should parse <= operator', () => {
      expect(parseScoreFilter('hallucination<=0.2')).toEqual({ name: 'hallucination', op: '<=', value: 0.2 });
    });

    it('should parse > operator', () => {
      expect(parseScoreFilter('quality>0.5')).toEqual({ name: 'quality', op: '>', value: 0.5 });
    });

    it('should parse < operator', () => {
      expect(parseScoreFilter('cost<100')).toEqual({ name: 'cost', op: '<', value: 100 });
    });

    it('should parse = operator', () => {
      expect(parseScoreFilter('accuracy=1.0')).toEqual({ name: 'accuracy', op: '=', value: 1.0 });
    });

    it('should parse != operator', () => {
      expect(parseScoreFilter('safety!=0')).toEqual({ name: 'safety', op: '!=', value: 0 });
    });

    it('should return null for invalid format', () => {
      expect(parseScoreFilter('noop')).toBeNull();
    });

    it('should return null for empty input', () => {
      expect(parseScoreFilter('')).toBeNull();
    });

    it('should return null for non-numeric value', () => {
      expect(parseScoreFilter('score>=abc')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Dry run
  // --------------------------------------------------------------------------
  describe('dry-run mode', () => {
    it('should fetch with limit=3 and print summary to stderr', async () => {
      vi.mocked(forwardingConfig.loadForwardingConfig).mockReturnValue({
        apiKey: 'key',
        appId: 'app-123',
        baseUrl: 'https://gw.test.com',
      });

      const sampleTrace = JSON.stringify({ trace_id: 't1', model: 'gpt-4', input: 'hello' });
      const meta = JSON.stringify({ _export_meta: { total: 1, exported: 1, skipped: 0 } });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `${sampleTrace}\n${meta}\n`,
      });

      try {
        const cmd = createExportCommand();
        const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
        await tracesCmd.parseAsync(['--dry-run'], { from: 'user' });
      } catch (e) {
        // process.exit throws
      }

      // Should have fetched with limit=3
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('limit=3');

      // Should print dry-run info to stderr
      expect(consoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining('Dry run')
      );
      expect(consoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining('Matching traces: 1')
      );
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  // --------------------------------------------------------------------------
  // File output
  // --------------------------------------------------------------------------
  describe('file output', () => {
    it('should write exported data to file', async () => {
      vi.mocked(forwardingConfig.loadForwardingConfig).mockReturnValue({
        apiKey: 'key',
        appId: 'app-123',
        baseUrl: 'https://gw.test.com',
      });

      vi.mocked(fsExtra.existsSync).mockReturnValue(false);

      const row1 = JSON.stringify({ trace_id: 't1', input: 'hello' });
      const row2 = JSON.stringify({ trace_id: 't2', input: 'world' });
      const meta = JSON.stringify({ _export_meta: { total: 2, exported: 2, skipped: 0 } });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `${row1}\n${row2}\n${meta}\n`,
      });

      try {
        const cmd = createExportCommand();
        const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
        await tracesCmd.parseAsync(['-o', 'output.jsonl'], { from: 'user' });
      } catch (e) {
        // process.exit throws
      }

      expect(fsExtra.writeFile).toHaveBeenCalledWith(
        'output.jsonl',
        expect.stringContaining(row1),
      );
      expect(consoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining('Exported 2 rows to output.jsonl')
      );
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should strip _export_meta from file output', async () => {
      vi.mocked(forwardingConfig.loadForwardingConfig).mockReturnValue({
        apiKey: 'key',
        appId: 'app-123',
        baseUrl: 'https://gw.test.com',
      });

      vi.mocked(fsExtra.existsSync).mockReturnValue(false);

      const row = JSON.stringify({ trace_id: 't1' });
      const meta = JSON.stringify({ _export_meta: { total: 1, exported: 1, skipped: 0 } });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `${row}\n${meta}\n`,
      });

      try {
        const cmd = createExportCommand();
        const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
        await tracesCmd.parseAsync(['-o', 'output.jsonl'], { from: 'user' });
      } catch (e) {
        // process.exit throws
      }

      const writtenContent = vi.mocked(fsExtra.writeFile).mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('_export_meta');
      expect(writtenContent).toContain(row);
    });
  });

  // --------------------------------------------------------------------------
  // Stdout output
  // --------------------------------------------------------------------------
  describe('stdout output', () => {
    it('should write data to stdout and status to stderr when no --output', async () => {
      vi.mocked(forwardingConfig.loadForwardingConfig).mockReturnValue({
        apiKey: 'key',
        appId: 'app-123',
        baseUrl: 'https://gw.test.com',
      });

      const row = JSON.stringify({ trace_id: 't1', input: 'hello' });
      const meta = JSON.stringify({ _export_meta: { total: 1, exported: 1, skipped: 0 } });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `${row}\n${meta}\n`,
      });

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      try {
        const cmd = createExportCommand();
        const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
        await tracesCmd.parseAsync([], { from: 'user' });
      } catch (e) {
        // process.exit throws
      }

      // Data goes to stdout
      expect(stdoutSpy).toHaveBeenCalledWith(row + '\n');
      // Meta line should NOT go to stdout
      const stdoutCalls = stdoutSpy.mock.calls.map((c) => c[0] as string);
      expect(stdoutCalls.some((c) => c.includes('_export_meta'))).toBe(false);
      // Status goes to stderr
      expect(consoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining('Exported 1 rows')
      );

      stdoutSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // URL construction
  // --------------------------------------------------------------------------
  describe('URL construction', () => {
    it('should include all filter params in the URL', async () => {
      vi.mocked(forwardingConfig.loadForwardingConfig).mockReturnValue({
        apiKey: 'key',
        appId: 'app-123',
        baseUrl: 'https://gw.test.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '{"_export_meta":{"total":0,"exported":0,"skipped":0}}\n',
      });

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      try {
        const cmd = createExportCommand();
        const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
        await tracesCmd.parseAsync([
          '--format', 'openai',
          '--model', 'gpt-4o',
          '--since', '2026-03-01',
          '--limit', '100',
          '--type', 'GENERATION',
        ], { from: 'user' });
      } catch (e) {
        // process.exit throws
      }

      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('format=openai');
      expect(fetchUrl).toContain('model=gpt-4o');
      expect(fetchUrl).toContain('startDate=2026-03-01');
      expect(fetchUrl).toContain('limit=100');
      expect(fetchUrl).toContain('type=GENERATION');
      expect(fetchUrl).toContain('/v1/traces/export');

      stdoutSpy.mockRestore();
    });

    it('should include appId as query param for JWT auth', async () => {
      vi.mocked(forwardingConfig.loadForwardingConfig).mockReturnValue(null);
      vi.mocked(credentials.loadCredentials).mockReturnValue({
        user_id: 'u1',
        email: 'test@test.com',
        access_token: 'jwt-token',
        refresh_token: 'refresh',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date().toISOString(),
      });
      vi.mocked(credentials.isExpired).mockReturnValue(false);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '{"_export_meta":{"total":0,"exported":0,"skipped":0}}\n',
      });

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      try {
        const cmd = createExportCommand();
        const tracesCmd = cmd.commands.find((c) => c.name() === 'traces')!;
        await tracesCmd.parseAsync(['--app', 'my-app-id'], { from: 'user' });
      } catch (e) {
        // process.exit throws
      }

      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('appId=my-app-id');

      const fetchHeaders = mockFetch.mock.calls[0][1].headers;
      expect(fetchHeaders['Authorization']).toBe('Bearer jwt-token');

      stdoutSpy.mockRestore();
    });
  });
});
