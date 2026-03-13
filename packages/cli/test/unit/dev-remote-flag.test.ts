import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the --remote flag in agentmark dev
 *
 * Tests:
 * - Flag resolution: --remote, --no-forward combinations
 * - Inline login is called when --remote is used
 * - Graceful degradation when login fails
 * - Forwarding is only enabled with --remote
 */

// ── Hoisted mocks (available inside vi.mock factories) ─────────────────────

const {
  mockLogin,
  mockSpawn,
  mockCreateApiServer,
  mockSetForwarder,
  mockLoadLocalConfig,
  mockLoadForwardingConfig,
  mockAttemptAutoLink,
  consoleMock,
} = vi.hoisted(() => {
  const consoleMock = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
  return {
    mockLogin: vi.fn().mockResolvedValue(undefined),
    mockSpawn: vi.fn().mockReturnValue({
      pid: 1234,
      exitCode: null,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
    }),
    mockCreateApiServer: vi.fn().mockResolvedValue({
      close: vi.fn((cb?: () => void) => cb?.()),
      closeAllConnections: vi.fn(),
    }),
    mockSetForwarder: vi.fn(),
    mockLoadLocalConfig: vi.fn().mockReturnValue({
      webhookSecret: 'test-secret',
      createdAt: new Date().toISOString(),
    }),
    mockLoadForwardingConfig: vi.fn().mockReturnValue(null),
    mockAttemptAutoLink: vi.fn().mockResolvedValue(undefined),
    consoleMock,
  };
});

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../../cli-src/commands/login', () => ({
  default: mockLogin,
}));

vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return { ...actual, spawn: (...args: any[]) => mockSpawn(...args) };
});

vi.mock('../../cli-src/api-server', () => ({
  createApiServer: (...args: any[]) => mockCreateApiServer(...args),
  setForwarder: (...args: any[]) => mockSetForwarder(...args),
}));

vi.mock('../../cli-src/config', () => ({
  loadLocalConfig: (...args: any[]) => mockLoadLocalConfig(...args),
  setAppPort: vi.fn(),
}));

vi.mock('../../cli-src/forwarding/config', () => ({
  loadForwardingConfig: (...args: any[]) => mockLoadForwardingConfig(...args),
  isKeyExpired: vi.fn().mockReturnValue(false),
  saveForwardingConfig: vi.fn(),
}));

vi.mock('../../cli-src/forwarding/forwarder', () => ({
  TraceForwarder: vi.fn().mockImplementation(() => ({
    enqueue: vi.fn(),
    flush: vi.fn().mockResolvedValue(0),
    stop: vi.fn(),
  })),
}));

vi.mock('../../cli-src/forwarding/status', () => ({
  ForwardingStatusReporter: vi.fn().mockImplementation(() => ({
    stop: vi.fn(),
  })),
}));

vi.mock('../../cli-src/auth/auto-link', () => ({
  attemptAutoLink: (...args: any[]) => mockAttemptAutoLink(...args),
}));

vi.mock('../../cli-src/auth/credentials', () => ({
  loadCredentials: vi.fn().mockReturnValue(null),
}));

vi.mock('../../cli-src/auth/constants', () => ({
  DEFAULT_PLATFORM_URL: 'https://app.agentmark.co',
  DEFAULT_API_URL: 'https://api.agentmark.co',
}));

vi.mock('../../cli-src/utils/platform', () => ({
  IS_WINDOWS: false,
  killProcessTree: vi.fn(),
  getPythonPaths: vi.fn().mockReturnValue({
    binDir: 'bin',
    pythonExe: 'python3',
    pythonCmd: 'python3',
  }),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  const mockExistsSync = vi.fn().mockImplementation((p: string) => {
    if (p.endsWith('agentmark.client.ts')) return true;
    if (p.endsWith('dev-entry.ts') && !p.includes('.agentmark')) return true;
    return false;
  });
  return {
    ...actual,
    default: { ...(actual as any).default, existsSync: mockExistsSync },
    existsSync: mockExistsSync,
  };
});

vi.mock('net', async () => {
  const actual = await vi.importActual('net');
  const makeServer = () => ({
    once: vi.fn().mockReturnThis(),
    listen: vi.fn().mockImplementation(function (this: any) {
      const listeningCb = this.once.mock.calls.find(
        (c: any[]) => c[0] === 'listening'
      )?.[1];
      if (listeningCb) setTimeout(() => listeningCb(), 0);
      return this;
    }),
    close: vi.fn((cb?: () => void) => cb?.()),
  });
  return {
    ...actual,
    default: { ...(actual as any).default, createServer: vi.fn(makeServer) },
    createServer: vi.fn(makeServer),
  };
});

// Suppress console output during tests
vi.stubGlobal('console', consoleMock);

// Mock process.exit to prevent test runner from actually exiting
const originalExit = process.exit;
const originalOn = process.on;
process.exit = vi.fn() as any;
process.on = vi.fn() as any;

// ── Import after mocks ─────────────────────────────────────────────────────

import dev from '../../cli-src/commands/dev';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function runDevWithTimeout(options: Parameters<typeof dev>[0]) {
  vi.useFakeTimers();
  const devPromise = dev(options);
  await vi.advanceTimersByTimeAsync(4000);
  vi.useRealTimers();
  return devPromise;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('dev --remote flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-mock process methods (afterEach restores originals)
    process.exit = vi.fn() as any;
    process.on = vi.fn() as any;
    // Restore mock return values cleared by clearAllMocks
    mockLogin.mockResolvedValue(undefined);
    mockCreateApiServer.mockResolvedValue({
      close: vi.fn((cb?: () => void) => cb?.()),
      closeAllConnections: vi.fn(),
    });
    mockSpawn.mockReturnValue({
      pid: 1234,
      exitCode: null,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
    });
    mockLoadLocalConfig.mockReturnValue({
      webhookSecret: 'test-secret',
      createdAt: new Date().toISOString(),
    });
    mockLoadForwardingConfig.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore process methods (mocked at module level)
    process.exit = originalExit;
    process.on = originalOn;
  });

  describe('flag resolution', () => {
    it('default: no forwarding', async () => {
      await runDevWithTimeout({});

      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockAttemptAutoLink).not.toHaveBeenCalled();
    });

    it('--remote: calls login, enables forwarding', async () => {
      await runDevWithTimeout({ remote: true });

      expect(mockLogin).toHaveBeenCalledOnce();
      expect(mockAttemptAutoLink).toHaveBeenCalledOnce();
    });

    it('--remote --no-forward (forward=false): calls login but no forwarding', async () => {
      await runDevWithTimeout({ remote: true, forward: false });

      expect(mockLogin).toHaveBeenCalledOnce();
      expect(mockAttemptAutoLink).not.toHaveBeenCalled();
      expect(mockSetForwarder).not.toHaveBeenCalled();
    });
  });

  describe('inline login', () => {
    it('gracefully degrades to local-only when login fails', async () => {
      mockLogin.mockRejectedValue(new Error('network error'));

      await runDevWithTimeout({ remote: true });

      expect(mockLogin).toHaveBeenCalledOnce();
      expect(consoleMock.log).toHaveBeenCalledWith(
        expect.stringContaining('Login failed')
      );
      // No forwarding after login failure
      expect(mockAttemptAutoLink).not.toHaveBeenCalled();
    });

    it('does not call login when --remote is not set', async () => {
      await runDevWithTimeout({});
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe('forwarding setup with --remote', () => {
    it('creates forwarder when forwarding config exists', async () => {
      mockLoadForwardingConfig.mockReturnValue({
        apiKey: 'test-key',
        baseUrl: 'https://app.agentmark.co',
        appId: 'app-123',
        appName: 'Test App',
        tenantId: 'tenant-123',
      });

      await runDevWithTimeout({ remote: true });

      expect(mockSetForwarder).toHaveBeenCalledOnce();
    });

    it('attempts auto-link when no forwarding config', async () => {
      mockLoadForwardingConfig.mockReturnValue(null);

      await runDevWithTimeout({ remote: true });

      expect(mockAttemptAutoLink).toHaveBeenCalledOnce();
    });

    it('skips forwarding entirely without --remote', async () => {
      mockLoadForwardingConfig.mockReturnValue({
        apiKey: 'test-key',
        baseUrl: 'https://app.agentmark.co',
        appId: 'app-123',
        appName: 'Test App',
        tenantId: 'tenant-123',
      });

      await runDevWithTimeout({});

      expect(mockSetForwarder).not.toHaveBeenCalled();
      expect(mockAttemptAutoLink).not.toHaveBeenCalled();
    });
  });

  describe('banner output', () => {
    it('shows local mode message when running locally', async () => {
      await runDevWithTimeout({});

      expect(consoleMock.log).toHaveBeenCalledWith(
        expect.stringContaining('local mode')
      );
    });

    it('shows Remote section when --remote is used', async () => {
      await runDevWithTimeout({ remote: true });

      expect(consoleMock.log).toHaveBeenCalledWith(
        expect.stringContaining('Remote:')
      );
    });
  });
});
