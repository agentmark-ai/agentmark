import { z } from "zod";
import {
  PaginationParamsSchema,
  itemResponse,
  listResponse,
  stripNullBytes,
} from "./common";

// ---------------------------------------------------------------------------
// API Keys (spec 052 §3.4)
//
// These wrap the existing dashboard server actions / Unkey integration.
// AgentMark's `api_key` Supabase table stores metadata only — the plaintext
// key, hash, and lifecycle live in Unkey. Per the existing flow:
//
//   - `id`              → `api_key.api_key_id` (the Unkey keyId, NOT plaintext)
//   - `name`            → `api_key.name`
//   - `app_id`          → `api_key.app_id` (apps own keys; tenant inferred via RLS)
//   - `permissions`     → array of gateway permission codes from
//                         `GATEWAY_PERMISSIONS` (see spec 051). Stored on the
//                         Unkey key, not in Supabase.
//   - `plaintext_key`   → returned EXACTLY ONCE on POST. Never re-fetchable.
//
// Field naming: this file uses `permissions` to match the existing dashboard
// action / Unkey contract (spec 051). The OpenAPI doc still says `scopes` —
// that's a doc-level alias for the same concept and will be reconciled in a
// follow-up. Keys here are the source of truth for the implementation.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const CreateApiKeyParamsSchema = z.object({
  // Stored in Postgres TEXT — strip null bytes at the edge.
  name: z.preprocess(stripNullBytes, z.string().min(1).max(255)),
  // Validated against `GATEWAY_PERMISSIONS` keys in the route handler — we
  // only enforce shape here, since the canonical list lives in the dashboard.
  permissions: z.array(z.string()).default([]),
  // Optional: org-level keys may omit app_id once supported. Today every key
  // is bound to an app per the existing `api_key.app_id NOT NULL` constraint.
  app_id: z.string().uuid().nullable().optional(),
  // Optional environment target by NAME (e.g. "production"). Resolved to the
  // env id server-side and validated against the app; 400 if the app has no
  // env with this name. Omit to bind the key to the caller's own environment
  // (key-auth) or the app's default environment (session/bearer auth).
  environment_name: z
    .preprocess(stripNullBytes, z.string().min(1).max(255))
    .nullable()
    .optional()
    .describe(
      'Name of the environment to bind the new key to (e.g. "production"). Defaults to the app\'s default environment.',
    ),
});

export const ApiKeysListParamsSchema = PaginationParamsSchema;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const ApiKeySchema = z.object({
  // The Unkey keyId — also stored in `api_key.api_key_id`. Strings, not UUIDs.
  id: z.string(),
  name: z.string(),
  // Nullable to allow a future org-level-key shape; today always set.
  app_id: z.string().uuid().nullable(),
  // The environment this key is bound to (api_key.environment_id). Every key
  // carries one — set by the dashboard CTA, managed deployment, and this API.
  // Nullable only to tolerate pre-environment legacy rows.
  environment_id: z.string().uuid().nullable().optional(),
  // Gateway permission codes. May be empty for legacy keys (spec 051).
  permissions: z.array(z.string()),
  // Safe-to-display prefix (e.g. `sk_agentmark_abc1`). Sourced from Unkey.
  key_prefix: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  last_used_at: z.string().datetime().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  revoked_at: z.string().datetime().nullable().optional(),
});

export const ApiKeyWithPlaintextSchema = ApiKeySchema.extend({
  // Returned EXACTLY ONCE on POST. Never persisted server-side.
  plaintext_key: z.string(),
});

export const ApiKeysListResponseSchema = listResponse(ApiKeySchema);
export const ApiKeyDetailResponseSchema = itemResponse(ApiKeySchema);
export const ApiKeyCreateResponseSchema = itemResponse(ApiKeyWithPlaintextSchema);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CreateApiKeyParams = z.infer<typeof CreateApiKeyParamsSchema>;
export type ApiKeysListParams = z.infer<typeof ApiKeysListParamsSchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type ApiKeyWithPlaintext = z.infer<typeof ApiKeyWithPlaintextSchema>;
export type ApiKeysListResponse = z.infer<typeof ApiKeysListResponseSchema>;
export type ApiKeyDetailResponse = z.infer<typeof ApiKeyDetailResponseSchema>;
export type ApiKeyCreateResponse = z.infer<typeof ApiKeyCreateResponseSchema>;
