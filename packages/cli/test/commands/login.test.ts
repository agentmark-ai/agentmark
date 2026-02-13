import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import login from '../../cli-src/commands/login';
import * as credentials from '../../cli-src/auth/credentials';
import * as pkce from '../../cli-src/auth/pkce';
import * as callbackServer from '../../cli-src/auth/callback-server';
import * as tokenRefresh from '../../cli-src/auth/token-refresh';
import type { CliAuthCredentials } from '../../cli-src/auth/types';

/**
 * Unit tests for login command (T025)
 * Feature: 013-trace-tunnel
 *
 * Tests:
 * - PKCE flow initiation
 * - Callback handling
 * - Token exchange
 * - Credential save
 * - Already-logged-in skip
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

// Mock fetch globally
global.fetch = vi.fn();

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
      // Mock valid existing credentials
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

  describe('PKCE flow initiation', () => {
    it('should generate PKCE challenge and state', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generatePKCE').mockReturnValue({
        verifier: 'test_verifier',
        challenge: 'test_challenge',
      });
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');

      const mockClose = vi.fn();
      const mockWaitForCallback = vi.fn().mockResolvedValue({
        code: 'auth_code_123',
        state: 'test_state',
      });

      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: mockWaitForCallback,
        close: mockClose,
      });

      // Mock successful token exchange
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new_token',
          refresh_token: 'new_refresh',
          expires_in: 3600,
          user: {
            id: 'user-abc',
            email: 'new@example.com',
          },
        }),
      });

      vi.spyOn(credentials, 'saveCredentials').mockImplementation(() => {});

      await login();

      expect(pkce.generatePKCE).toHaveBeenCalled();
      expect(pkce.generateState).toHaveBeenCalled();
      expect(callbackServer.startCallbackServer).toHaveBeenCalled();
    });
  });

  describe('callback handling', () => {
    it('should wait for callback and receive auth code', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generatePKCE').mockReturnValue({
        verifier: 'test_verifier',
        challenge: 'test_challenge',
      });
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');

      const mockClose = vi.fn();
      const mockWaitForCallback = vi.fn().mockResolvedValue({
        code: 'auth_code_from_callback',
        state: 'test_state',
      });

      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: mockWaitForCallback,
        close: mockClose,
      });

      // Mock successful token exchange
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new_token',
          refresh_token: 'new_refresh',
          expires_in: 3600,
          user: {
            id: 'user-abc',
            email: 'new@example.com',
          },
        }),
      });

      vi.spyOn(credentials, 'saveCredentials').mockImplementation(() => {});

      await login();

      expect(mockWaitForCallback).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/v1/token?grant_type=pkce'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('auth_code_from_callback'),
        })
      );
    });
  });

  describe('token exchange', () => {
    it('should exchange auth code for access and refresh tokens', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generatePKCE').mockReturnValue({
        verifier: 'test_verifier',
        challenge: 'test_challenge',
      });
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');

      const mockClose = vi.fn();
      const mockWaitForCallback = vi.fn().mockResolvedValue({
        code: 'auth_code_123',
        state: 'test_state',
      });

      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: mockWaitForCallback,
        close: mockClose,
      });

      const tokenResponse = {
        access_token: 'exchanged_access_token',
        refresh_token: 'exchanged_refresh_token',
        expires_in: 7200,
        user: {
          id: 'user-xyz',
          email: 'exchanged@example.com',
        },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => tokenResponse,
      });

      const saveSpy = vi
        .spyOn(credentials, 'saveCredentials')
        .mockImplementation(() => {});

      await login();

      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-xyz',
          email: 'exchanged@example.com',
          access_token: 'exchanged_access_token',
          refresh_token: 'exchanged_refresh_token',
        })
      );
      expect(mockClose).toHaveBeenCalled();
    });

    it('should throw error when token exchange fails', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generatePKCE').mockReturnValue({
        verifier: 'test_verifier',
        challenge: 'test_challenge',
      });
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');

      const mockClose = vi.fn();
      const mockWaitForCallback = vi.fn().mockResolvedValue({
        code: 'bad_code',
        state: 'test_state',
      });

      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: mockWaitForCallback,
        close: mockClose,
      });

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid auth code',
      });

      await expect(login()).rejects.toThrow('Failed to exchange auth code');
      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('credential save', () => {
    it('should save credentials to disk after successful login', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generatePKCE').mockReturnValue({
        verifier: 'test_verifier',
        challenge: 'test_challenge',
      });
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');

      const mockClose = vi.fn();
      const mockWaitForCallback = vi.fn().mockResolvedValue({
        code: 'auth_code',
        state: 'test_state',
      });

      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: mockWaitForCallback,
        close: mockClose,
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 3600,
          user: { id: 'user-id', email: 'user@example.com' },
        }),
      });

      const saveSpy = vi
        .spyOn(credentials, 'saveCredentials')
        .mockImplementation(() => {});

      await login();

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-id',
          email: 'user@example.com',
          access_token: 'token',
          refresh_token: 'refresh',
        })
      );
      expect(consoleMock.log).toHaveBeenCalledWith(
        '\n✓ Logged in as user@example.com'
      );
    });
  });

  describe('timeout handling', () => {
    it('should exit with error message when login times out', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(pkce, 'generatePKCE').mockReturnValue({
        verifier: 'test_verifier',
        challenge: 'test_challenge',
      });
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');

      const mockWaitForCallback = vi
        .fn()
        .mockRejectedValue(new Error('Callback timed out after 30s'));

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
      vi.spyOn(pkce, 'generatePKCE').mockReturnValue({
        verifier: 'test_verifier',
        challenge: 'test_challenge',
      });
      vi.spyOn(pkce, 'generateState').mockReturnValue('test_state');

      const mockClose = vi.fn();
      const mockWaitForCallback = vi.fn().mockResolvedValue({
        code: 'auth_code',
        state: 'test_state',
      });

      vi.spyOn(callbackServer, 'startCallbackServer').mockResolvedValue({
        port: 54321,
        waitForCallback: mockWaitForCallback,
        close: mockClose,
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 3600,
          user: { id: 'user-id', email: 'user@example.com' },
        }),
      });

      vi.spyOn(credentials, 'saveCredentials').mockImplementation(() => {});

      await login({
        baseUrl: 'https://custom.example.com',
        supabaseUrl: 'https://custom-supabase.example.com',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('custom-supabase.example.com'),
        expect.any(Object)
      );
    });
  });
});
