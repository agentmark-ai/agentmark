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

export function resolveBearer(): string | null {
  const envKey = process.env.AGENTMARK_API_KEY;
  if (envKey) return envKey;

  const credsPath = path.join(os.homedir(), '.agentmark', 'auth.json');
  if (!fs.existsSync(credsPath)) return null;

  try {
    const raw = fs.readFileSync(credsPath, 'utf-8');
    const creds = JSON.parse(raw) as CachedCredentials;
    if (!creds.access_token) return null;
    if (creds.expires_at && new Date(creds.expires_at).getTime() <= Date.now()) {
      return null; // Expired — user should re-login + restart MCP client
    }
    return creds.access_token;
  } catch {
    return null;
  }
}

export function resolveBaseUrl(): string {
  return process.env.AGENTMARK_API_URL || 'https://api.agentmark.co';
}
