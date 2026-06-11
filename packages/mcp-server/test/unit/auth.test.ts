/**
 * Unit tests for credential resolution (`resolveAuthState` / `resolveBearer`).
 *
 * Uses a real temp `$HOME` + on-disk auth.json rather than mocking node
 * builtins (ESM namespaces aren't spy-able). `os.homedir()` honors `$HOME`
 * on POSIX, which is what these tests run on.
 *
 * Each case maps to a concrete bug class:
 *   - API key wins over a stale auth.json        (env precedence)
 *   - valid session token resolves               (happy path)
 *   - EXPIRED token → reason:'expired', no token  (the #2655/#2657 distinction:
 *       expiry must be surfaced as its own reason so callers can say
 *       "re-login" instead of leaking it as "no creds" / "missing header")
 *   - no file → reason:'none'                     (never logged in)
 *   - malformed JSON → reason:'none', no throw    (corrupt cache is recoverable)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAuthState, resolveBearer, resolveBearerWithRefresh } from '../../src/openapi/auth.js';

describe('resolveAuthState', () => {
  const realHome = process.env.HOME;
  const realUserProfile = process.env.USERPROFILE;
  const realApiKey = process.env.AGENTMARK_API_KEY;
  let home: string;

  function writeAuth(creds: Record<string, unknown>): void {
    mkdirSync(join(home, '.agentmark'), { recursive: true });
    writeFileSync(join(home, '.agentmark', 'auth.json'), JSON.stringify(creds));
  }

  beforeEach(() => {
    delete process.env.AGENTMARK_API_KEY;
    home = mkdtempSync(join(tmpdir(), 'am-auth-'));
    process.env.HOME = home;
    // os.homedir() reads USERPROFILE on Windows (not HOME), so point both at the
    // temp dir — otherwise resolveAuthState() resolves the real home on Windows,
    // never finds the written auth.json, and every read collapses to reason:'none'.
    process.env.USERPROFILE = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    if (realHome === undefined) delete process.env.HOME;
    else process.env.HOME = realHome;
    if (realUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = realUserProfile;
    if (realApiKey === undefined) delete process.env.AGENTMARK_API_KEY;
    else process.env.AGENTMARK_API_KEY = realApiKey;
  });

  it('prefers AGENTMARK_API_KEY (reason: apikey) even when auth.json exists', () => {
    process.env.AGENTMARK_API_KEY = 'am_live_key';
    writeAuth({ access_token: 'sess_ignored' });
    expect(resolveAuthState()).toEqual({ token: 'am_live_key', reason: 'apikey' });
  });

  it('resolves a valid, unexpired session token (reason: session)', () => {
    writeAuth({
      access_token: 'sess_abc',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(resolveAuthState()).toEqual({ token: 'sess_abc', reason: 'session' });
    expect(resolveBearer()).toBe('sess_abc');
  });

  it('reports an EXPIRED token distinctly (reason: expired, token: null)', () => {
    writeAuth({
      access_token: 'sess_old',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    // The point of the whole change: expiry is NOT collapsed into "none".
    expect(resolveAuthState()).toEqual({ token: null, reason: 'expired' });
    expect(resolveBearer()).toBeNull();
  });

  it('reports no credential (reason: none) when auth.json is absent', () => {
    expect(resolveAuthState()).toEqual({ token: null, reason: 'none' });
  });

  it('treats a session with no expires_at as valid (reason: session)', () => {
    writeAuth({ access_token: 'sess_noexp' });
    expect(resolveAuthState()).toEqual({ token: 'sess_noexp', reason: 'session' });
  });

  it('does not throw on malformed auth.json — degrades to reason: none', () => {
    mkdirSync(join(home, '.agentmark'), { recursive: true });
    writeFileSync(join(home, '.agentmark', 'auth.json'), '{ not valid json');
    expect(resolveAuthState()).toEqual({ token: null, reason: 'none' });
  });

  describe('resolveBearerWithRefresh', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('exchanges the refresh_token for a new pair and persists it (expired session heals)', async () => {
      writeAuth({
        access_token: 'sess_old',
        refresh_token: 'refresh_abc',
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        user_id: 'u1',
        email: 'u@example.com',
      });
      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          access_token: 'sess_new',
          refresh_token: 'refresh_new',
          expires_in: 3600,
          user: { id: 'u1', email: 'u@example.com' },
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(resolveBearerWithRefresh()).resolves.toBe('sess_new');

      // Hits the Supabase refresh grant with the cached refresh token.
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/v1/token?grant_type=refresh_token'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refresh_token: 'refresh_abc' }),
        }),
      );

      // Persists the rotated pair so the CLI and future calls reuse it.
      const persisted = JSON.parse(readFileSync(join(home, '.agentmark', 'auth.json'), 'utf-8'));
      expect(persisted.access_token).toBe('sess_new');
      expect(persisted.refresh_token).toBe('refresh_new');
      expect(new Date(persisted.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('returns null when the refresh grant is rejected (revoked session)', async () => {
      writeAuth({
        access_token: 'sess_old',
        refresh_token: 'refresh_revoked',
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 400, json: async () => ({}) }));
      await expect(resolveBearerWithRefresh()).resolves.toBeNull();
    });

    it('returns the valid session without any network call', async () => {
      writeAuth({
        access_token: 'sess_ok',
        refresh_token: 'refresh_abc',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(resolveBearerWithRefresh()).resolves.toBe('sess_ok');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns null without a network call when there is no refresh_token', async () => {
      writeAuth({
        access_token: 'sess_old',
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(resolveBearerWithRefresh()).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
