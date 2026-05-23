import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CliAuthCredentials } from '../../cli-src/auth/types';

/**
 * Unit tests for attemptAutoLink.
 *
 * After the link-key-removal refactor, attemptAutoLink only writes the
 * project↔app binding to `.agentmark/dev-config.json` (appId, appName,
 * tenantId, orgName, baseUrl). No dev API key is minted — the trace
 * forwarder authenticates with the session bearer from `agentmark login`.
 */

vi.mock('../../cli-src/auth/credentials', () => ({
  loadCredentials: vi.fn(),
  isExpired: vi.fn(),
  saveCredentials: vi.fn(),
}));

vi.mock('../../cli-src/auth/token-refresh', () => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock('../../cli-src/forwarding/config', () => ({
  loadForwardingConfig: vi.fn(),
  saveForwardingConfig: vi.fn(),
}));

vi.mock('prompts', () => ({
  default: vi.fn(),
}));

const consoleMock = { log: vi.fn() };
vi.stubGlobal('console', consoleMock);

import { attemptAutoLink } from '../../cli-src/auth/auto-link';
import {
  loadCredentials,
  isExpired,
  saveCredentials,
} from '../../cli-src/auth/credentials';
import { refreshAccessToken } from '../../cli-src/auth/token-refresh';
import {
  loadForwardingConfig,
  saveForwardingConfig,
} from '../../cli-src/forwarding/config';
import prompts from 'prompts';

import {
  DEFAULT_PLATFORM_URL,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
} from '../../cli-src/auth/constants';

function makeCredentials(overrides?: Partial<CliAuthCredentials>): CliAuthCredentials {
  return {
    user_id: 'user-001',
    email: 'alice@example.com',
    access_token: 'valid-access-token',
    refresh_token: 'valid-refresh-token',
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    created_at: '2025-06-15T10:00:00.000Z',
    ...overrides,
  };
}

function makeApp(overrides?: {
  id?: string;
  name?: string;
  tenant_id?: string;
  tenant_name?: string;
}) {
  return {
    id: 'app-123',
    name: 'Test App',
    tenant_id: 'tenant-456',
    tenant_name: 'Test Org',
    created_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeAppsResponse(apps: ReturnType<typeof makeApp>[]) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ apps }),
  };
}

describe('attemptAutoLink', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleMock.log.mockClear();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('happy path', () => {
    it('returns true and writes binding-only config when single app exists', async () => {
      const creds = makeCredentials();
      const app = makeApp();
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      mockFetch.mockResolvedValueOnce(makeAppsResponse([app]));

      const result = await attemptAutoLink();

      expect(result).toBe(true);

      // No POST to /api/cli/dev-key — only the apps list fetch.
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrls = mockFetch.mock.calls.map(([url]) => url);
      expect(calledUrls.some((url) => url.includes('/api/cli/dev-key'))).toBe(false);

      const written = vi.mocked(saveForwardingConfig).mock.calls[0]![0];
      expect(written.appId).toBe(app.id);
      expect(written.appName).toBe(app.name);
      expect(written.tenantId).toBe(app.tenant_id);
      expect(written.orgName).toBe(app.tenant_name);
      expect(written.baseUrl).toMatch(/^https?:\/\//);
      // No legacy key fields invented from thin air.
      expect(written.apiKey).toBeUndefined();
      expect(written.apiKeyId).toBeUndefined();
      expect(written.expiresAt).toBeUndefined();
    });

    it('fetches apps with the user-bearer authorization header', async () => {
      const creds = makeCredentials();
      const app = makeApp();
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      mockFetch.mockResolvedValueOnce(makeAppsResponse([app]));

      await attemptAutoLink();

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `${DEFAULT_PLATFORM_URL}/api/cli/apps`,
        { headers: { Authorization: `Bearer ${creds.access_token}` } },
      );
    });

    it('honors a custom platform URL', async () => {
      const customUrl = 'https://custom.platform.com';
      const creds = makeCredentials();
      const app = makeApp();
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      mockFetch.mockResolvedValueOnce(makeAppsResponse([app]));

      await attemptAutoLink({ platformUrl: customUrl });

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `${customUrl}/api/cli/apps`,
        expect.anything(),
      );
    });
  });

  describe('already linked', () => {
    it('returns true without fetching apps when existing config has an appId', async () => {
      vi.mocked(loadForwardingConfig).mockReturnValue({
        appId: 'existing-app',
        appName: 'Existing App',
        tenantId: 'existing-tenant',
        baseUrl: 'https://gateway.example.com',
      });

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(loadCredentials).not.toHaveBeenCalled();
    });

    it('treats a legacy config that still has apiKey + expiresAt as linked', async () => {
      // Back-compat: configs written by older CLI versions still carry
      // `apiKey`/`apiKeyId`/`expiresAt`. They should NOT trigger a re-link.
      vi.mocked(loadForwardingConfig).mockReturnValue({
        appId: 'existing-app',
        appName: 'Existing App',
        tenantId: 'existing-tenant',
        apiKey: 'sk_agentmark_dev_legacy',
        apiKeyId: 'legacy-key-id',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        baseUrl: 'https://gateway.example.com',
      });

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('no credentials', () => {
    it('returns false silently when user is not logged in', async () => {
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(null);

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(saveForwardingConfig).not.toHaveBeenCalled();
      expect(consoleMock.log).not.toHaveBeenCalled();
    });
  });

  describe('expired token refresh', () => {
    it('refreshes the bearer, persists it, and continues when refresh succeeds', async () => {
      const expiredCreds = makeCredentials({
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      const refreshedCreds = makeCredentials({
        access_token: 'new-access-token',
      });
      const app = makeApp();
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(expiredCreds);
      vi.mocked(isExpired).mockReturnValue(true);
      vi.mocked(refreshAccessToken).mockResolvedValue(refreshedCreds);
      mockFetch.mockResolvedValueOnce(makeAppsResponse([app]));

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      expect(refreshAccessToken).toHaveBeenCalledWith(
        expiredCreds,
        DEFAULT_SUPABASE_URL,
        DEFAULT_SUPABASE_ANON_KEY,
      );
      // Refreshed credentials are persisted so the next CLI process
      // doesn't pay the refresh round-trip.
      expect(saveCredentials).toHaveBeenCalledWith(refreshedCreds);
      // Apps list fetch uses the refreshed access token.
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `${DEFAULT_PLATFORM_URL}/api/cli/apps`,
        { headers: { Authorization: `Bearer ${refreshedCreds.access_token}` } },
      );
    });

    it('returns false silently when token refresh fails', async () => {
      const expiredCreds = makeCredentials({
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(expiredCreds);
      vi.mocked(isExpired).mockReturnValue(true);
      vi.mocked(refreshAccessToken).mockResolvedValue(null);

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });

    it('honors custom Supabase URL + anon key for refresh', async () => {
      const customSupabaseUrl = 'https://custom-supabase.example.com';
      const customAnonKey = 'custom-anon-key-xyz';
      const expiredCreds = makeCredentials({
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      const refreshedCreds = makeCredentials({ access_token: 'new-token' });
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(expiredCreds);
      vi.mocked(isExpired).mockReturnValue(true);
      vi.mocked(refreshAccessToken).mockResolvedValue(refreshedCreds);
      mockFetch.mockResolvedValueOnce(makeAppsResponse([makeApp()]));

      await attemptAutoLink({
        supabaseUrl: customSupabaseUrl,
        supabaseAnonKey: customAnonKey,
      });

      expect(refreshAccessToken).toHaveBeenCalledWith(
        expiredCreds,
        customSupabaseUrl,
        customAnonKey,
      );
    });
  });

  describe('apps fetch failures', () => {
    it.each([
      ['401', 401],
      ['500', 500],
    ] as const)('returns false silently when app fetch returns %s', async (_label, status) => {
      const creds = makeCredentials();
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      mockFetch.mockResolvedValue({ ok: false, status });

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });

    it('returns false silently when fetch throws a network error', async () => {
      const creds = makeCredentials();
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      mockFetch.mockRejectedValue(new Error('network down'));

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });

    it('returns false when no apps exist on the tenant', async () => {
      const creds = makeCredentials();
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      mockFetch.mockResolvedValueOnce(makeAppsResponse([]));

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });
  });

  describe('AGENTMARK_APP_ID env var fast-path', () => {
    const ORIGINAL_ENV = { ...process.env };

    beforeEach(() => {
      delete process.env.AGENTMARK_APP_ID;
    });

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    it('skips the picker and uses the env var even when multiple apps exist', async () => {
      // The whole point of this env var is CI / scripted onboarding —
      // multiple apps must NOT trigger the interactive prompt when the
      // caller has pre-declared their pick.
      process.env.AGENTMARK_APP_ID = 'app-2';

      const creds = makeCredentials();
      const apps = [
        makeApp({ id: 'app-1', name: 'App One', tenant_name: 'Org A' }),
        makeApp({ id: 'app-2', name: 'App Two', tenant_name: 'Org B' }),
      ];
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      mockFetch.mockResolvedValueOnce(makeAppsResponse(apps));

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      // No picker invoked.
      expect(prompts).not.toHaveBeenCalled();

      // Wrote the env-specified app, not the first one in the list.
      const written = vi.mocked(saveForwardingConfig).mock.calls[0]![0];
      expect(written.appId).toBe('app-2');
      expect(written.appName).toBe('App Two');
    });

    it('returns false when AGENTMARK_APP_ID does not match any visible app', async () => {
      // Defends against a CI misconfig where the env points at a
      // tenant the runner can't see (revoked access, wrong env). The
      // alternative — silently writing a half-formed config — would
      // produce surprising downstream behavior.
      process.env.AGENTMARK_APP_ID = 'ghost-app';

      const creds = makeCredentials();
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      mockFetch.mockResolvedValueOnce(makeAppsResponse([makeApp({ id: 'app-1' })]));

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });
  });

  describe('multiple apps selection', () => {
    it('shows the interactive picker and writes the chosen binding', async () => {
      const creds = makeCredentials();
      const apps = [
        makeApp({ id: 'app-1', name: 'App One', tenant_name: 'Org A' }),
        makeApp({ id: 'app-2', name: 'App Two', tenant_name: 'Org B' }),
      ];
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      mockFetch.mockResolvedValueOnce(makeAppsResponse(apps));
      vi.mocked(prompts).mockResolvedValue({ appId: 'app-2' });

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      expect(prompts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'select',
          name: 'appId',
          choices: expect.arrayContaining([
            expect.objectContaining({ title: 'App One (Org A)', value: 'app-1' }),
            expect.objectContaining({ title: 'App Two (Org B)', value: 'app-2' }),
          ]),
        }),
      );

      const written = vi.mocked(saveForwardingConfig).mock.calls[0]![0];
      expect(written.appId).toBe('app-2');
      expect(written.appName).toBe('App Two');
      expect(written.orgName).toBe('Org B');
    });

    it('returns false when the user cancels the picker', async () => {
      const creds = makeCredentials();
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      mockFetch.mockResolvedValueOnce(
        makeAppsResponse([makeApp({ id: 'a' }), makeApp({ id: 'b' })]),
      );
      vi.mocked(prompts).mockResolvedValue({ appId: undefined });

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });

    it('returns false when the chosen app id does not match any returned app (defense)', async () => {
      // Guards against a prompts mock or upstream API quirk that returns
      // an unknown id. The auto-link path should not blindly write a
      // half-formed config in that case.
      const creds = makeCredentials();
      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      mockFetch.mockResolvedValueOnce(
        makeAppsResponse([makeApp({ id: 'a' }), makeApp({ id: 'b' })]),
      );
      vi.mocked(prompts).mockResolvedValue({ appId: 'ghost-app' });

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });
  });
});
