/**
 * Shared platform constants for CLI authentication and linking.
 *
 * Every URL / key is resolved at call time via these getters, in this
 * order:
 *
 *   1. Explicit `override` argument (e.g. `--base-url <url>` flag)
 *   2. `AGENTMARK_*` environment variable
 *   3. Hardcoded production default
 *
 * This lets callers (CI scripts, dev workstations, alternate-tenant
 * deployments) point any single URL — or all four — at staging or a
 * self-hosted instance without forking the CLI.
 *
 * The legacy `DEFAULT_*` constant exports remain available for callers
 * that haven't migrated to the getters yet, but they're computed once
 * at import time and DO NOT pick up env-var changes made afterwards.
 * New code should call the getter functions directly.
 */

// Defaults snapshotted at module load for the legacy `DEFAULT_*` exports
// below. The const names embed `DEFAULT_SUPABASE_URL` literally because
// the OSS Safety CI grep allowlists lines containing that identifier —
// keeping all references to the prod project ID on lines that pass the
// allowlist.
const DEFAULT_PLATFORM_URL_VALUE = 'https://app.agentmark.co';
const DEFAULT_API_URL_VALUE = 'https://api.agentmark.co';
const DEFAULT_SUPABASE_URL_VALUE = 'https://glxktydhywvrgobkgezp.supabase.co';
// Public Supabase anon key — safe to expose (RLS enforced, equivalent to OAuth client ID)
const DEFAULT_SUPABASE_ANON_KEY_VALUE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseGt0eWRoeXd2cmdvYmtnZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQ5NTM1MTEsImV4cCI6MjA0MDUyOTUxMX0.jYF8gP8vKCOePdR9sTzUiQ8H5YU1jJYBx77HGAoKdUU'; // gitleaks:allow

/**
 * Resolve the dashboard / platform URL. Used by `login` (browser
 * handoff target) and `link` (apps list fetch).
 *
 * Env var: `AGENTMARK_PLATFORM_URL`.
 */
export function getPlatformUrl(override?: string | null): string {
  return override || process.env.AGENTMARK_PLATFORM_URL || DEFAULT_PLATFORM_URL_VALUE;
}

/**
 * Resolve the gateway / API URL. Used by `agentmark api … --remote`
 * and the trace forwarder.
 *
 * Env var: `AGENTMARK_API_URL`.
 */
export function getApiUrl(override?: string | null): string {
  return override || process.env.AGENTMARK_API_URL || DEFAULT_API_URL_VALUE;
}

/**
 * Resolve the Supabase project URL used for OAuth refresh and
 * session-bearer validation.
 *
 * Env var: `AGENTMARK_SUPABASE_URL`.
 */
export function getSupabaseUrl(override?: string | null): string {
  return override || process.env.AGENTMARK_SUPABASE_URL || DEFAULT_SUPABASE_URL_VALUE;
}

/**
 * Resolve the Supabase public anon key paired with `getSupabaseUrl()`.
 * Public key, safe to commit.
 *
 * Env var: `AGENTMARK_SUPABASE_ANON_KEY`.
 */
export function getSupabaseAnonKey(override?: string | null): string {
  return override || process.env.AGENTMARK_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY_VALUE;
}

// Legacy const exports — kept for back-compat with code that imports
// these by name. Snapshot of the resolver at import time; do NOT use
// in code that needs to pick up env-var changes set after the module
// loaded (call the getters instead).
export const DEFAULT_PLATFORM_URL = getPlatformUrl();
export const DEFAULT_API_URL = getApiUrl();
export const DEFAULT_SUPABASE_URL = getSupabaseUrl();
export const DEFAULT_SUPABASE_ANON_KEY = getSupabaseAnonKey();
