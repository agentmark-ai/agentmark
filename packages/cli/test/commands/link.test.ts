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
    // vitest 4's `vi.restoreAllMocks()` (afterEach) no longer resets `vi.fn()`
    // mocks, only `vi.spyOn` spies — so an unconsumed `mockResolvedValueOnce`
    // on the module-scoped `global.fetch` queue would leak into the next test
    // and surface the wrong response shape. Reset the fetch mock per test.
    (global.fetch as any).mockReset();
    consoleMock.log.mockClear();
    // Stub saveCredentials so the link command's post-refresh persist
    // step doesn't write into the shared per-worker auth dir. Without
    // this, link tests that exercise the refresh branch leak an
    // auth.json file that later tests (e.g. forwarder) then read,
    // causing apiKey-fallback assertions to flip to bearer-path.
    vi.spyOn(credentials, 'saveCredentials').mockImplementation(() => {});
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
    it('should auto-select when only one app exists and write binding-only config', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(null);
      const saveSpy = vi
        .spyOn(forwardingConfig, 'saveForwardingConfig')
        .mockImplementation(() => {});

      const singleApp = {
        id: 'app-single',
        name: 'Only App',
        tenant_id: 'tenant-1',
        tenant_name: 'Only Org',
        created_at: '2024-01-01',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [singleApp] }),
      });

      await link();

      expect(consoleMock.log).toHaveBeenCalledWith(
        `✓ Auto-linked to "${singleApp.name}" (${singleApp.tenant_name}) - only app found`
      );
      expect(prompts).not.toHaveBeenCalled();

      // Single fetch: list apps. NO call to /api/cli/dev-key.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const calls = (global.fetch as any).mock.calls as Array<[string, unknown]>;
      const calledUrls = calls.map(([url]) => url);
      expect(calledUrls.some((url) => url.includes('/api/cli/dev-key'))).toBe(false);

      // saveForwardingConfig receives the binding fields and ONLY those.
      // No `apiKey`, `apiKeyId`, or `expiresAt` — confirming we no longer
      // mint a dev API key on link.
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: singleApp.id,
          appName: singleApp.name,
          tenantId: singleApp.tenant_id,
          orgName: singleApp.tenant_name,
          baseUrl: expect.any(String),
        }),
      );
      const written = saveSpy.mock.calls[0]![0];
      expect(written.apiKey).toBeUndefined();
      expect(written.apiKeyId).toBeUndefined();
      expect(written.expiresAt).toBeUndefined();
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

  describe('no dev API key is minted', () => {
    it('preserves legacy apiKey from existing config while writing a new binding', async () => {
      // Regression guard: if a user previously linked with an older CLI
      // version that minted a dev API key, re-running link should leave
      // that legacy `apiKey` field intact (so they can downgrade without
      // re-minting) while updating the binding. The forwarder always
      // prefers the session bearer over the legacy key anyway.
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue({
        appId: 'old-app',
        appName: 'Old App',
        tenantId: 'old-tenant',
        apiKey: 'sk_agentmark_dev_legacy',
        apiKeyId: 'legacy-key-id',
        expiresAt: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
        baseUrl: 'https://gateway.example.com',
      });
      const saveSpy = vi
        .spyOn(forwardingConfig, 'saveForwardingConfig')
        .mockImplementation(() => {});

      const app = {
        id: 'new-app',
        name: 'New App',
        tenant_id: 'new-tenant',
        tenant_name: 'New Org',
        created_at: '2024-01-01',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [app] }),
      });

      await link();

      // Single fetch — list apps only. No POST to /api/cli/dev-key,
      // no DELETE to /api/cli/dev-key/<id> for revoke.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const calls = (global.fetch as any).mock.calls as Array<[string, unknown]>;
      const calledUrls = calls.map(([url]) => url);
      expect(calledUrls.some((url) => url.includes('/api/cli/dev-key'))).toBe(false);

      // saveForwardingConfig: binding fields updated to new app; legacy
      // apiKey / apiKeyId / expiresAt preserved (via the existing spread).
      const written = saveSpy.mock.calls[0]![0];
      expect(written.appId).toBe(app.id);
      expect(written.appName).toBe(app.name);
      expect(written.tenantId).toBe(app.tenant_id);
      expect(written.orgName).toBe(app.tenant_name);
      // Legacy fields preserved on the row — agent that minted them can
      // still find them.
      expect(written.apiKey).toBe('sk_agentmark_dev_legacy');
      expect(written.apiKeyId).toBe('legacy-key-id');
    });

    it('writes only the binding when no prior config exists (no legacy fields invented)', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(null);
      const saveSpy = vi
        .spyOn(forwardingConfig, 'saveForwardingConfig')
        .mockImplementation(() => {});

      const app = {
        id: 'fresh-app',
        name: 'Fresh App',
        tenant_id: 'fresh-tenant',
        tenant_name: 'Fresh Org',
        created_at: '2024-01-01',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [app] }),
      });

      await link();

      const written = saveSpy.mock.calls[0]![0];
      expect(written.appId).toBe(app.id);
      expect(written.appName).toBe(app.name);
      expect(written.tenantId).toBe(app.tenant_id);
      expect(written.orgName).toBe(app.tenant_name);
      expect(written.baseUrl).toMatch(/^https?:\/\//);

      // Whitelist check: nothing else lands in dev-config.json. If a future
      // change reintroduces an apiKey mint by accident, this assertion fails.
      expect(Object.keys(written).sort()).toEqual(
        ['appId', 'appName', 'baseUrl', 'orgName', 'tenantId'].sort(),
      );
    });
  });

  describe('app-id flag', () => {
    it('finds the named app in the listing and writes its binding (no picker, no key mint)', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(null);
      const saveSpy = vi
        .spyOn(forwardingConfig, 'saveForwardingConfig')
        .mockImplementation(() => {});

      const apps = [
        { id: 'app-other', name: 'Other', tenant_id: 't1', tenant_name: 'T1', created_at: '2024' },
        { id: 'specified-app-id', name: 'Specified', tenant_id: 't2', tenant_name: 'T2', created_at: '2024' },
      ];
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps }),
      });

      await link({ appId: 'specified-app-id' });

      // Apps list IS fetched (needed for display name + tenant context),
      // but no key endpoint is touched.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const calledUrls = ((global.fetch as any).mock.calls as Array<[string, unknown]>).map(([u]) => u);
      expect(calledUrls[0]).toContain('/api/cli/apps');
      expect(calledUrls.some((url) => url.includes('/api/cli/dev-key'))).toBe(false);

      // Picker not shown — appId came from CLI flag.
      expect(prompts).not.toHaveBeenCalled();

      // Saved config maps to the SPECIFIED app, not the first/other one.
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: 'specified-app-id',
          appName: 'Specified',
          tenantId: 't2',
          orgName: 'T2',
        }),
      );
    });

    it('--json mode emits one JSON line with the linked appId on success', async () => {
      // Lets CI scripts capture the linked appId without parsing the
      // emoji-prefixed human message. Shape is the contract; assert
      // exact keys + values.
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(null);
      vi.spyOn(forwardingConfig, 'saveForwardingConfig').mockImplementation(() => {});

      const app = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test App',
        tenant_id: 'tenant-1',
        tenant_name: 'Test Org',
        created_at: '2024-01-01',
      };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [app] }),
      });

      await link({ json: true });

      // The human "Auto-linked to ..." line is suppressed in JSON mode.
      const allLogs = consoleMock.log.mock.calls.map((c: unknown[]) => c[0] as string);
      const jsonLine = allLogs.find((line) => line?.startsWith?.('{'));
      expect(jsonLine).toBeDefined();
      const parsed = JSON.parse(jsonLine!);
      expect(parsed).toEqual({
        linked: true,
        appId: app.id,
        appName: app.name,
        tenantId: app.tenant_id,
        orgName: app.tenant_name,
        baseUrl: expect.stringMatching(/^https?:\/\//),
      });
    });

    it('exits when --app-id does not match any app the user has access to', async () => {
      vi.spyOn(credentials, 'loadCredentials').mockReturnValue(mockCredentials);
      vi.spyOn(credentials, 'isExpired').mockReturnValue(false);
      vi.spyOn(forwardingConfig, 'loadForwardingConfig').mockReturnValue(null);

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apps: [
            { id: 'app-other', name: 'Other', tenant_id: 't1', tenant_name: 'T1', created_at: '2024' },
          ],
        }),
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as any);

      await expect(link({ appId: 'nope-doesnt-exist' })).rejects.toThrow('process.exit called');

      expect(consoleMock.log).toHaveBeenCalledWith(
        expect.stringContaining('not found on the platform'),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
