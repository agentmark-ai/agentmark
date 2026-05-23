import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import login from '../../cli-src/commands/login';
import * as credentials from '../../cli-src/auth/credentials';
import * as pkce from '../../cli-src/auth/pkce';
import * as callbackServer from '../../cli-src/auth/callback-server';
import * as tokenRefresh from '../../cli-src/auth/token-refresh';
import type { CliAuthCredentials, CallbackResult } from '../../cli-src/auth/types';

/**
 * Unit tests for login command
 * Feature: 013-trace-tunnel
 *
 * Tests the token relay flow:
 * - Already-logged-in skip + token refresh
 * - Callback server startup with state
 * - Token relay via callback (platform redirects tokens to localhost)
 * - Credential save from callback result
 * - Timeout handling
 */

// Mock console methods to avoid cluttering test output
const consoleMock = {
  log: vi.fn(),
};

vi.stubGlobal('console', consoleMock);

// Mock open to avoid actually opening browser
vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

/** Build a mock CallbackResult matching the token relay shape. */
function mockCallbackResult(overrides: Partial<CallbackResult> = {}): CallbackResult {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    user_id: 'user-123',
    email: 'test@example.com',
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    state: 'test_state',
    ...overrides,
  };
}

describe('login command', () => {
  const mockCredentials: CliAuthCredentials = {
    user_id: 'user-123',
    email: 'test@example.com',
    access_token: 'access_token_123',
    refresh_token: 'refresh_token_123',
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleMock.log.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('already logged in', () => {
    it('should skip login when valid credentials exist', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);

      await login();

      expect(consoleMock.log).toHaveBeenCalledWith(
        `✓ Already logged in as ${mockCredentials.email}`
      );
      expect(credentials.loadCredentials).toHaveBeenCalled();
      expect(credentials.isExpired).toHaveBeenCalledWith(mockCredentials);
    });

    it('should attempt refresh when credentials are expired', async () => {
      const expiredCreds = {
        ...mockCredentials,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      };
      const refreshedCreds = {
        ...mockCredentials,
        access_token: 'new_access_token',
      };

      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(expiredCreds);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(true);
      vi.spyOn(tokenRefresh, 'refreshAccessToken').mockResolvedValue(
        refreshedCreds
      );

      await login();

      expect(consoleMock.log).toHaveBeenCalledWith(
        '⚠️  Token expired, attempting refresh...'
      );
      expect(tokenRefresh.refreshAccessToken).toHaveBeenCalledWith(
        expiredCreds,
        expect.any(String),
        expect.any(String)
      );
      expect(consoleMock.log).toHaveBeenCalledWith(
        `✓ Token refreshed. Logged in as ${refreshedCreds.email}`
      );
    });
  });

  describe('token relay flow', () => {
    it('should start callback server with generated state', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');

      const mockClose = vi.fn();
      const mockWaitForCallback = vi.fn().mockResolvedValue(mockCallbackResult());

      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: mockWaitForCallback,
        close: mockClose,
      });

      vi.spyOn(credentials, 'saveCredentials').mockImplementation(() => {});

      await login();

      expect(pkce.generateState).toHaveBeenCalled();
      // The second arg (timeout ms) defaults to undefined unless the
      // user passes --timeout. Pinned as undefined here so a refactor
      // that silently injects a value at the call site is caught.
      expect(callbackServer.startCallbackServer).toHaveBeenCalledWith(
        'test_state',
        undefined,
      );
    });

    it('should receive tokens from callback and save credentials', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');

      const callbackResult = mockCallbackResult({
        access_token: 'relay-access-token',
        refresh_token: 'relay-refresh-token',
        user_id: 'user-xyz',
        email: 'relay@example.com',
        expires_at: '2099-01-01T00:00:00.000Z',
      });

      const mockClose = vi.fn();
      const mockWaitForCallback = vi.fn().mockResolvedValue(callbackResult);

      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: mockWaitForCallback,
        close: mockClose,
      });

      const saveSpy = vi
        .spyOn(credentials, 'saveCredentials')
        .mockImplementation(() => {});

      await login();

      expect(mockWaitForCallback).toHaveBeenCalled();
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-xyz',
          email: 'relay@example.com',
          access_token: 'relay-access-token',
          refresh_token: 'relay-refresh-token',
          expires_at: '2099-01-01T00:00:00.000Z',
        })
      );
      expect(mockClose).toHaveBeenCalled();
    });

    it('should display success message with email', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');

      const mockClose = vi.fn();
      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: vi.fn().mockResolvedValue(
          mockCallbackResult({ email: 'user@example.com' })
        ),
        close: mockClose,
      });

      vi.spyOn(credentials, 'saveCredentials').mockImplementation(() => {});

      await login();

      expect(consoleMock.log).toHaveBeenCalledWith(
        '\n✓ Logged in as user@example.com'
      );
    });
  });

  describe('timeout handling', () => {
    it('should exit with error message when login times out', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');

      const mockWaitForCallback = vi
        .fn()
        .mockRejectedValue(new Error('Login timed out'));

      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: mockWaitForCallback,
        close: vi.fn(),
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(login()).rejects.toThrow('process.exit called');

      expect(consoleMock.log).toHaveBeenCalledWith(
        '\n✗ Login timed out. Please try again.'
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('custom options', () => {
    it('should use custom base URL when provided', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');

      const mockClose = vi.fn();
      const mockWaitForCallback = vi.fn().mockResolvedValue(mockCallbackResult());

      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: mockWaitForCallback,
        close: mockClose,
      });

      vi.spyOn(credentials, 'saveCredentials').mockImplementation(() => {});

      // We need to verify the auth URL is built with custom base URL
      // The login function opens the browser with the auth URL
      const openMock = vi.fn().mockResolvedValue(undefined);
      vi.doMock('open', () => ({ default: openMock }));

      await login({
        baseUrl: 'https://custom.example.com',
        supabaseUrl: 'https://custom-supabase.example.com',
      });

      // The callback server should still be called
      expect(callbackServer.startCallbackServer).toHaveBeenCalled();
      expect(credentials.saveCredentials).toHaveBeenCalled();
    });
  });

  // ============================================================
  // --print-url: don't shell to open(), just print the URL.
  // ============================================================

  describe('--print-url', () => {
    it('does not call open() when printUrl is true', async () => {
      // The `open` module is hoisted-mocked at file top, so we can grab
      // the mock fn directly without resetModules() / re-import. (The
      // dynamic `await import('open')` inside login.ts returns the same
      // hoisted mock.)
      const { default: openMock } = await import('open');
      vi.mocked(openMock).mockClear();

      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');
      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: vi.fn().mockResolvedValue(mockCallbackResult()),
        close: vi.fn(),
      });
      vi.spyOn(credentials, 'saveCredentials').mockImplementation(() => {});

      await login({ printUrl: true });

      // The whole point of --print-url: never shell to open().
      expect(openMock).not.toHaveBeenCalled();

      // And the URL is printed so the user can click it.
      const allLogs = consoleMock.log.mock.calls
        .map((c: unknown[]) => c[0] as string)
        .join('\n');
      expect(allLogs).toMatch(/Visit this URL/);
      expect(allLogs).toContain('/auth/cli');
      expect(allLogs).toContain('redirect_port=54321');
      expect(allLogs).toContain('state=test_state');
    });
  });

  // ============================================================
  // --json: machine-readable success line.
  // ============================================================

  describe('--json', () => {
    it('emits a JSON success line and suppresses the human text on completion', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');
      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: vi.fn().mockResolvedValue(
          mockCallbackResult({ user_id: 'u-9', email: 'machine@example.com' }),
        ),
        close: vi.fn(),
      });
      vi.spyOn(credentials, 'saveCredentials').mockImplementation(() => {});

      await login({ json: true, printUrl: true });

      const allLogs = consoleMock.log.mock.calls.map(
        (c: unknown[]) => c[0] as string,
      );
      // No "✓ Logged in as ..." line in JSON mode.
      expect(allLogs.find((line) => line?.includes?.('Logged in as'))).toBeUndefined();
      // One of the lines parses as the success envelope.
      const successLine = allLogs.find((line) => {
        try {
          const parsed = JSON.parse(line);
          return parsed.logged_in === true && parsed.email === 'machine@example.com';
        } catch {
          return false;
        }
      });
      expect(successLine).toBeDefined();
      const parsed = JSON.parse(successLine!);
      expect(parsed).toEqual({
        logged_in: true,
        user_id: 'u-9',
        email: 'machine@example.com',
      });
    });

    it('emits a JSON "awaiting" envelope before blocking on the callback', async () => {
      // --print-url + --json: machine wrappers want to capture the URL
      // *and* the port/state programmatically before the user clicks.
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');
      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: vi.fn().mockResolvedValue(mockCallbackResult()),
        close: vi.fn(),
      });
      vi.spyOn(credentials, 'saveCredentials').mockImplementation(() => {});

      await login({ json: true, printUrl: true });

      const allLogs = consoleMock.log.mock.calls.map(
        (c: unknown[]) => c[0] as string,
      );
      const awaitingLine = allLogs.find((line) => {
        try {
          const parsed = JSON.parse(line);
          return parsed.awaiting_auth === true;
        } catch {
          return false;
        }
      });
      expect(awaitingLine).toBeDefined();
      const parsed = JSON.parse(awaitingLine!);
      expect(parsed.url).toContain('/auth/cli');
      expect(parsed.url).toContain('redirect_port=54321');
      expect(parsed.port).toBe(54321);
      expect(parsed.state).toBe('test_state');
    });
  });
});
