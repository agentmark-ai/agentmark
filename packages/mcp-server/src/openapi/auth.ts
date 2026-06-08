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
 * The session bearer is NOT refreshed here. The MCP server is
 * intended to be process-lived (started by the MCP client, runs for
 * the duration of the session). If the cached token expires
 * mid-session, the user re-runs `agentmark login` and restarts the
 * MCP client. Doing in-process refresh would require the same
 * Supabase URL + anon key the CLI knows about, which is more
 * surface area than this package wants to expose.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface CachedCredentials {
  access_token: string;
  expires_at?: string;
}

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
