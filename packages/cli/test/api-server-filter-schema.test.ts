/**
 * Integration test: the local dev server's structured-search surface.
 *
 * Two contracts under test:
 *  1. GET /v1/filter-schema serves EXACTLY the payload generated from the
 *     shared allowlist tables in @agentmark-ai/api-schemas — the same
 *     source the cloud gateway serves and validates against, so local and
 *     cloud cannot drift.
 *  2. The POST /search endpoints (cloud-implemented) return a structured
 *     `501 not_available_locally` envelope rather than a bare 404, so a
 *     client moving cloud → local sees the feature gap loudly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { buildFilterSchemaPayload, FilterSchemaResponseSchema } from '@agentmark-ai/api-schemas';
import { createApiServer } from '../cli-src/api-server';

let server: Server;
let port: number;

beforeAll(async () => {
  // `createApiServer` binds to the given port; pass 0 to let the OS pick one.
  server = (await createApiServer(0)) as Server;
  port = (server.address() as AddressInfo).port;
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function url(path: string): string {
  return `http://127.0.0.1:${port}${path}`;
}

describe('GET /v1/filter-schema (local)', () => {
  it('serves the exact shared-contract payload in the data envelope', async () => {
    const res = await fetch(url('/v1/filter-schema'));
    expect(res.status).toBe(200);

    const body = await res.json();
    // Byte-for-byte the generated contract — the cloud gateway serves the
    // same function's output, so this pins local/cloud parity.
    expect(body).toEqual({ data: buildFilterSchemaPayload() });
    // And the live body conforms to the published response schema.
    const parsed = FilterSchemaResponseSchema.parse(body);
    expect(Object.keys(parsed.data.resources)).toEqual(['traces', 'spans', 'scores']);
  });
});

describe('POST /v1/*/search (local 501 stubs)', () => {
  it.each([
    '/v1/traces/search',
    '/v1/spans/search',
    '/v1/scores/search',
  ])('%s returns a structured not_available_locally envelope', async (path) => {
    const res = await fetch(url(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filters: [] }),
    });
    expect(res.status).toBe(501);

    const body = await res.json();
    expect(body).toEqual({
      error: expect.objectContaining({
        code: 'not_available_locally',
        message: expect.stringContaining('not yet available'),
        hint: expect.stringContaining('/v1/filter-schema'),
      }),
    });
  });
});
