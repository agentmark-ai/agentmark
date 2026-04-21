/**
 * Integration test: OSS CLI dev server emits the cloud-parity error envelope
 * on schema-validation failures.
 *
 * Protects against regressions where a handler drifts back to hand-rolled
 * validation (flat `{error: "string"}`) instead of `{error: {code, message,
 * details?}}`.
 *
 * Boots the full `createApiServer` on an ephemeral port, hits it with known-
 * bad requests, asserts the envelope matches what cloud returns for the
 * same failure mode.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createApiServer } from '../cli-src/api-server';

let server: Server;
let port: number;

beforeAll(async () => {
  // `createApiServer` binds to the given port; pass 0 to let the OS pick one.
  server = await createApiServer(0);
  port = (server.address() as AddressInfo).port;
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function url(pathAndQuery: string): string {
  return `http://127.0.0.1:${port}${pathAndQuery}`;
}

describe('OSS CLI — canonical error envelope', () => {
  it('rejects invalid query params with 400 + invalid_query_params code', async () => {
    // ScoresListParamsSchema requires `resource_type` to be one of
    // SCORE_RESOURCE_TYPES. "banana" is not one of them.
    const res = await fetch(url('/v1/scores?resource_type=banana'));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toEqual(
      expect.objectContaining({
        code: 'invalid_query_params',
        message: expect.any(String),
      }),
    );
    // details should pinpoint the offending field.
    expect(body.error.details).toBeDefined();
    expect(Object.keys(body.error.details)).toContain('resource_type');
  });

  it('rejects missing required body field with 400 + invalid_request_body', async () => {
    // CreateScoreBodySchema requires `resource_id`, `name`, `score`.
    const res = await fetch(url('/v1/scores'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_id: 'r1' }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.code).toBe('invalid_request_body');
    expect(body.error.message).toBe('Invalid request body');
    // At least one of the missing fields should appear in details.
    expect(body.error.details).toBeDefined();
    const fields = Object.keys(body.error.details);
    expect(fields.some((f) => f === 'name' || f === 'score')).toBe(true);
  });

  it('rejects wrong body type (score must be number) with invalid_request_body', async () => {
    const res = await fetch(url('/v1/scores'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_id: 'r1', name: 'latency', score: 'fast' }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.code).toBe('invalid_request_body');
    expect(body.error.details).toHaveProperty('score');
  });

  it('accepts a well-formed score body', async () => {
    const res = await fetch(url('/v1/scores'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_id: 'r1', name: 'latency', score: 42 }),
    });
    // 201 created; the exact response shape is the existing createScore path.
    expect(res.status).toBe(201);
  });

  it('returns 404 + not_found on unknown trace', async () => {
    const res = await fetch(url('/v1/traces/nonexistent-trace-id'));
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Pagination edge cases
// ---------------------------------------------------------------------------
// Pre-migration the CLI used `safeInt(val, fallback)` which silently swallowed
// bad values and returned the fallback. Phase B made pagination zod-validated
// so bad values surface as the canonical 400 envelope. These tests pin that
// behaviour.

describe('OSS CLI — pagination edge cases', () => {
  it('non-numeric limit → 400 invalid_query_params', async () => {
    const res = await fetch(url('/v1/traces?limit=abc'));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.code).toBe('invalid_query_params');
    expect(body.error.details).toHaveProperty('limit');
  });

  it('negative offset → 400 invalid_query_params', async () => {
    const res = await fetch(url('/v1/traces?offset=-1'));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.code).toBe('invalid_query_params');
    expect(body.error.details).toHaveProperty('offset');
  });

  it('limit above max → 400 invalid_query_params', async () => {
    // PaginationParamsSchema caps `limit` at PAGINATION.maxLimit.
    const res = await fetch(url('/v1/traces?limit=999999'));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.code).toBe('invalid_query_params');
    expect(body.error.details).toHaveProperty('limit');
  });

  it('no pagination params → 200 (defaults apply)', async () => {
    const res = await fetch(url('/v1/traces'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('pagination');
  });
});

// ---------------------------------------------------------------------------
// Scores batch — 207/413 regression
// ---------------------------------------------------------------------------
// The batch handler uses envelope-only validation (`{scores: unknown[]}`)
// and delegates per-item validation to the service so partial success
// (207) and size-limit (413) contracts are preserved. These tests pin
// the contract — a future refactor that tightens the handler schema and
// breaks 207/413 will fail here.

describe('OSS CLI — scores batch', () => {
  it('all-valid batch → 201', async () => {
    const res = await fetch(url('/v1/scores/batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scores: [
          { resource_id: 'r1', name: 'latency', score: 42 },
          { resource_id: 'r2', name: 'quality', score: 0.9 },
        ],
      }),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.data.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
    expect(body.data.results).toHaveLength(2);
    expect(body.data.results[0].status).toBe('success');
  });

  it('partial-success batch → 207 (multi-status)', async () => {
    // Second item has no resource_id — service marks it as error while
    // the first succeeds. 207 is HTTP multi-status.
    const res = await fetch(url('/v1/scores/batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scores: [
          { resource_id: 'r1', name: 'latency', score: 42 },
          { name: 'missing-resource-id', score: 0.9 },
        ],
      }),
    });
    expect(res.status).toBe(207);

    const body = await res.json();
    expect(body.data.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(body.data.results[0].status).toBe('success');
    expect(body.data.results[1].status).toBe('error');
    expect(body.data.results[1].error.code).toBe('missing_required_field');
  });

  it('oversized batch → 413 payload_too_large', async () => {
    // MAX_SCORES_BATCH_SIZE is 1000; 1001 trips the limit.
    const scores = Array.from({ length: 1001 }, (_, i) => ({
      resource_id: `r${i}`,
      name: 'x',
      score: i,
    }));

    const res = await fetch(url('/v1/scores/batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores }),
    });
    expect(res.status).toBe(413);

    const body = await res.json();
    // Service-thrown error surfaces through the handler's catch branch
    // with its own code — still wrapped in `{error: {code, message}}`.
    expect(body.error.code).toBe('payload_too_large');
    expect(body.error.message).toContain('1001');
  });

  it('empty scores array → 400 invalid_request_body', async () => {
    const res = await fetch(url('/v1/scores/batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores: [] }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.code).toBe('invalid_request_body');
  });

  it('missing scores key → 400 invalid_request_body', async () => {
    const res = await fetch(url('/v1/scores/batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error.code).toBe('invalid_request_body');
    expect(body.error.details).toHaveProperty('scores');
  });

  it('all failed batch → 400 (no partial success)', async () => {
    // Every item missing resource_id: handler distinguishes 207 (some ok)
    // from 400 (none ok). Pins that branch.
    const res = await fetch(url('/v1/scores/batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scores: [
          { name: 'a', score: 1 },
          { name: 'b', score: 2 },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });
});
