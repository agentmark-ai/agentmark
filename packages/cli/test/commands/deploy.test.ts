import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the deploy CLI command.
 *
 * Tests:
 * - Command structure (name, options)
 * - EXIT_CODES enum values
 * - Auth resolution priority
 * - Dry-run mode
 * - API error response mapping
 */

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const { consoleMock, mockFetch } = vi.hoisted(() => ({
  consoleMock: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
  mockFetch: vi.fn(),
}));

vi.stubGlobal('console', consoleMock);
vi.stubGlobal('fetch', mockFetch);

// Mock fs-extra for file system operations
vi.mock('fs-extra', () => ({
  default: {
    existsSync: vi.fn(),
    readJsonSync: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}));

// Mock auth modules
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

import fsExtra from 'fs-extra';
import createDeployCommand, { EXIT_CODES } from '../../cli-src/commands/deploy';
import * as credentials from '../../cli-src/auth/credentials';

// ============================================================================
// Tests
// ============================================================================

describe('deploy command', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AGENTMARK_API_KEY;
    delete process.env.AGENTMARK_APP_ID;
    delete process.env.AGENTMARK_BASE_URL;

    // Default: process.exit throws so we can catch it
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
  describe('createDeployCommand structure', () => {
    it('should return a Command named deploy', () => {
      const cmd = createDeployCommand();
      expect(cmd.name()).toBe('deploy');
    });

    it('should have --app-id option', () => {
      const cmd = createDeployCommand();
      const opt = cmd.options.find((o) => o.long === '--app-id');
      expect(opt).toBeDefined();
    });

    it('should have --api-key option', () => {
      const cmd = createDeployCommand();
      const opt = cmd.options.find((o) => o.long === '--api-key');
      expect(opt).toBeDefined();
    });

    it('should have -m/--message option', () => {
      const cmd = createDeployCommand();
      const opt = cmd.options.find((o) => o.long === '--message');
      expect(opt).toBeDefined();
      expect(opt!.short).toBe('-m');
    });

    it('should have --dry-run option', () => {
      const cmd = createDeployCommand();
      const opt = cmd.options.find((o) => o.long === '--dry-run');
      expect(opt).toBeDefined();
    });

    it('should have --base-url option', () => {
      const cmd = createDeployCommand();
      const opt = cmd.options.find((o) => o.long === '--base-url');
      expect(opt).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // EXIT_CODES
  // --------------------------------------------------------------------------
  describe('EXIT_CODES', () => {
    it('should export SUCCESS as 0', () => {
      expect(EXIT_CODES.SUCCESS).toBe(0);
    });

    it('should export AUTH_FAILURE as 1', () => {
      expect(EXIT_CODES.AUTH_FAILURE).toBe(1);
    });

    it('should export VALIDATION_FAILURE as 2', () => {
      expect(EXIT_CODES.VALIDATION_FAILURE).toBe(2);
    });

    it('should export PERMISSION_DENIED as 3', () => {
      expect(EXIT_CODES.PERMISSION_DENIED).toBe(3);
    });

    it('should export DEPLOYMENT_CONFLICT as 4', () => {
      expect(EXIT_CODES.DEPLOYMENT_CONFLICT).toBe(4);
    });

    it('should export SERVER_ERROR as 5', () => {
      expect(EXIT_CODES.SERVER_ERROR).toBe(5);
    });
  });

  // --------------------------------------------------------------------------
  // Auth resolution
  // --------------------------------------------------------------------------
  describe('auth resolution', () => {
    it('should use --api-key flag over env var', async () => {
      process.env.AGENTMARK_API_KEY = 'sk_env_should_not_use';
      process.env.AGENTMARK_APP_ID = 'app-test';

      setupFileMocks();
      mockFetch.mockResolvedValue({
        status: 202,
        json: async () => ({ deployment_id: 'dep-1' }),
      });

      const cmd = createDeployCommand();
      // 202 success still calls process.exit(0) which throws in our mock
      await expect(
        cmd.parseAsync(['node', 'agentmark', '--api-key', 'sk_flag_key']),
      ).rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_flag_key',
          }),
        }),
      );
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
    });

    it('should use AGENTMARK_API_KEY env var when no flag', async () => {
      process.env.AGENTMARK_API_KEY = 'sk_env_key';
      process.env.AGENTMARK_APP_ID = 'app-test';

      setupFileMocks();
      mockFetch.mockResolvedValue({
        status: 202,
        json: async () => ({ deployment_id: 'dep-2' }),
      });

      const cmd = createDeployCommand();
      await expect(cmd.parseAsync(['node', 'agentmark'])).rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_env_key',
          }),
        }),
      );
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
    });

    it('should exit with AUTH_FAILURE when no auth is available', async () => {
      vi.mocked(credentials.loadCredentials).mockReturnValue(null);

      const cmd = createDeployCommand();
      await expect(cmd.parseAsync(['node', 'agentmark'])).rejects.toThrow();

      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.AUTH_FAILURE);
    });
  });

  // --------------------------------------------------------------------------
  // Base URL resolution
  // --------------------------------------------------------------------------
  describe('base URL resolution', () => {
    it('should use DEFAULT_PLATFORM_URL when no flag or env var', async () => {
      process.env.AGENTMARK_API_KEY = 'sk_test';
      process.env.AGENTMARK_APP_ID = 'app-test';

      setupFileMocks();
      mockFetch.mockResolvedValue({
        status: 202,
        json: async () => ({ deployment_id: 'dep-3' }),
      });

      const cmd = createDeployCommand();
      await expect(cmd.parseAsync(['node', 'agentmark'])).rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.agentmark.co/api/cli/deploy',
        expect.any(Object),
      );
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
    });

    it('should use --base-url flag when provided', async () => {
      process.env.AGENTMARK_API_KEY = 'sk_test';
      process.env.AGENTMARK_APP_ID = 'app-test';

      setupFileMocks();
      mockFetch.mockResolvedValue({
        status: 202,
        json: async () => ({ deployment_id: 'dep-4' }),
      });

      const cmd = createDeployCommand();
      await expect(
        cmd.parseAsync(['node', 'agentmark', '--base-url', 'https://staging.agentmark.co']),
      ).rejects.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://staging.agentmark.co/api/cli/deploy',
        expect.any(Object),
      );
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
    });
  });

  // --------------------------------------------------------------------------
  // Dry-run mode
  // --------------------------------------------------------------------------
  describe('dry-run mode', () => {
    it('should list files without calling fetch and exit 0', async () => {
      process.env.AGENTMARK_API_KEY = 'sk_test';
      process.env.AGENTMARK_APP_ID = 'app-test';

      setupFileMocks();

      const cmd = createDeployCommand();
      await expect(
        cmd.parseAsync(['node', 'agentmark', '--dry-run']),
      ).rejects.toThrow();

      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(consoleMock.log).toHaveBeenCalledWith(
        expect.stringContaining('Dry run complete'),
      );
    });
  });

  // --------------------------------------------------------------------------
  // API error responses
  // --------------------------------------------------------------------------
  describe('API error responses', () => {
    it('should exit with AUTH_FAILURE when API returns 401', async () => {
      await runDeployWithStatus(401, { error: 'Unauthorized' });
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.AUTH_FAILURE);
    });

    it('should exit with PERMISSION_DENIED when API returns 403', async () => {
      await runDeployWithStatus(403, { error: 'Forbidden' });
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.PERMISSION_DENIED);
    });

    it('should exit with DEPLOYMENT_CONFLICT when API returns 409', async () => {
      await runDeployWithStatus(409, { error: 'Deployment in progress' });
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.DEPLOYMENT_CONFLICT);
    });

    it('should exit with VALIDATION_FAILURE when API returns 422', async () => {
      await runDeployWithStatus(422, { error: 'Validation failed', details: ['bad file'] });
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.VALIDATION_FAILURE);
    });

    it('should exit with SERVER_ERROR when API returns 500', async () => {
      process.env.AGENTMARK_API_KEY = 'sk_test';
      process.env.AGENTMARK_APP_ID = 'app-test';
      setupFileMocks();
      mockFetch.mockResolvedValue({
        status: 500,
        text: async () => 'Internal server error',
      });

      const cmd = createDeployCommand();
      await expect(cmd.parseAsync(['node', 'agentmark'])).rejects.toThrow();

      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.SERVER_ERROR);
    });
  });
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sets up file system mocks for a project with one .prompt.mdx file.
 * The deploy command reads agentmark.json, then finds .prompt.mdx files
 * in the agentmark/ directory.
 */
function setupFileMocks() {
  const fs = vi.mocked(fsExtra);

  // agentmark.json exists, puzzlet.json does not
  (fs.existsSync as any).mockImplementation((p: string) => {
    if (typeof p === 'string' && p.endsWith('agentmark.json')) return true;
    // The agentmark/ source directory exists (handle both / and \ for Windows)
    if (typeof p === 'string' && (p.endsWith('/agentmark') || p.endsWith('\\agentmark'))) return true;
    return false;
  });

  (fs.readJsonSync as any).mockReturnValue({ agentmarkPath: '.' });

  // readdir returns a .prompt.mdx file (as Dirent-like objects)
  (fs.readdir as any).mockResolvedValue([
    {
      name: 'hello.prompt.mdx',
      isDirectory: () => false,
      isFile: () => true,
    },
  ]);

  (fs.readFile as any).mockResolvedValue('---\nmodel: gpt-4\n---\nHello world');
}

/**
 * Runs deploy with a mock API response at the given HTTP status.
 * Uses json() for 4xx responses, text() for 5xx.
 */
async function runDeployWithStatus(status: number, body: Record<string, unknown>) {
  process.env.AGENTMARK_API_KEY = 'sk_test';
  process.env.AGENTMARK_APP_ID = 'app-test';
  setupFileMocks();

  mockFetch.mockResolvedValue({
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  const cmd = createDeployCommand();
  await expect(cmd.parseAsync(['node', 'agentmark'])).rejects.toThrow();
}
