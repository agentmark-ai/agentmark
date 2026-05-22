/**
 * App schemas for the public /v1/apps/* surface.
 *
 * Apps are the top-level tenant entity — every other resource (alerts,
 * api keys, deployments, traces, prompts) hangs off an app. This surface
 * lets a headless agent (or the dashboard) provision an app without the
 * dashboard UI, which is the load-bearing prerequisite for the rest of
 * the headless onboarding flow.
 *
 * Deployment-related columns on the underlying `app` table
 * (`fly_app_name`, `fly_machine_id`, `fly_machine_url`, `commit_sha`)
 * are exposed read-only — they're managed by the deploy orchestrator,
 * not by callers. Only `name`, `entry_point`, and `runtime` are
 * writable through this surface.
 */

import { z } from "zod";
import {
  PaginationParamsSchema,
  itemResponse,
  listResponse,
  stripNullBytes,
} from "./common";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const APP_RUNTIME_VALUES = ["nodejs", "python"] as const;
export type AppRuntime = (typeof APP_RUNTIME_VALUES)[number];

// ---------------------------------------------------------------------------
// Request: Create
//
// Only `name` is required. `runtime` defaults to 'nodejs' server-side to
// match the DB column default; agents that don't care can omit it.
// ---------------------------------------------------------------------------

export const CreateAppBodySchema = z.object({
  name: z.preprocess(stripNullBytes, z.string().min(1).max(100)),
  runtime: z.enum(APP_RUNTIME_VALUES).optional(),
  entry_point: z.preprocess(stripNullBytes, z.string().max(255)).optional(),
});

// ---------------------------------------------------------------------------
// Request: Update
//
// PATCH semantics: any subset of writable fields. We require at least one
// field via `.refine()` so an empty `{}` body doesn't trigger a no-op
// UPDATE that bumps `updated_at` without changing state.
// ---------------------------------------------------------------------------

const UpdateAppBodyBase = z.object({
  name: z.preprocess(stripNullBytes, z.string().min(1).max(100)).optional(),
  runtime: z.enum(APP_RUNTIME_VALUES).optional(),
  entry_point: z.preprocess(stripNullBytes, z.string().max(255)).nullable().optional(),
});

export const UpdateAppBodySchema = UpdateAppBodyBase.refine(
  (val) => Object.values(val).some((v) => v !== undefined),
  { message: "At least one writable field must be provided" },
);

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

export const AppsListParamsSchema = PaginationParamsSchema.extend({
  // Exact-match name filter. The dashboard lists by tenant; an agent
  // doing "is there already an app called X" lookup hits this.
  name: z.preprocess(stripNullBytes, z.string().min(1).max(100)).optional(),
});

// ---------------------------------------------------------------------------
// Response object schemas
// ---------------------------------------------------------------------------

export const AppSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string(),
  runtime: z.enum(APP_RUNTIME_VALUES).nullable(),
  entry_point: z.string().nullable(),
  commit_sha: z.string().nullable(),
  fly_app_name: z.string().nullable(),
  fly_machine_id: z.string().nullable(),
  fly_machine_url: z.string().nullable(),
  created_at: z.string().datetime().nullable(),
  created_by: z.string().nullable(),
  updated_at: z.string().datetime().nullable(),
  updated_by: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Response envelopes
// ---------------------------------------------------------------------------

export const AppListResponseSchema = listResponse(AppSchema);
export const AppDetailResponseSchema = itemResponse(AppSchema);

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type CreateAppBody = z.infer<typeof CreateAppBodySchema>;
export type UpdateAppBody = z.infer<typeof UpdateAppBodySchema>;
export type App = z.infer<typeof AppSchema>;
export type AppsListParams = z.infer<typeof AppsListParamsSchema>;

// ---------------------------------------------------------------------------
// Git connection (GET /v1/apps/:appId/git)
//
// Read-only view of an app's current git connection state. Headless
// callers poll this after kicking a human through the install URL to
// detect when the OAuth callback has registered the connection.
//
// The POST /v1/apps/:appId/git/connect endpoint (URL helper) is scoped
// for a follow-up — its design depends on per-provider install URL
// construction (GitHub App install link vs GitLab OAuth) plus state-
// token signing for CSRF defense, which doesn't fit this PR.
// ---------------------------------------------------------------------------

export const GIT_PROVIDER_VALUES = ["github", "gitlab"] as const;
export type GitProvider = (typeof GIT_PROVIDER_VALUES)[number];

export const GitConnectionStatusSchema = z.object({
  connected: z.boolean(),
  provider: z.enum(GIT_PROVIDER_VALUES).nullable(),
  repository: z.string().nullable(),
  branch: z.string().nullable(),
  installation_id: z.number().int().nullable(),
});

export const GitConnectionStatusResponseSchema = z.object({
  data: GitConnectionStatusSchema,
});

export type GitConnectionStatus = z.infer<typeof GitConnectionStatusSchema>;

// ---------------------------------------------------------------------------
// Git connect URL helper (POST /v1/apps/:appId/git/connect)
//
// Returns a per-provider authorization URL the caller can hand to a human
// for one-click install. The state token in the URL is HMAC-signed by the
// gateway; the OAuth callback validates the signature and TTL before
// upserting the git_connection row.
//
// Headless flow:
//   1. POST /v1/apps/:appId/git/connect { provider }  → { authorization_url, state, expires_at }
//   2. Headless agent prints/sends URL to user; user clicks once.
//   3. Provider redirects to AgentMark's OAuth callback with the state.
//   4. Callback validates state and persists the connection.
//   5. Agent polls GET /v1/apps/:appId/git until { connected: true }.
// ---------------------------------------------------------------------------

export const StartGitConnectBodySchema = z.object({
  provider: z.enum(GIT_PROVIDER_VALUES),
});

export const GitConnectAuthorizationSchema = z.object({
  authorization_url: z.string().url(),
  state: z.string().min(1),
  expires_at: z.string().datetime(),
});

export const GitConnectAuthorizationResponseSchema = z.object({
  data: GitConnectAuthorizationSchema,
});

export type StartGitConnectBody = z.infer<typeof StartGitConnectBodySchema>;
export type GitConnectAuthorization = z.infer<typeof GitConnectAuthorizationSchema>;
