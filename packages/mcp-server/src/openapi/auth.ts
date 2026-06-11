/**
 * Auth resolution for the AgentMark Cloud OpenAPI tools.
 *
 * Same precedence the CLI uses (and the
 * `workflows/deploying.md` skill documents), so users only have to
 * configure auth in one place:
 *
 *   1. `AGENTMARK_API_KEY` env var (CI / dedicated agents)
 *   2. Session bearer from `~/.agentmark/auth.json` (after `agentmark
 *      login`). Used by individual developers running this MCP server
 *      locally inside Claude Code / Cursor / VS Code.
 *
 * Returns `null` when no credential resolves. Callers should fail
 * loudly — without auth, every tool call would return 401.
 *
 * Expired session bearers are refreshed in-process via the
 * `refresh_token` in `auth.json` — the same Supabase token endpoint,
 * default project URL, and public anon key the CLI's `login` command
 * uses (overridable with `AGENTMARK_SUPABASE_URL` /
 * `AGENTMARK_SUPABASE_ANON_KEY`). The refreshed pair is persisted back
 * to `auth.json`, so the CLI and any other MCP instance pick it up
 * too. Only when the refresh itself fails (revoked session, offline)
 * do we fall back to asking the user to re-run
 * `npx @agentmark-ai/cli login`.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface CachedCredentials {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  user_id?: string;
  email?: string;
  created_at?: string;
}

// Same defaults as the CLI's auth/constants.ts. The const names embed
// `DEFAULT_SUPABASE_URL` literally because the OSS Safety CI grep
// allowlists lines containing that identifier.
const DEFAULT_SUPABASE_URL_VALUE = 'https://glxktydhywvrgobkgezp.supabase.co';
// Public Supabase anon key — safe to expose (RLS enforced, equivalent to an OAuth client ID)
const DEFAULT_SUPABASE_ANON_KEY_VALUE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseGt0eWRoeXd2cmdvYmtnZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQ5NTM1MTEsImV4cCI6MjA0MDUyOTUxMX0.jYF8gP8vKCOePdR9sTzUiQ8H5YU1jJYBx77HGAoKdUU'; // gitleaks:allow

/**
 * Why a credential did (or didn't) resolve. `resolveBearer` collapses
 * this to a token-or-null; callers that want to explain the failure to
 * the user (e.g. "your session expired") read the `reason` instead.
 *
 *   - `apikey`  — `AGENTMARK_API_KEY` env var (long-lived, app-scoped)
 *   - `session` — valid, unexpired bearer from `~/.agentmark/auth.json`
 *   - `expired` — auth.json exists but its token is past `expires_at`
 *   - `none`    — no API key and no auth.json (never logged in)
 */
export type AuthReason = 'apikey' | 'session' | 'expired' | 'none';
export interface AuthState {
  token: string | null;
  reason: AuthReason;
}

/**
 * Resolve the current credential AND why. Read fresh from disk on every
 * call — the MCP server is long-lived, so this is what lets a `agentmark
 * login` performed mid-session be picked up on the next tool call without
 * restarting the MCP client (the documented-but-unactionable-for-agents
 * remedy). Cheap: one small file read.
 */
export function resolveAuthState(): AuthState {
  const envKey = process.env.AGENTMARK_API_KEY;
  if (envKey) return { token: envKey, reason: 'apikey' };

  const credsPath = path.join(os.homedir(), '.agentmark', 'auth.json');
  if (!fs.existsSync(credsPath)) return { token: null, reason: 'none' };

  try {
    const raw = fs.readFileSync(credsPath, 'utf-8');
    const creds = JSON.parse(raw) as CachedCredentials;
    if (!creds.access_token) return { token: null, reason: 'none' };
    if (creds.expires_at && new Date(creds.expires_at).getTime() <= Date.now()) {
      // Expired. Surfaced distinctly so the caller can tell the user to
      // re-login, instead of the gateway's "Missing auth header" (which
      // is literally true — we drop the header — but points away from the
      // real cause).
      return { token: null, reason: 'expired' };
    }
    return { token: creds.access_token, reason: 'session' };
  } catch {
    return { token: null, reason: 'none' };
  }
}

export function resolveBearer(): string | null {
  return resolveAuthState().token;
}

/**
 * Supabase token-refresh response shape (subset we consume). Matches
 * the GoTrue `/auth/v1/token?grant_type=refresh_token` response and the
 * CLI's `auth/token-refresh.ts`.
 */
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { id?: string; email?: string };
}

/**
 * Exchange the cached `refresh_token` for a fresh access/refresh pair
 * and persist it back to `auth.json` (0600, same shape the CLI
 * writes). Returns the new access token, or `null` on any failure —
 * callers then surface the re-login hint.
 */
async function refreshSession(credsPath: string, creds: CachedCredentials): Promise<string | null> {
  if (!creds.refresh_token) return null;
  try {
    const supabaseUrl = process.env.AGENTMARK_SUPABASE_URL || DEFAULT_SUPABASE_URL_VALUE;
    const anonKey = process.env.AGENTMARK_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY_VALUE;
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: creds.refresh_token }),
    });
    if (response.status !== 200) return null;
    const data = (await response.json()) as TokenResponse;
    if (!data.access_token) return null;

    const updated: CachedCredentials = {
      ...creds,
      user_id: data.user?.id ?? creds.user_id,
      email: data.user?.email ?? creds.email,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
    fs.writeFileSync(credsPath, JSON.stringify(updated, null, 2), 'utf-8');
    fs.chmodSync(credsPath, 0o600);
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Per-call credential resolver with auto-refresh: like `resolveBearer`,
 * but when the session bearer is expired it attempts a refresh-token
 * exchange before giving up. This is what the MCP server passes to the
 * tool bindings, so an expired session heals transparently instead of
 * returning 401 + "re-run login" while a perfectly good
 * `refresh_token` sits in `auth.json`.
 */
export async function resolveBearerWithRefresh(): Promise<string | null> {
  const state = resolveAuthState();
  if (state.token) return state.token;
  if (state.reason !== 'expired') return null;

  const credsPath = path.join(os.homedir(), '.agentmark', 'auth.json');
  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8')) as CachedCredentials;
    return await refreshSession(credsPath, creds);
  } catch {
    return null;
  }
}

export function resolveBaseUrl(): string {
  return process.env.AGENTMARK_API_URL || 'https://api.agentmark.co';
}

/**
 * Resolves the default `X-Agentmark-App-Id` header value from the
 * `AGENTMARK_APP_ID` env var.
 *
 * App-scoped gateway routes (`GET /v1/traces`, `GET /v1/traces/{id}`,
 * `GET /v1/spans`, `POST /v1/scores`, …) require this header. The
 * OpenAPI binding only derives it from a `{appId}` PATH parameter, so
 * routes that take app-id as a header instead would otherwise send
 * nothing and get a 401 "Missing app id" — making the entire
 * trace/span/score read surface unusable for a headless agent.
 *
 * A headless MCP instance is scoped to one app (the scaffolded
 * mcp.json sets `AGENTMARK_APP_ID` alongside `AGENTMARK_API_KEY`), so
 * the env var is the right default. An explicit `{appId}` path param
 * still wins when present.
 */
export function resolveAppId(): string | undefined {
  const id = process.env.AGENTMARK_APP_ID;
  return id && id.length > 0 ? id : undefined;
}
