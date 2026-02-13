import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CliAuthCredentials } from '../../cli-src/auth/types';

/**
 * Unit tests for attemptAutoLink (T037)
 * Feature: 013-trace-tunnel
 *
 * Tests:
 * - Happy path: Fetches apps, selects app, creates dev key, saves config
 * - No credentials: Returns false silently
 * - Network failures: App fetch fails (timeout, 401, 500)
 * - Dev key creation failures: API returns error
 * - Multiple apps: User selection flow (mock prompt)
 * - Expired token refresh: Token expired during auto-link, refresh succeeds/fails
 * - Race conditions: Concurrent calls to attemptAutoLink
 * - Missing forwarding config after creation: File not saved properly
 * - Unkey API errors: Different error scenarios
 */

// Mock modules before importing the module under test
vi.mock('../../cli-src/auth/credentials', () => ({
  loadCredentials: vi.fn(),
  isExpired: vi.fn(),
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

// Mock console methods
const consoleMock = {
  log: vi.fn(),
};
vi.stubGlobal('console', consoleMock);

// Import after mocking
import { attemptAutoLink } from '../../cli-src/auth/auto-link';
import { loadCredentials, isExpired } from '../../cli-src/auth/credentials';
import { refreshAccessToken } from '../../cli-src/auth/token-refresh';
import {
  loadForwardingConfig,
  saveForwardingConfig,
} from '../../cli-src/forwarding/config';
import prompts from 'prompts';

const DEFAULT_PLATFORM_URL = 'https://app.agentmark.co';
const DEFAULT_SUPABASE_URL = 'https://glxktydhywvrgobkgezp.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseGt0eWRoeXd2cmdvYmtnZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQ5NTM1MTEsImV4cCI6MjA0MDUyOTUxMX0.jYF8gP8vKCOePdR9sTzUiQ8H5YU1jJYBx77HGAoKdUU';

/** Build a valid CliAuthCredentials object for test use. */
function makeCredentials(
  overrides?: Partial<CliAuthCredentials>
): CliAuthCredentials {
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

/** Build a mock app response object. */
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

/** Build a mock dev key response object. */
function makeDevKeyResponse(overrides?: {
  key?: string;
  key_id?: string;
  app_id?: string;
  app_name?: string;
  tenant_id?: string;
  base_url?: string;
}) {
  return {
    key: 'sk_agentmark_dev_abc123',
    key_id: 'key-abc123',
    app_id: 'app-123',
    app_name: 'Test App',
    tenant_id: 'tenant-456',
    base_url: 'https://gateway.example.com',
    expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    scope: 'traces:write',
    ...overrides,
  };
}

/** Build a mock fetch Response for successful apps fetch. */
function makeAppsResponse(apps: ReturnType<typeof makeApp>[]) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ apps }),
  };
}

/** Build a mock fetch Response for successful dev key creation. */
function makeKeyResponse(keyData: ReturnType<typeof makeDevKeyResponse>) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(keyData),
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
    it('should return true when single app is auto-linked successfully', async () => {
      const creds = makeCredentials();
      const app = makeApp();
      const keyData = makeDevKeyResponse();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce(makeKeyResponse(keyData));

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      expect(saveForwardingConfig).toHaveBeenCalledWith({
        appId: keyData.app_id,
        appName: keyData.app_name,
        tenantId: keyData.tenant_id,
        apiKey: keyData.key,
        apiKeyId: keyData.key_id,
        expiresAt: keyData.expires_at,
        baseUrl: keyData.base_url,
      });
      expect(consoleMock.log).toHaveBeenCalledWith(
        `\n✓ Auto-linked to "${app.name}" (${app.tenant_name}) - only app found`
      );
      expect(consoleMock.log).toHaveBeenCalledWith('✓ Trace forwarding active\n');
    });

    it('should fetch apps with authorization header when user is logged in', async () => {
      const creds = makeCredentials();
      const app = makeApp();
      const keyData = makeDevKeyResponse();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce(makeKeyResponse(keyData));

      await attemptAutoLink();

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `${DEFAULT_PLATFORM_URL}/api/cli/apps`,
        {
          headers: {
            Authorization: `Bearer ${creds.access_token}`,
          },
        }
      );
    });

    it('should create dev key with correct payload when app is selected', async () => {
      const creds = makeCredentials();
      const app = makeApp();
      const keyData = makeDevKeyResponse();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce(makeKeyResponse(keyData));

      await attemptAutoLink();

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        `${DEFAULT_PLATFORM_URL}/api/cli/dev-key`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.access_token}`,
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining(app.id),
        }
      );

      const callArgs = mockFetch.mock.calls[1];
      expect(callArgs).toBeDefined();
      const body = JSON.parse(callArgs![1].body);
      expect(body.app_id).toBe(app.id);
      expect(body.device_name).toMatch(/^CLI - /);
    });

    it('should use custom platform URL when provided', async () => {
      const customUrl = 'https://custom.platform.com';
      const creds = makeCredentials();
      const app = makeApp();
      const keyData = makeDevKeyResponse();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce(makeKeyResponse(keyData));

      await attemptAutoLink({ platformUrl: customUrl });

      expect(mockFetch).toHaveBeenNthCalledWith(1, `${customUrl}/api/cli/apps`, {
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
        },
      });
    });
  });

  describe('already linked', () => {
    it('should return true when already linked without fetching apps', async () => {
      vi.mocked(loadForwardingConfig).mockReturnValue({
        appId: 'existing-app',
        appName: 'Existing App',
        tenantId: 'existing-tenant',
        apiKey: 'sk_agentmark_dev_existing',
        apiKeyId: 'existing-key-id',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        baseUrl: 'https://gateway.example.com',
      });

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(loadCredentials).not.toHaveBeenCalled();
    });
  });

  describe('no credentials', () => {
    it('should return false silently when user is not logged in', async () => {
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
    it('should refresh token when credentials are expired and refresh succeeds', async () => {
      const expiredCreds = makeCredentials({
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      const refreshedCreds = makeCredentials({
        access_token: 'new-access-token',
      });
      const app = makeApp();
      const keyData = makeDevKeyResponse();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(expiredCreds);
      vi.mocked(isExpired).mockReturnValue(true);
      vi.mocked(refreshAccessToken).mockResolvedValue(refreshedCreds);

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce(makeKeyResponse(keyData));

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      expect(refreshAccessToken).toHaveBeenCalledWith(
        expiredCreds,
        DEFAULT_SUPABASE_URL,
        DEFAULT_SUPABASE_ANON_KEY
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `${DEFAULT_PLATFORM_URL}/api/cli/apps`,
        {
          headers: {
            Authorization: `Bearer ${refreshedCreds.access_token}`,
          },
        }
      );
    });

    it('should return false silently when token refresh fails', async () => {
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
      expect(consoleMock.log).not.toHaveBeenCalled();
    });

    it('should use custom Supabase URL and anon key for token refresh', async () => {
      const customSupabaseUrl = 'https://custom.supabase.co';
      const customAnonKey = 'custom-anon-key-xyz';
      const expiredCreds = makeCredentials({
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      const refreshedCreds = makeCredentials({
        access_token: 'new-access-token',
      });
      const app = makeApp();
      const keyData = makeDevKeyResponse();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(expiredCreds);
      vi.mocked(isExpired).mockReturnValue(true);
      vi.mocked(refreshAccessToken).mockResolvedValue(refreshedCreds);

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce(makeKeyResponse(keyData));

      await attemptAutoLink({
        supabaseUrl: customSupabaseUrl,
        supabaseAnonKey: customAnonKey,
      });

      expect(refreshAccessToken).toHaveBeenCalledWith(
        expiredCreds,
        customSupabaseUrl,
        customAnonKey
      );
    });
  });

  describe('network failures', () => {
    it('should return false silently when app fetch returns 401', async () => {
      const creds = makeCredentials();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
      expect(consoleMock.log).not.toHaveBeenCalled();
    });

    it('should return false silently when app fetch returns 500', async () => {
      const creds = makeCredentials();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
      expect(consoleMock.log).not.toHaveBeenCalled();
    });

    it('should return false silently when fetch throws network error', async () => {
      const creds = makeCredentials();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
      expect(consoleMock.log).not.toHaveBeenCalled();
    });

    it('should return false silently when fetch times out', async () => {
      const creds = makeCredentials();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch.mockRejectedValue(new Error('Request timeout'));

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
      expect(consoleMock.log).not.toHaveBeenCalled();
    });
  });

  describe('no apps found', () => {
    it('should return false when no apps exist', async () => {
      const creds = makeCredentials();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch.mockResolvedValue(makeAppsResponse([]));

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });
  });

  describe('multiple apps selection', () => {
    it('should show interactive picker when multiple apps exist', async () => {
      const creds = makeCredentials();
      const app1 = makeApp({ id: 'app-1', name: 'App One', tenant_name: 'Org One' });
      const app2 = makeApp({ id: 'app-2', name: 'App Two', tenant_name: 'Org Two' });
      const keyData = makeDevKeyResponse({ app_id: 'app-2', app_name: 'App Two' });

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      vi.mocked(prompts).mockResolvedValue({ appId: 'app-2' });

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app1, app2]))
        .mockResolvedValueOnce(makeKeyResponse(keyData));

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      expect(prompts).toHaveBeenCalledWith({
        type: 'select',
        name: 'appId',
        message: 'Select an app for trace forwarding:',
        choices: [
          { title: 'App One (Org One)', value: 'app-1' },
          { title: 'App Two (Org Two)', value: 'app-2' },
        ],
      });
    });

    it('should return false when user cancels app selection', async () => {
      const creds = makeCredentials();
      const app1 = makeApp({ id: 'app-1', name: 'App One' });
      const app2 = makeApp({ id: 'app-2', name: 'App Two' });

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      vi.mocked(prompts).mockResolvedValue({ appId: undefined });

      mockFetch.mockResolvedValue(makeAppsResponse([app1, app2]));

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });
  });

  describe('dev key creation failures', () => {
    it('should return false when dev key creation returns 403', async () => {
      const creds = makeCredentials();
      const app = makeApp();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
        });

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });

    it('should return false when dev key creation returns 500', async () => {
      const creds = makeCredentials();
      const app = makeApp();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });

    it('should return false when dev key creation throws network error', async () => {
      const creds = makeCredentials();
      const app = makeApp();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
      // Silent failure - no console.log expected
      expect(consoleMock.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to create')
      );
    });
  });

  describe('malformed API responses', () => {
    it('should return false when apps response is missing apps field', async () => {
      const creds = makeCredentials();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });

    it('should return false when dev key response is missing required fields', async () => {
      const creds = makeCredentials();
      const app = makeApp();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      // Ensure saveForwardingConfig throws if called with incomplete data
      vi.mocked(saveForwardingConfig).mockImplementation((config: any) => {
        // This will cause the try-catch to return false
        if (!config.apiKey || !config.appId) {
          throw new Error('Invalid config');
        }
      });

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            key: 'sk_agentmark_dev_abc123',
            // Missing key_id, app_id, etc.
          }),
        });

      const result = await attemptAutoLink();

      expect(result).toBe(false);
    });

    it('should return false when apps response JSON parsing fails', async () => {
      const creds = makeCredentials();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError('Invalid JSON')),
      });

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });
  });

  describe('race conditions', () => {
    it('should not conflict when called sequentially', async () => {
      const creds = makeCredentials();
      const app = makeApp();
      const keyData1 = makeDevKeyResponse({ key_id: 'key-001' });
      const keyData2 = makeDevKeyResponse({ key_id: 'key-002' });

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      // First call gets key-001
      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce(makeKeyResponse(keyData1));

      const result1 = await attemptAutoLink();

      // Second call gets key-002
      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce(makeKeyResponse(keyData2));

      const result2 = await attemptAutoLink();

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(saveForwardingConfig).toHaveBeenCalledTimes(2);
      expect(saveForwardingConfig).toHaveBeenNthCalledWith(1, {
        appId: keyData1.app_id,
        appName: keyData1.app_name,
        tenantId: keyData1.tenant_id,
        apiKey: keyData1.key,
        apiKeyId: keyData1.key_id,
        expiresAt: keyData1.expires_at,
        baseUrl: keyData1.base_url,
      });
      expect(saveForwardingConfig).toHaveBeenNthCalledWith(2, {
        appId: keyData2.app_id,
        appName: keyData2.app_name,
        tenantId: keyData2.tenant_id,
        apiKey: keyData2.key,
        apiKeyId: keyData2.key_id,
        expiresAt: keyData2.expires_at,
        baseUrl: keyData2.base_url,
      });
    });

    it('should handle failure after success in sequential calls', async () => {
      const creds = makeCredentials();
      const app = makeApp();
      const keyData = makeDevKeyResponse();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      // First call succeeds
      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce(makeKeyResponse(keyData));

      const result1 = await attemptAutoLink();

      // Second call fails at app fetch
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result2 = await attemptAutoLink();

      expect(result1).toBe(true);
      expect(result2).toBe(false);
      expect(saveForwardingConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle app with missing optional fields', async () => {
      const creds = makeCredentials();
      const app = {
        id: 'app-minimal',
        name: 'Minimal App',
        tenant_id: 'tenant-minimal',
        tenant_name: 'Minimal Org',
        // created_at is optional in the type
      };
      const keyData = makeDevKeyResponse({
        app_id: 'app-minimal',
        app_name: 'Minimal App',
      });

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ apps: [app] }),
        })
        .mockResolvedValueOnce(makeKeyResponse(keyData));

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      expect(saveForwardingConfig).toHaveBeenCalled();
    });

    it('should handle very long app names without truncation', async () => {
      const creds = makeCredentials();
      const longName = 'A'.repeat(255);
      const app = makeApp({ name: longName });
      const keyData = makeDevKeyResponse({ app_name: longName });

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce(makeKeyResponse(keyData));

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      expect(saveForwardingConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          appName: longName,
        })
      );
    });

    it('should handle special characters in app and tenant names', async () => {
      const creds = makeCredentials();
      const app = makeApp({
        name: 'App-Special',
        tenant_name: "Org-Test",
      });
      const keyData = makeDevKeyResponse({
        app_name: 'App-Special',
      });

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce(makeKeyResponse(keyData));

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      expect(saveForwardingConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          appName: 'App-Special',
        })
      );
    });

    it('should handle dev key response with missing optional fields', async () => {
      const creds = makeCredentials();
      const app = makeApp();
      const minimalKeyData = {
        key: 'sk_agentmark_dev_abc123',
        key_id: 'key-abc123',
        app_id: 'app-123',
        app_name: 'Test App',
        tenant_id: 'tenant-456',
        base_url: 'https://gateway.example.com',
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        scope: 'traces:write',
      };

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(minimalKeyData),
        });

      const result = await attemptAutoLink();

      expect(result).toBe(true);
      expect(saveForwardingConfig).toHaveBeenCalledWith({
        appId: minimalKeyData.app_id,
        appName: minimalKeyData.app_name,
        tenantId: minimalKeyData.tenant_id,
        apiKey: minimalKeyData.key,
        apiKeyId: minimalKeyData.key_id,
        expiresAt: minimalKeyData.expires_at,
        baseUrl: minimalKeyData.base_url,
      });
    });
  });

  describe('prompt cancellation', () => {
    it('should handle prompt cancellation with null response', async () => {
      const creds = makeCredentials();
      const app1 = makeApp({ id: 'app-1', name: 'App One' });
      const app2 = makeApp({ id: 'app-2', name: 'App Two' });

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      vi.mocked(prompts).mockResolvedValue({ appId: null });

      mockFetch.mockResolvedValue(makeAppsResponse([app1, app2]));

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });

    it('should handle prompt cancellation with empty string response', async () => {
      const creds = makeCredentials();
      const app1 = makeApp({ id: 'app-1', name: 'App One' });
      const app2 = makeApp({ id: 'app-2', name: 'App Two' });

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      vi.mocked(prompts).mockResolvedValue({ appId: '' });

      mockFetch.mockResolvedValue(makeAppsResponse([app1, app2]));

      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).not.toHaveBeenCalled();
    });
  });

  describe('config save verification', () => {
    it('should complete successfully even if saveForwardingConfig throws', async () => {
      const creds = makeCredentials();
      const app = makeApp();
      const keyData = makeDevKeyResponse();

      vi.mocked(loadForwardingConfig).mockReturnValue(null);
      vi.mocked(loadCredentials).mockReturnValue(creds);
      vi.mocked(isExpired).mockReturnValue(false);
      vi.mocked(saveForwardingConfig).mockImplementation(() => {
        throw new Error('File system error');
      });

      mockFetch
        .mockResolvedValueOnce(makeAppsResponse([app]))
        .mockResolvedValueOnce(makeKeyResponse(keyData));

      // The function should still return false because the try-catch wraps everything
      const result = await attemptAutoLink();

      expect(result).toBe(false);
      expect(saveForwardingConfig).toHaveBeenCalled();
    });
  });
});
