/**
 * API-key schema contract (env-scoped key creation, #5).
 *
 * Locks the two contract changes that let a caller mint a key for a specific
 * environment and see which env a key is bound to:
 *   - `CreateApiKeyParamsSchema.environment_name` — optional, parsed when given.
 *   - `ApiKeySchema.environment_id` — surfaced on reads.
 */

import { describe, it, expect } from 'vitest';
import { CreateApiKeyParamsSchema, ApiKeySchema } from '../index';

describe('CreateApiKeyParamsSchema.environment_name', () => {
  it('is optional — a body without it still parses', () => {
    const parsed = CreateApiKeyParamsSchema.parse({ name: 'ci', permissions: [] });
    expect(parsed.environment_name).toBeUndefined();
  });

  it('parses an explicit environment name through', () => {
    const parsed = CreateApiKeyParamsSchema.parse({
      name: 'prod-key',
      permissions: ['trace.write'],
      environment_name: 'production',
    });
    expect(parsed.environment_name).toBe('production');
  });

  it('rejects an empty environment_name (min length 1)', () => {
    const result = CreateApiKeyParamsSchema.safeParse({
      name: 'k',
      permissions: [],
      environment_name: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('ApiKeySchema.environment_id', () => {
  it('accepts a UUID environment_id on a read row', () => {
    const parsed = ApiKeySchema.parse({
      id: 'unkey-1',
      name: 'k',
      app_id: 'd2b77a2e-3d14-4477-9bd3-64ce13e6d84b',
      environment_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      permissions: [],
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.environment_id).toBe('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
  });

  it('tolerates a null environment_id (legacy pre-environment rows)', () => {
    const parsed = ApiKeySchema.parse({
      id: 'unkey-1',
      name: 'k',
      app_id: 'd2b77a2e-3d14-4477-9bd3-64ce13e6d84b',
      environment_id: null,
      permissions: [],
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.environment_id).toBeNull();
  });
});
