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
});
