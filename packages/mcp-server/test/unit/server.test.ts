import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMCPServer } from '../../src/server.js';
import * as auth from '../../src/openapi/auth.js';
import * as specLoader from '../../src/openapi/spec-loader.js';

/**
 * Behavior pinned here:
 *
 * 1. Tool registration is unconditional. We do NOT gate on auth — the
 *    OpenAPI spec is publicly fetchable on both cloud and local-dev
 *    endpoints, and tool calls handle their own 401s. This is what
 *    makes pointing the same binary at `localhost:9418` work for
 *    unauth'd local dev traces.
 *
 * 2. Empty/missing bearer is still a valid state. The server logs a
 *    warning but proceeds. The downstream `registerOpenAPITools` is
 *    responsible for omitting the Authorization header when bearer
 *    is empty (verified in openapi-register-tools.test.ts).
 *
 * 3. A spec-fetch failure does NOT crash startup. The server returns
 *    with zero tools registered; the agent sees an empty tool list.
 *    Crashing would leave the user with no MCP at all (bad UX for
 *    e.g. offline first-launch).
 */

function buildFakeSpec() {
  return {
    paths: {
      '/v1/traces': {
        get: { operationId: 'list-traces', summary: 'List traces' },
      },
      '/v1/apps': {
        post: { operationId: 'create-app', summary: 'Create app' },
      },
    },
  };
}

describe('createMCPServer', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers OpenAPI tools using the resolved baseUrl + bearer', async () => {
    vi.spyOn(auth, 'resolveBaseUrl').mockReturnValue('https://api.test');
    vi.spyOn(auth, 'resolveBearer').mockReturnValue('am_test_key');
    const fetchSpec = vi
      .spyOn(specLoader, 'fetchOpenAPISpec')
      .mockResolvedValue(buildFakeSpec() as unknown as Awaited<ReturnType<typeof specLoader.fetchOpenAPISpec>>);

    const server = await createMCPServer();

    expect(fetchSpec).toHaveBeenCalledExactlyOnceWith('https://api.test');
    // Two operations in the spec → two MCP tools registered.
    const registered = (server as unknown as { _registeredTools?: Record<string, unknown> })
      ._registeredTools || {};
    expect(Object.keys(registered).sort()).toEqual(['create_app', 'list_traces']);
  });

  it('registers tools even when no bearer is resolved (local-dev path)', async () => {
    // Reason: AGENTMARK_API_URL=http://localhost:9418 (`agentmark dev`)
    // serves the same OpenAPI spec unauthenticated and accepts
    // unauthenticated calls. If we required a bearer at registration
    // time, that whole workflow would break and the agent's
    // `agentmark-local/list_traces` would never appear.
    vi.spyOn(auth, 'resolveBaseUrl').mockReturnValue('http://localhost:9418');
    vi.spyOn(auth, 'resolveBearer').mockReturnValue(null);
    vi.spyOn(specLoader, 'fetchOpenAPISpec').mockResolvedValue(
      buildFakeSpec() as unknown as Awaited<ReturnType<typeof specLoader.fetchOpenAPISpec>>,
    );

    const server = await createMCPServer();

    const registered = (server as unknown as { _registeredTools?: Record<string, unknown> })
      ._registeredTools || {};
    expect(Object.keys(registered)).toContain('list_traces');
    expect(Object.keys(registered)).toContain('create_app');
  });

  it('does NOT crash when the OpenAPI fetch fails — surfaces an empty tool list', async () => {
    // Reason: the user might be offline at first launch, or pointed
    // at a local-dev URL that isn't running yet. Crashing makes
    // the whole MCP unusable; returning an empty server lets the
    // agent's tool-list response be a clear "nothing here" signal
    // and the user fixes the underlying issue (start dev server,
    // get online, …) without restarting their IDE.
    vi.spyOn(auth, 'resolveBaseUrl').mockReturnValue('http://localhost:9999');
    vi.spyOn(auth, 'resolveBearer').mockReturnValue(null);
    vi.spyOn(specLoader, 'fetchOpenAPISpec').mockRejectedValue(new Error('fetch failed'));

    const server = await createMCPServer();

    const registered = (server as unknown as { _registeredTools?: Record<string, unknown> })
      ._registeredTools || {};
    expect(Object.keys(registered)).toHaveLength(0);
    // And a diagnostic line was emitted so the user knows what
    // happened.
    expect(
      (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat().join('\n'),
    ).toMatch(/Failed to load OpenAPI spec/);
  });
});
