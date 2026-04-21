/**
 * Tenant Context Types
 * Feature: 007-analytics-architecture-evaluation
 *
 * Provides type-safe tenant context for multi-tenant data access.
 * Uses branded types to ensure appId can only come from verification.
 *
 * NOTE: The verifyAppAccess() function is NOT included here because it
 * depends on `server-only` and Supabase. It remains in the dashboard app.
 * This module exports only the types and type guard.
 */

import type { VerifiedAppId } from './types';

// ============================================================================
// Tenant Context
// ============================================================================

/**
 * Immutable tenant context created after verification.
 *
 * All analytics data access methods require this context,
 * ensuring tenant isolation is enforced at the type level.
 */
export interface TenantContext {
  /** User ID from authentication */
  readonly userId: string;
  /** Tenant ID from JWT app_metadata */
  readonly tenantId: string;
  /** Verified app ID - guaranteed to belong to tenantId */
  readonly appId: VerifiedAppId;
  /** Data retention window in days (-1 = unlimited) */
  readonly dataRetentionDays: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a VerifiedAppId from a string that has been verified externally
 * (e.g., by Unkey API key validation or Supabase RLS).
 *
 * Performs a runtime check that the value is a non-empty string.
 * This is the sanctioned way to create a VerifiedAppId in the gateway,
 * where verification happens via API key middleware rather than verifyAppAccess().
 *
 * @throws {Error} if the value is empty or not a string
 */
export function createVerifiedAppId(appId: string): VerifiedAppId {
  if (typeof appId !== 'string' || appId.length === 0) {
    throw new Error('createVerifiedAppId: appId must be a non-empty string');
  }
  return appId as VerifiedAppId;
}

// ============================================================================
// Type Guards and Utilities
// ============================================================================

/**
 * Type guard to check if a value is a valid TenantContext.
 *
 * Useful for runtime validation in edge cases.
 */
export function isTenantContext(value: unknown): value is TenantContext {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.userId === 'string' &&
    typeof obj.tenantId === 'string' &&
    typeof obj.appId === 'string' &&
    typeof obj.dataRetentionDays === 'number' &&
    obj.userId.length > 0 &&
    obj.tenantId.length > 0 &&
    obj.appId.length > 0
  );
}
