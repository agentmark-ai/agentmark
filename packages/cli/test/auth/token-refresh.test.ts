import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CliAuthCredentials } from '../../cli-src/auth/types';

// Mock the credentials module before importing the module under test
vi.mock('../../cli-src/auth/credentials', () => ({
  saveCredentials: vi.fn(),
}));

import { refreshAccessToken } from '../../cli-src/auth/token-refresh';
import { saveCredentials } from '../../cli-src/auth/credentials';

const SUPABASE_URL = 'https://test.supabase.co';
const SUPABASE_ANON_KEY = 'test-anon-key-abc123';

/** Build a valid CliAuthCredentials object for test use. */
function makeCredentials(overrides?: Partial<CliAuthCredentials>): CliAuthCredentials {
  return {
    user_id: 'user-001',
    email: 'alice@example.com',
    access_token: 'old-access-token',
    refresh_token: 'old-refresh-token',
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    created_at: '2025-06-15T10:00:00.000Z',
    ...overrides,
  };
}

/** Build a mock fetch Response for a successful token refresh. */
function makeTokenResponse(overrides?: Record<string, unknown>) {
  return {
    access_token: 'new-access-token',
    refresh_token: 'new-refresh-token',
    expires_in: 3600,
    user: { id: 'user-001', email: 'alice@example.com' },
    ...overrides,
  };
}

describe('refreshAccessToken', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return updated credentials with new tokens when refresh succeeds', async () => {
    const tokenData = makeTokenResponse();
    mockFetch.mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue(tokenData),
    });

    const creds = makeCredentials();
    const result = await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

    expect(result).not.toBeNull();
    expect(result!.access_token).toBe('new-access-token');
    expect(result!.refresh_token).toBe('new-refresh-token');
    expect(result!.user_id).toBe('user-001');
    expect(result!.email).toBe('alice@example.com');
    // expires_at should be a valid ISO string in the future
    const expiresAt = new Date(result!.expires_at).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('should call saveCredentials with the updated credentials when refresh succeeds', async () => {
    const tokenData = makeTokenResponse();
    mockFetch.mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue(tokenData),
    });

    const creds = makeCredentials();
    const result = await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

    expect(saveCredentials).toHaveBeenCalledTimes(1);
    expect(saveCredentials).toHaveBeenCalledWith(result);
  });

  it('should preserve the original created_at value when refresh succeeds', async () => {
    const originalCreatedAt = '2024-01-01T00:00:00.000Z';
    const tokenData = makeTokenResponse();
    mockFetch.mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue(tokenData),
    });

    const creds = makeCredentials({ created_at: originalCreatedAt });
    const result = await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

    expect(result).not.toBeNull();
    expect(result!.created_at).toBe(originalCreatedAt);
  });

  it('should POST to the correct Supabase token endpoint with apikey header when called', async () => {
    const tokenData = makeTokenResponse();
    mockFetch.mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue(tokenData),
    });

    const creds = makeCredentials();
    await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: creds.refresh_token }),
      }
    );
  });

  it('should compute expires_at from expires_in seconds when refresh succeeds', async () => {
    const expiresInSeconds = 7200; // 2 hours
    const tokenData = makeTokenResponse({ expires_in: expiresInSeconds });
    mockFetch.mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue(tokenData),
    });

    const beforeCall = Date.now();
    const creds = makeCredentials();
    const result = await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);
    const afterCall = Date.now();

    expect(result).not.toBeNull();
    const expiresAtMs = new Date(result!.expires_at).getTime();
    // expires_at should be approximately now + expiresInSeconds * 1000
    expect(expiresAtMs).toBeGreaterThanOrEqual(beforeCall + expiresInSeconds * 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(afterCall + expiresInSeconds * 1000);
  });

  it('should return null when the server responds with a non-200 status', async () => {
    mockFetch.mockResolvedValue({
      status: 401,
      json: vi.fn().mockResolvedValue({ error: 'invalid_grant' }),
    });

    const creds = makeCredentials();
    const result = await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

    expect(result).toBeNull();
  });

  it('should not call saveCredentials when the server responds with a non-200 status', async () => {
    mockFetch.mockResolvedValue({
      status: 401,
      json: vi.fn().mockResolvedValue({ error: 'invalid_grant' }),
    });

    const creds = makeCredentials();
    await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

    expect(saveCredentials).not.toHaveBeenCalled();
  });

  it('should return null when fetch throws a network error', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const creds = makeCredentials();
    const result = await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

    expect(result).toBeNull();
  });

  it('should not call saveCredentials when fetch throws a network error', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const creds = makeCredentials();
    await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

    expect(saveCredentials).not.toHaveBeenCalled();
  });

  describe('concurrent refresh scenarios', () => {
    it('should handle concurrent refresh attempts with the same credentials', async () => {
      const tokenData = makeTokenResponse();
      mockFetch.mockResolvedValue({
        status: 200,
        json: vi.fn().mockResolvedValue(tokenData),
      });

      const creds = makeCredentials();

      // Launch three concurrent refresh calls
      const [result1, result2, result3] = await Promise.all([
        refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY),
        refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY),
        refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY),
      ]);

      // All should succeed with the same tokens
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result3).not.toBeNull();
      expect(result1!.access_token).toBe('new-access-token');
      expect(result2!.access_token).toBe('new-access-token');
      expect(result3!.access_token).toBe('new-access-token');

      // All three should have called fetch (no deduplication)
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // saveCredentials should have been called three times (race condition — last write wins)
      expect(saveCredentials).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent refresh with different credentials', async () => {
      const tokenData1 = makeTokenResponse({
        access_token: 'token-a',
        user: { id: 'user-a', email: 'a@example.com' },
      });
      const tokenData2 = makeTokenResponse({
        access_token: 'token-b',
        user: { id: 'user-b', email: 'b@example.com' },
      });

      // First call returns tokenData1, second returns tokenData2
      mockFetch
        .mockResolvedValueOnce({
          status: 200,
          json: vi.fn().mockResolvedValue(tokenData1),
        })
        .mockResolvedValueOnce({
          status: 200,
          json: vi.fn().mockResolvedValue(tokenData2),
        });

      const credsA = makeCredentials({ user_id: 'user-a', email: 'a@example.com' });
      const credsB = makeCredentials({ user_id: 'user-b', email: 'b@example.com' });

      // Launch concurrent refreshes for different users
      const [resultA, resultB] = await Promise.all([
        refreshAccessToken(credsA, SUPABASE_URL, SUPABASE_ANON_KEY),
        refreshAccessToken(credsB, SUPABASE_URL, SUPABASE_ANON_KEY),
      ]);

      expect(resultA).not.toBeNull();
      expect(resultB).not.toBeNull();
      expect(resultA!.access_token).toBe('token-a');
      expect(resultB!.access_token).toBe('token-b');

      // saveCredentials called twice — race condition: last write wins
      expect(saveCredentials).toHaveBeenCalledTimes(2);
    });

    it('should handle refresh during active operation using credentials', async () => {
      // Simulates: one refresh in progress while another operation reads credentials
      const tokenData = makeTokenResponse();
      let resolveRefresh: (value: unknown) => void;
      const refreshPromise = new Promise((resolve) => {
        resolveRefresh = resolve;
      });

      mockFetch.mockImplementation(async () => {
        await refreshPromise; // Block until we signal
        return {
          status: 200,
          json: vi.fn().mockResolvedValue(tokenData),
        };
      });

      const creds = makeCredentials();

      // Start refresh (will be blocked)
      const refreshResult = refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

      // Meanwhile, another operation reads the old credentials
      const accessedToken = creds.access_token;
      expect(accessedToken).toBe('old-access-token');

      // Unblock the refresh
      resolveRefresh!({
        status: 200,
        json: vi.fn().mockResolvedValue(tokenData),
      });

      const result = await refreshResult;

      // Refresh succeeded
      expect(result).not.toBeNull();
      expect(result!.access_token).toBe('new-access-token');

      // Original credentials object is unchanged (immutability)
      expect(creds.access_token).toBe('old-access-token');

      // saveCredentials was called with new credentials
      expect(saveCredentials).toHaveBeenCalledWith(result);
    });

    it('should distinguish network timeout from other errors', async () => {
      // Network timeout: fetch rejects with TypeError
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const creds = makeCredentials();
      const timeoutResult = await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

      expect(timeoutResult).toBeNull();
      expect(saveCredentials).not.toHaveBeenCalled();

      // Reset mocks
      vi.clearAllMocks();

      // Server error: fetch resolves but with 500 status
      mockFetch.mockResolvedValueOnce({
        status: 500,
        json: vi.fn().mockResolvedValue({ error: 'internal_error' }),
      });

      const errorResult = await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

      expect(errorResult).toBeNull();
      expect(saveCredentials).not.toHaveBeenCalled();

      // Reset mocks
      vi.clearAllMocks();

      // Invalid grant: fetch resolves but with 401 status
      mockFetch.mockResolvedValueOnce({
        status: 401,
        json: vi.fn().mockResolvedValue({ error: 'invalid_grant' }),
      });

      const invalidGrantResult = await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

      expect(invalidGrantResult).toBeNull();
      expect(saveCredentials).not.toHaveBeenCalled();
    });

    it('should handle partial success when fetch succeeds but saveCredentials fails', async () => {
      // Mock saveCredentials to throw (e.g., disk full, permission denied)
      const tokenData = makeTokenResponse();
      mockFetch.mockResolvedValue({
        status: 200,
        json: vi.fn().mockResolvedValue(tokenData),
      });

      // @ts-expect-error - mocking an implementation detail
      saveCredentials.mockImplementationOnce(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      const creds = makeCredentials();

      // The function catches all errors and returns null
      const result = await refreshAccessToken(creds, SUPABASE_URL, SUPABASE_ANON_KEY);

      // Refresh failed despite successful fetch
      expect(result).toBeNull();
      expect(saveCredentials).toHaveBeenCalledTimes(1);
    });
  });
});
