import { z } from "zod";
import { PaginationParamsSchema, listResponse, itemResponse } from "./common";

// ---------------------------------------------------------------------------
// Deployments (spec 053)
//
// Read-only V1 over the `public.deployment` table. Triggers continue to
// flow through git pushes (auto-deploy via webhooks) and the in-app
// "Redeploy" button; a REST trigger can be added later when a real
// external caller materializes.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Enums (mirror the SQL CHECK constraints on public.deployment)
// ---------------------------------------------------------------------------

export const DEPLOYMENT_STATUS_VALUES = [
  "running",
  "success",
  "failure",
] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUS_VALUES)[number];

export const DEPLOYMENT_TYPE_VALUES = ["manual", "push", "cli"] as const;
export type DeploymentType = (typeof DEPLOYMENT_TYPE_VALUES)[number];

const FILES_STATUS_VALUES = [
  "pending",
  "syncing",
  "synced",
  "failed",
  "skipped",
] as const;

const CODE_STATUS_VALUES = [
  "pending",
  "building",
  "deployed",
  "failed",
  "skipped",
] as const;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

/**
 * Query parameters for `GET /v1/deployments`.
 *
 * `?status=running` is the typical CI use case — "is my deploy still
 * going?" — so we expose it as a first-class filter rather than forcing
 * callers to pull the full list and filter client-side.
 */
export const DeploymentsListParamsSchema = PaginationParamsSchema.extend({
  status: z.enum(DEPLOYMENT_STATUS_VALUES).optional(),
});

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

/**
 * Canonical deployment shape. Mirrors the columns of `public.deployment`
 * that are interesting to API consumers.
 *
 * Omitted from the wire shape (intentionally):
 * - `tenant_id` — implicit from auth context
 * - `metadata` — internal use, varies by deployment_type
 * - `logs` — not exposed via REST in V1
 * - `build_manifest` — internal cache implementation detail
 * - `source_app_id` — internal (clone-from flow)
 * - audit columns (`created_by`, `updated_by`, `updated_at`) — not useful here
 */
export const DeploymentSchema = z.object({
  id: z.string().uuid(),
  app_id: z.string().uuid(),
  deployment_status: z.enum(DEPLOYMENT_STATUS_VALUES).nullable(),
  deployment_type: z.enum(DEPLOYMENT_TYPE_VALUES),
  commit_sha: z.string().nullable(),
  commit_message: z.string().nullable(),
  branch: z.string().nullable(),
  initiated_by: z.string(),
  failure_reason: z.string().nullable(),
  deployment_duration_ms: z.number().int().nullable(),
  files_status: z.enum(FILES_STATUS_VALUES),
  code_status: z.enum(CODE_STATUS_VALUES),
  code_failure_reason: z.string().nullable(),
  cache_hit: z.boolean(),
  cache_decision_kind: z.string().nullable(),
  cache_decision_detail: z.string().nullable(),
  created_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
});

export const DeploymentsListResponseSchema = listResponse(DeploymentSchema);
export const DeploymentResponseSchema = itemResponse(DeploymentSchema);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type DeploymentsListParams = z.infer<typeof DeploymentsListParamsSchema>;
export type Deployment = z.infer<typeof DeploymentSchema>;
export type DeploymentsListResponse = z.infer<typeof DeploymentsListResponseSchema>;
export type DeploymentResponse = z.infer<typeof DeploymentResponseSchema>;
