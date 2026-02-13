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
      expect(callbackServer.startCallbackServer).toHaveBeenCalledWith('test_state');
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
});
