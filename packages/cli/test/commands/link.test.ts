import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import link from '../../cli-src/commands/link';
import * as credentials from '../../cli-src/auth/credentials';
import * as tokenRefresh from '../../cli-src/auth/token-refresh';
import * as forwardingConfig from '../../cli-src/forwarding/config';
import type { CliAuthCredentials } from '../../cli-src/auth/types';

/**
 * Unit tests for link command (T026)
 * Feature: 013-trace-tunnel
 *
 * Tests:
 * - App listing
 * - Single-app auto-select
 * - Multi-app interactive pick
 * - Key creation
 * - Re-link revokes old key
 * - Not-logged-in error
 */

// Mock console methods
const consoleMock = {
  log: vi.fn(),
};

vi.stubGlobal('console', consoleMock);

// Mock prompts module
vi.mock('prompts', () => ({
  default: vi.fn(),
}));

// Mock fetch globally
global.fetch = vi.fn();

import prompts from 'prompts';

describe('link command', () => {
  const mockCredentials: CliAuthCredentials = {
    user_id: 'user-123',
    email: 'test@example.com',
    access_token: 'valid_access_token',
    refresh_token: 'valid_refresh_token',
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

  describe('not logged in', () => {
    it('should exit with error when no credentials exist', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(null);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(link()).rejects.toThrow('process.exit called');

      expect(consoleMock.log).toHaveBeenCalledWith(
        '✗ Not logged in. Run `agentmark login` first.'
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when token refresh fails', async () => {
      const expiredCreds = {
        ...mockCredentials,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      };

      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(expiredCreds);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(true);
      vi.spyOn(tokenRefresh, 'refreshAccessToken').mockResolvedValue(null);

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(link()).rejects.toThrow('process.exit called');

      expect(consoleMock.log).toHaveBeenCalledWith(
        '✗ Token refresh failed. Run `agentmark login` again.'
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('app listing', () => {
    it('should fetch apps from platform with authorization', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(null);
      vi.spyOn(forwardingConfig, 'saveForwardingConfig').mockImplementation(
        () => {}
      );

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            apps: [
              {
                id: 'app-1',
                name: 'Test App',
                tenant_id: 'tenant-1',
                tenant_name: 'Test Org',
                created_at: '2024-01-01',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            key: 'sk_agentmark_dev_123',
            key_id: 'key-1',
            app_id: 'app-1',
            app_name: 'Test App',
            tenant_id: 'tenant-1',
            base_url: 'https://gateway.example.com',
            expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
            scope: 'traces:write',
          }),
        });

      await link();

      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/api/cli/apps'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockCredentials.access_token}`,
          }),
        })
      );
    });

    it('should exit when no apps are found', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ apps: [] }),
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(link()).rejects.toThrow('process.exit called');

      expect(consoleMock.log).toHaveBeenCalledWith(
        '✗ No apps found. Create an app on the platform first.'
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('single app auto-select', () => {
    it('should auto-select when only one app exists', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(null);
      vi.spyOn(forwardingConfig, 'saveForwardingConfig').mockImplementation(
        () => {}
      );

      const singleApp = {
        id: 'app-single',
        name: 'Only App',
        tenant_id: 'tenant-1',
        tenant_name: 'Only Org',
        created_at: '2024-01-01',
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ apps: [singleApp] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            key: 'sk_agentmark_dev_123',
            key_id: 'key-1',
            app_id: singleApp.id,
            app_name: singleApp.name,
            tenant_id: singleApp.tenant_id,
            base_url: 'https://gateway.example.com',
            expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
            scope: 'traces:write',
          }),
        });

      await link();

      expect(consoleMock.log).toHaveBeenCalledWith(
        `✓ Auto-linked to "${singleApp.name}" (${singleApp.tenant_name}) - only app found`
      );
      expect(prompts).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/api/cli/dev-key'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(singleApp.id),
        })
      );
    });
  });

  describe('multi-app interactive pick', () => {
    it('should show interactive picker when multiple apps exist', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(null);
      vi.spyOn(forwardingConfig, 'saveForwardingConfig').mockImplementation(
        () => {}
      );

      const apps = [
        {
          id: 'app-1',
          name: 'App One',
          tenant_id: 'tenant-1',
          tenant_name: 'Org One',
          created_at: '2024-01-01',
        },
        {
          id: 'app-2',
          name: 'App Two',
          tenant_id: 'tenant-2',
          tenant_name: 'Org Two',
          created_at: '2024-01-02',
        },
      ];

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ apps }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            key: 'sk_agentmark_dev_123',
            key_id: 'key-1',
            app_id: 'app-2',
            app_name: 'App Two',
            tenant_id: 'tenant-2',
            base_url: 'https://gateway.example.com',
            expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
            scope: 'traces:write',
          }),
        });

      (prompts as any).mockResolvedValue({ appId: 'app-2' });

      await link();

      expect(prompts).toHaveBeenCalledWith({
        type: 'select',
        name: 'appId',
        message: 'Select an app to link:',
        choices: expect.arrayContaining([
          expect.objectContaining({
            title: 'App One (Org One)',
            value: 'app-1',
          }),
          expect.objectContaining({
            title: 'App Two (Org Two)',
            value: 'app-2',
          }),
        ]),
      });
    });

    it('should exit when no app is selected in interactive mode', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);

      const apps = [
        {
          id: 'app-1',
          name: 'App One',
          tenant_id: 'tenant-1',
          tenant_name: 'Org One',
          created_at: '2024-01-01',
        },
        {
          id: 'app-2',
          name: 'App Two',
          tenant_id: 'tenant-2',
          tenant_name: 'Org Two',
          created_at: '2024-01-02',
        },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ apps }),
      });

      (prompts as any).mockResolvedValue({ appId: undefined });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(link()).rejects.toThrow('process.exit called');

      expect(consoleMock.log).toHaveBeenCalledWith('✗ No app selected.');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('key creation', () => {
    it('should create dev API key for selected app', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(null);
      const saveSpy = vi
        .spyOn(forwardingConfig, 'saveForwardingConfig')
        .mockImplementation(() => {});

      const app = {
        id: 'app-xyz',
        name: 'My App',
        tenant_id: 'tenant-xyz',
        tenant_name: 'My Org',
        created_at: '2024-01-01',
      };

      const keyResponse = {
        key: 'sk_agentmark_dev_abc123',
        key_id: 'key-abc',
        app_id: app.id,
        app_name: app.name,
        tenant_id: app.tenant_id,
        base_url: 'https://api.agentmark.co',
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        scope: 'traces:write',
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ apps: [app] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => keyResponse,
        });

      await link();

      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/api/cli/dev-key'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockCredentials.access_token}`,
          }),
          body: expect.stringContaining(app.id),
        })
      );

      expect(saveSpy).toHaveBeenCalledWith({
        appId: keyResponse.app_id,
        appName: keyResponse.app_name,
        tenantId: keyResponse.tenant_id,
        apiKey: keyResponse.key,
        apiKeyId: keyResponse.key_id,
        expiresAt: keyResponse.expires_at,
        baseUrl: keyResponse.base_url,
      });

      expect(consoleMock.log).toHaveBeenCalledWith(
        `✓ Linked to "${app.name}". Traces will forward to this app.`
      );
    });
  });

  describe('re-link revokes old key', () => {
    it('should revoke existing key before creating new one', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue({
        appId: 'old-app',
        appName: 'Old App',
        tenantId: 'old-tenant',
        apiKey: 'sk_agentmark_dev_old',
        apiKeyId: 'old-key-id',
        expiresAt: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
        baseUrl: 'https://gateway.example.com',
      });
      vi.spyOn(forwardingConfig, 'saveForwardingConfig').mockImplementation(
        () => {}
      );

      const app = {
        id: 'new-app',
        name: 'New App',
        tenant_id: 'new-tenant',
        tenant_name: 'New Org',
        created_at: '2024-01-01',
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ apps: [app] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            key: 'sk_agentmark_dev_new',
            key_id: 'new-key-id',
            app_id: app.id,
            app_name: app.name,
            tenant_id: app.tenant_id,
            base_url: 'https://gateway.example.com',
            expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
            scope: 'traces:write',
          }),
        });

      await link();

      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/api/cli/dev-key/old-key-id'),
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockCredentials.access_token}`,
          }),
        })
      );

      expect(consoleMock.log).toHaveBeenCalledWith(
        '✓ Previous dev API key revoked'
      );
    });

    it('should continue when revoke returns 404', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue({
        appId: 'old-app',
        appName: 'Old App',
        tenantId: 'old-tenant',
        apiKey: 'sk_agentmark_dev_old',
        apiKeyId: 'already-deleted-key',
        expiresAt: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
        baseUrl: 'https://gateway.example.com',
      });
      vi.spyOn(forwardingConfig, 'saveForwardingConfig').mockImplementation(
        () => {}
      );

      const app = {
        id: 'new-app',
        name: 'New App',
        tenant_id: 'new-tenant',
        tenant_name: 'New Org',
        created_at: '2024-01-01',
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ apps: [app] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            key: 'sk_agentmark_dev_new',
            key_id: 'new-key-id',
            app_id: app.id,
            app_name: app.name,
            tenant_id: app.tenant_id,
            base_url: 'https://gateway.example.com',
            expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
            scope: 'traces:write',
          }),
        });

      await link();

      // Should not throw and continue to create new key
      expect(consoleMock.log).toHaveBeenCalledWith(
        '✓ Previous dev API key revoked'
      );
    });
  });

  describe('app-id flag', () => {
    it('should skip app selection when --app-id is provided', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(null);
      vi.spyOn(forwardingConfig, 'saveForwardingConfig').mockImplementation(
        () => {}
      );

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          key: 'sk_agentmark_dev_123',
          key_id: 'key-1',
          app_id: 'specified-app-id',
          app_name: 'Specified App',
          tenant_id: 'tenant-1',
          base_url: 'https://gateway.example.com',
          expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
          scope: 'traces:write',
        }),
      });

      await link({ appId: 'specified-app-id' });

      // Should NOT fetch apps list
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/cli/apps'),
        expect.any(Object)
      );

      // Should directly create key for specified app
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/cli/dev-key'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('specified-app-id'),
        })
      );

      expect(prompts).not.toHaveBeenCalled();
    });
  });
});
