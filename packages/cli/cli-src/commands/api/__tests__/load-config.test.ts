/**
 * Tests for `loadConfig` auth precedence in `agentmark api --remote`.
 *
 * The contract under test (commit feat(cli,gateway): session-bearer auth for
 * agentmark api):
 *
 *   1. AGENTMARK_API_KEY + AGENTMARK_APP_ID env vars win outright.
 *   2. Session bearer from `agentmark login` (saved at ~/.agentmark/auth.json)
 *      is the default. Expired bearers are refreshed AND persisted.
 *   3. Legacy `agentmark link` forwarding config is the last resort.
 *   4. Nothing configured → throw with an actionable message.
 *
 * Each case asserts the EXACT ApiConfig returned (apiKey value, appId value,
 * apiUrl), so a regression that swaps precedence or drops the persist-on-
 * refresh step is caught directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../auth/credentials', () => ({
  loadCredentials: vi.fn(),
  isExpired: vi.fn(),
  saveCredentials: vi.fn(),
}));

vi.mock('../../../auth/token-refresh', () => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock('../../../forwarding/config', () => ({
  loadForwardingConfig: vi.fn(),
}));

import { loadConfig } from '../index';
import {
  loadCredentials,
  isExpired,
  saveCredentials,
} from '../../../auth/credentials';
import { refreshAccessToken } from '../../../auth/token-refresh';
import { loadForwardingConfig } from '../../../forwarding/config';
import { DEFAULT_API_URL } from '../../../auth/constants';

const loadCredentialsMock = vi.mocked(loadCredentials);
const isExpiredMock = vi.mocked(isExpired);
const saveCredentialsMock = vi.mocked(saveCredentials);
const refreshAccessTokenMock = vi.mocked(refreshAccessToken);
const loadForwardingConfigMock = vi.mocked(loadForwardingConfig);

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.AGENTMARK_API_KEY;
  delete process.env.AGENTMARK_APP_ID;
  delete process.env.AGENTMARK_API_URL;
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('loadConfig (remote)', () => {
  // -------------------------------------------------------------------------
  // 1. Env-var override (highest priority)
  // -------------------------------------------------------------------------

  it('env vars (API_KEY + APP_ID) take precedence over session bearer', async () => {
    process.env.AGENTMARK_API_KEY = 'sk_from_env';
    process.env.AGENTMARK_APP_ID = 'app_from_env';
    // Session bearer would also be valid — env should still win.
    loadCredentialsMock.mockReturnValue({
      access_token: 'jwt.session.bearer',
      refresh_token: 'refresh.bearer',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      user_id: 'u',
      email: 'a@b',
    });
    isExpiredMock.mockReturnValue(false);

    const config = await loadConfig(true);

    expect(config).toEqual({
      apiKey: 'sk_from_env',
      appId: 'app_from_env',
      apiUrl: DEFAULT_API_URL,
      isLocal: false,
    });
    // Session bearer code path must NOT have been consulted.
    expect(loadCredentialsMock).not.toHaveBeenCalled();
  });

  it('honors AGENTMARK_API_URL when env vars are set', async () => {
    process.env.AGENTMARK_API_KEY = 'sk_from_env';
    process.env.AGENTMARK_APP_ID = 'app_from_env';
    process.env.AGENTMARK_API_URL = 'https://api-stg.agentmark.co';

    const config = await loadConfig(true);

    expect(config.apiUrl).toBe('https://api-stg.agentmark.co');
  });

  // -------------------------------------------------------------------------
  // 2. Session bearer (the headless-CLI primary path)
  // -------------------------------------------------------------------------

  it('uses session bearer from auth.json when env vars are absent', async () => {
    loadCredentialsMock.mockReturnValue({
      access_token: 'jwt.session.bearer',
      refresh_token: 'refresh.bearer',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      user_id: 'u',
      email: 'a@b',
    });
    isExpiredMock.mockReturnValue(false);

    const config = await loadConfig(true);

    // The bearer becomes apiKey (specli injects it as Authorization: Bearer ...).
    // appId is '' — tenant-scoped routes (POST /v1/apps) don't require it.
    expect(config).toEqual({
      apiKey: 'jwt.session.bearer',
      appId: '',
      apiUrl: DEFAULT_API_URL,
      isLocal: false,
    });
    // Forwarding config should not be consulted when bearer is healthy.
    expect(loadForwardingConfigMock).not.toHaveBeenCalled();
    // No save (token not expired).
    expect(saveCredentialsMock).not.toHaveBeenCalled();
  });

  it('refreshes an expired session bearer AND persists the new tokens', async () => {
    const expired = {
      access_token: 'jwt.old',
      refresh_token: 'refresh.old',
      expires_at: new Date(Date.now() - 1000).toISOString(),
      user_id: 'u',
      email: 'a@b',
    };
    const fresh = {
      access_token: 'jwt.fresh',
      refresh_token: 'refresh.fresh',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      user_id: 'u',
      email: 'a@b',
    };
    loadCredentialsMock.mockReturnValue(expired);
    // First call (on expired) returns true; second call (on fresh) returns false.
    isExpiredMock
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    refreshAccessTokenMock.mockResolvedValue(fresh);

    const config = await loadConfig(true);

    expect(refreshAccessTokenMock).toHaveBeenCalledWith(
      expired,
      expect.any(String),
      expect.any(String),
    );
    // Without the saveCredentials call, every subsequent CLI invocation
    // re-pays the refresh round-trip. Catching this drop is the whole
    // point of the assertion.
    expect(saveCredentialsMock).toHaveBeenCalledWith(fresh);
    expect(config.apiKey).toBe('jwt.fresh');
  });

  it('honors AGENTMARK_APP_ID with the session bearer when set explicitly', async () => {
    // Useful for per-app commands (`agentmark api traces list --remote`) when
    // the user has set AGENTMARK_APP_ID in their shell but is still using
    // the session bearer for auth.
    process.env.AGENTMARK_APP_ID = 'app_explicit';
    loadCredentialsMock.mockReturnValue({
      access_token: 'jwt.session',
      refresh_token: 'refresh',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      user_id: 'u',
      email: 'a@b',
    });
    isExpiredMock.mockReturnValue(false);

    const config = await loadConfig(true);

    expect(config.appId).toBe('app_explicit');
    expect(config.apiKey).toBe('jwt.session');
  });

  it('falls through to forwarding-config when refresh fails AND bearer is expired', async () => {
    loadCredentialsMock.mockReturnValue({
      access_token: 'jwt.dead',
      refresh_token: 'refresh.dead',
      expires_at: new Date(Date.now() - 1000).toISOString(),
      user_id: 'u',
      email: 'a@b',
    });
    isExpiredMock.mockReturnValue(true);
    refreshAccessTokenMock.mockResolvedValue(null); // refresh failed
    loadForwardingConfigMock.mockReturnValue({
      apiKey: 'sk_legacy_link',
      appId: 'app_legacy',
      baseUrl: 'https://api.agentmark.co',
    });

    const config = await loadConfig(true);

    expect(config).toEqual({
      apiKey: 'sk_legacy_link',
      appId: 'app_legacy',
      apiUrl: 'https://api.agentmark.co',
      isLocal: false,
    });
  });

  // -------------------------------------------------------------------------
  // 3. Legacy forwarding-config fallback (`agentmark link`)
  // -------------------------------------------------------------------------

  it('uses forwarding-config when no env vars and no session bearer', async () => {
    loadCredentialsMock.mockReturnValue(null);
    loadForwardingConfigMock.mockReturnValue({
      apiKey: 'sk_linked',
      appId: 'app_linked',
      baseUrl: 'https://api.agentmark.co',
    });

    const config = await loadConfig(true);

    expect(config).toEqual({
      apiKey: 'sk_linked',
      appId: 'app_linked',
      apiUrl: 'https://api.agentmark.co',
      isLocal: false,
    });
  });

  // -------------------------------------------------------------------------
  // 4. Nothing configured
  // -------------------------------------------------------------------------

  it('throws with an actionable message when nothing is configured', async () => {
    loadCredentialsMock.mockReturnValue(null);
    loadForwardingConfigMock.mockReturnValue(null);

    await expect(loadConfig(true)).rejects.toThrow(
      /Run `agentmark login`.*AGENTMARK_API_KEY.*AGENTMARK_APP_ID/s,
    );
  });
});
