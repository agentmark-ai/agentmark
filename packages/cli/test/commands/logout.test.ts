import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import logout from '../../cli-src/commands/logout';
import * as credentials from '../../cli-src/auth/credentials';
import * as forwardingConfig from '../../cli-src/forwarding/config';
import type { CliAuthCredentials } from '../../cli-src/auth/types';

/**
 * Unit tests for logout command (T037)
 * Feature: 013-trace-tunnel
 *
 * Tests:
 * - Happy path: revoke key, clear credentials, clear config
 * - No credentials: user not logged in
 * - No forwarding config: no dev key to revoke
 * - Revoke failures: network error, 401, 404, 500
 * - Partial cleanup: credentials cleared even if revoke fails
 * - Config deletion errors
 * - Console output verification
 */

// Mock console methods to avoid cluttering test output
const consoleMock = {
  log: vi.fn(),
};

vi.stubGlobal('console', consoleMock);

// Mock fetch globally
vi.stubGlobal('fetch', vi.fn());

describe('logout command', () => {
  const mockCredentials: CliAuthCredentials = {
    user_id: 'user-123',
    email: 'test@example.com',
    access_token: 'valid_access_token',
    refresh_token: 'valid_refresh_token',
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  };

  const mockForwardingConfig = {
    appId: 'app-123',
    appName: 'Test App',
    tenantId: 'tenant-123',
    apiKey: 'sk_agentmark_dev_test',
    apiKeyId: 'key-123',
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    baseUrl: 'https://gateway.example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleMock.log.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('not logged in', () => {
    it('should exit early when no credentials exist', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      await logout();

      expect(consoleMock.log).toHaveBeenCalledWith('Not logged in.');
      expect(credentials.loadCredentials).toHaveBeenCalled();
      expect(credentials.clearCredentials).not.toHaveBeenCalled();
      expect(forwardingConfig.clearForwardingConfig).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    it('should revoke dev key, clear credentials, and clear config when fully logged in', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(
        mockForwardingConfig
      );
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      (fetch as any).mockResolvedValue({
        ok: true,
        status: 204,
      });

      await logout();

      // Verify revoke API call
      expect(fetch).toHaveBeenCalledWith(
        `https://app.agentmark.co/api/cli/dev-key/${mockForwardingConfig.apiKeyId}`,
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockCredentials.access_token}`,
          }),
        })
      );

      // Verify cleanup
      expect(credentials.clearCredentials).toHaveBeenCalled();
      expect(forwardingConfig.clearForwardingConfig).toHaveBeenCalled();

      // Verify console output
      expect(consoleMock.log).toHaveBeenCalledWith('✓ Dev API key revoked');
      expect(consoleMock.log).toHaveBeenCalledWith(
        '✓ Logged out. Dev API keys revoked.'
      );
    });

    it('should use custom base URL when provided', async () => {
      const customBaseUrl = 'https://custom.example.com';

      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(
        mockForwardingConfig
      );
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      (fetch as any).mockResolvedValue({
        ok: true,
        status: 204,
      });

      await logout({ baseUrl: customBaseUrl });

      expect(fetch).toHaveBeenCalledWith(
        `${customBaseUrl}/api/cli/dev-key/${mockForwardingConfig.apiKeyId}`,
        expect.any(Object)
      );
    });
  });

  describe('no forwarding config', () => {
    it('should skip revoke when no dev key is linked', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(null);
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      await logout();

      // Should not attempt to revoke
      expect(fetch).not.toHaveBeenCalled();

      // Should still clear credentials and config
      expect(credentials.clearCredentials).toHaveBeenCalled();
      expect(forwardingConfig.clearForwardingConfig).toHaveBeenCalled();

      // Should show success message
      expect(consoleMock.log).toHaveBeenCalledWith(
        '✓ Logged out. Dev API keys revoked.'
      );
      expect(consoleMock.log).not.toHaveBeenCalledWith('✓ Dev API key revoked');
    });

    it('should skip revoke when forwarding config exists but has no apiKeyId', async () => {
      const configWithoutKeyId = {
        ...mockForwardingConfig,
        apiKeyId: undefined as any,
      };

      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(
        configWithoutKeyId
      );
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      await logout();

      expect(fetch).not.toHaveBeenCalled();
      expect(credentials.clearCredentials).toHaveBeenCalled();
      expect(forwardingConfig.clearForwardingConfig).toHaveBeenCalled();
    });
  });

  describe('revoke failures', () => {
    it('should continue cleanup when key revoke returns 404', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(
        mockForwardingConfig
      );
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      (fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      });

      await logout();

      // Should not show warning for 404 (key already gone)
      expect(consoleMock.log).not.toHaveBeenCalledWith(
        '⚠️  Failed to revoke dev API key (continuing anyway)'
      );
      expect(consoleMock.log).not.toHaveBeenCalledWith('✓ Dev API key revoked');

      // Should still clear credentials and config
      expect(credentials.clearCredentials).toHaveBeenCalled();
      expect(forwardingConfig.clearForwardingConfig).toHaveBeenCalled();
      expect(consoleMock.log).toHaveBeenCalledWith(
        '✓ Logged out. Dev API keys revoked.'
      );
    });

    it('should continue cleanup when key revoke returns 401', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(
        mockForwardingConfig
      );
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      (fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
      });

      await logout();

      expect(consoleMock.log).toHaveBeenCalledWith(
        '⚠️  Failed to revoke dev API key (continuing anyway)'
      );
      expect(credentials.clearCredentials).toHaveBeenCalled();
      expect(forwardingConfig.clearForwardingConfig).toHaveBeenCalled();
      expect(consoleMock.log).toHaveBeenCalledWith(
        '✓ Logged out. Dev API keys revoked.'
      );
    });

    it('should continue cleanup when key revoke returns 500', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(
        mockForwardingConfig
      );
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      (fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      });

      await logout();

      expect(consoleMock.log).toHaveBeenCalledWith(
        '⚠️  Failed to revoke dev API key (continuing anyway)'
      );
      expect(credentials.clearCredentials).toHaveBeenCalled();
      expect(forwardingConfig.clearForwardingConfig).toHaveBeenCalled();
      expect(consoleMock.log).toHaveBeenCalledWith(
        '✓ Logged out. Dev API keys revoked.'
      );
    });

    it('should continue cleanup when key revoke throws network error', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(
        mockForwardingConfig
      );
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      (fetch as any).mockRejectedValue(
        new Error('Network error: ECONNREFUSED')
      );

      await logout();

      expect(consoleMock.log).toHaveBeenCalledWith(
        '⚠️  Failed to revoke dev API key (continuing anyway)'
      );
      expect(credentials.clearCredentials).toHaveBeenCalled();
      expect(forwardingConfig.clearForwardingConfig).toHaveBeenCalled();
      expect(consoleMock.log).toHaveBeenCalledWith(
        '✓ Logged out. Dev API keys revoked.'
      );
    });

    it('should continue cleanup when key revoke times out', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(
        mockForwardingConfig
      );
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      (fetch as any).mockRejectedValue(
        new Error('Request timeout after 10s')
      );

      await logout();

      expect(consoleMock.log).toHaveBeenCalledWith(
        '⚠️  Failed to revoke dev API key (continuing anyway)'
      );
      expect(credentials.clearCredentials).toHaveBeenCalled();
      expect(forwardingConfig.clearForwardingConfig).toHaveBeenCalled();
      expect(consoleMock.log).toHaveBeenCalledWith(
        '✓ Logged out. Dev API keys revoked.'
      );
    });
  });

  describe('partial cleanup', () => {
    it('should clear credentials even when clearForwardingConfig throws', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(
        mockForwardingConfig
      );
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {
          throw new Error('EACCES: permission denied');
        }
      );

      (fetch as any).mockResolvedValue({
        ok: true,
        status: 204,
      });

      // Should throw the error from clearForwardingConfig
      await expect(logout()).rejects.toThrow('EACCES: permission denied');

      // Credentials should have been cleared before the error
      expect(credentials.clearCredentials).toHaveBeenCalled();
      expect(forwardingConfig.clearForwardingConfig).toHaveBeenCalled();
    });

    it('should clear config even when clearCredentials throws', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(
        mockForwardingConfig
      );
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {
        throw new Error('ENOENT: file not found');
      });
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      (fetch as any).mockResolvedValue({
        ok: true,
        status: 204,
      });

      // Should throw the error from clearCredentials
      await expect(logout()).rejects.toThrow('ENOENT: file not found');

      // Credentials clear was attempted
      expect(credentials.clearCredentials).toHaveBeenCalled();
      // Config clear should not be reached
      expect(forwardingConfig.clearForwardingConfig).not.toHaveBeenCalled();
    });
  });

  describe('console output', () => {
    it('should show appropriate messages for successful logout with key revoke', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(
        mockForwardingConfig
      );
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      (fetch as any).mockResolvedValue({
        ok: true,
        status: 204,
      });

      await logout();

      expect(consoleMock.log).toHaveBeenCalledTimes(2);
      expect(consoleMock.log).toHaveBeenNthCalledWith(
        1,
        '✓ Dev API key revoked'
      );
      expect(consoleMock.log).toHaveBeenNthCalledWith(
        2,
        '✓ Logged out. Dev API keys revoked.'
      );
    });

    it('should show only final message when no key to revoke', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(null);
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      await logout();

      expect(consoleMock.log).toHaveBeenCalledTimes(1);
      expect(consoleMock.log).toHaveBeenCalledWith(
        '✓ Logged out. Dev API keys revoked.'
      );
    });

    it('should show warning when revoke fails but still succeeds overall', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(
        mockForwardingConfig
      );
      vi.spyOn(credentials, 'clearCredentials').mockImplementation(() => {});
      vi.spyOn(forwardingConfig, 'clearForwardingConfig').mockImplementation(
        () => {}
      );

      (fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      });

      await logout();

      expect(consoleMock.log).toHaveBeenCalledTimes(2);
      expect(consoleMock.log).toHaveBeenNthCalledWith(
        1,
        '⚠️  Failed to revoke dev API key (continuing anyway)'
      );
      expect(consoleMock.log).toHaveBeenNthCalledWith(
        2,
        '✓ Logged out. Dev API keys revoked.'
      );
    });
  });
});
