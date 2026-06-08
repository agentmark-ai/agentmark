/**
 * Unit tests for `registerOpenAPITools`.
 *
 * These exercise the spec → MCP-tool transformation end-to-end against
 * a real McpServer instance using a hand-written spec fragment that
 * mirrors how the AgentMark gateway describes its endpoints. The
 * fetch impl is stubbed at the global level so we can assert the
 * built request URL, method, headers, and body verbatim.
 *
 * What these tests cover (each maps to a concrete bug class):
 *   - operationId → snake_case naming                (catches accidental kebab-case leak into tool names)
 *   - path params → URL substitution + appId header   (catches X-Agentmark-App-Id drift, e.g. a refactor dropping the header)
 *   - flat body shape passes through verbatim         (catches body-key drops + accidental nesting)
 *   - non-2xx → MCP isError envelope                  (catches handler swallowing errors silently)
 *   - duplicate operationIds → skipped + logged       (catches a regression if we ever remove the collision guard)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerOpenAPITools } from '../../src/openapi/register-tools.js';
import type { OpenAPISpec } from '../../src/openapi/spec-loader.js';

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

function stubFetch(response: {
  status: number;
  body: unknown;
}): { captured: CapturedRequest[]; restore: () => void } {
  const captured: CapturedRequest[] = [];
  const original = global.fetch;
  global.fetch = (async (input: any, init?: any) => {
    captured.push({
      url: typeof input === 'string' ? input : input.url,
      method: init?.method || 'GET',
      headers: init?.headers || {},
      body: init?.body ? JSON.parse(init.body) : undefined,
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.status === 200 ? 'OK' : 'Bad Request',
      text: async () => JSON.stringify(response.body),
    } as Response;
  }) as typeof global.fetch;
  return {
    captured,
    restore: () => {
      global.fetch = original;
    },
  };
}

/**
 * Like stubFetch but returns a different response per call, draining a
 * queue (last entry repeats once exhausted). Lets a test assert the
 * 401-then-retry path: first call 401, second call 200.
 */
function stubFetchSequence(
  responses: { status: number; body: unknown }[],
): { captured: CapturedRequest[]; restore: () => void } {
  const captured: CapturedRequest[] = [];
  const original = global.fetch;
  let i = 0;
  global.fetch = (async (input: any, init?: any) => {
    captured.push({
      url: typeof input === 'string' ? input : input.url,
      method: init?.method || 'GET',
      headers: init?.headers || {},
      body: init?.body ? JSON.parse(init.body) : undefined,
    });
    const r = responses[Math.min(i, responses.length - 1)] ?? responses[responses.length - 1]!;
    i += 1;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: r.status === 200 ? 'OK' : r.status === 401 ? 'Unauthorized' : 'Error',
      text: async () => JSON.stringify(r.body),
    } as Response;
  }) as typeof global.fetch;
  return {
    captured,
    restore: () => {
      global.fetch = original;
    },
  };
}

/**
 * Reach into the MCP server to invoke a registered tool by name.
 * The SDK doesn't expose a public "invoke" — but the tools registered
 * via `.tool()` are accessible on the underlying server instance via
 * its `_registeredTools` map. This is test-only; production callers
 * drive the server through stdio.
 */
function invokeRegisteredTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>,
): Promise<{ isError?: boolean; content: { type: string; text: string }[] }> {
  // McpServer stores tools on the underlying lowlevel Server via the
  // `tool()` registration. The handler accepts (args, extra) — we
  // pass a minimal extra object since these unit tests don't exercise
  // the request-meta channel. This avoids spinning up a full stdio
  // transport for unit tests.
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (a: Record<string, unknown>, extra: unknown) => Promise<any> }> })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool.handler(args, {});
}

const simpleSpec: OpenAPISpec = {
  paths: {
    '/v1/apps': {
      post: {
        operationId: 'create-app',
        summary: 'Create a new app',
        description: 'Provisions a tenant-scoped app and returns it.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', description: 'Human-readable name' },
                  description: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
    '/v1/apps/{appId}/git/connect': {
      post: {
        operationId: 'start-app-git-connect',
        summary: 'Get a one-click OAuth URL for connecting an app to a git provider.',
        parameters: [
          {
            name: 'appId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['provider'],
                properties: {
                  provider: { type: 'string', enum: ['github', 'gitlab'] },
                  return_to: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
};

describe('registerOpenAPITools', () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.0' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers one tool per operation with snake_case names derived from operationId', () => {
    const registered = registerOpenAPITools(server, {
      spec: simpleSpec,
      baseUrl: 'https://api.test',
      bearer: 'tok',
    });
    expect(registered.map((t) => t.name).sort()).toEqual([
      'create_app',
      'start_app_git_connect',
    ]);
  });

  it('substitutes path params into the URL and sets X-Agentmark-App-Id when appId is in the path', async () => {
    registerOpenAPITools(server, {
      spec: simpleSpec,
      baseUrl: 'https://api.test',
      bearer: 'tok',
    });
    const stub = stubFetch({
      status: 200,
      body: { url: 'https://github.com/connect', state: 'abc' },
    });
    try {
      await invokeRegisteredTool(server, 'start_app_git_connect', {
        appId: '11111111-2222-4333-8444-555555555555',
        provider: 'github',
      });
      expect(stub.captured).toHaveLength(1);
      const req = stub.captured[0];
      expect(req.url).toBe(
        'https://api.test/v1/apps/11111111-2222-4333-8444-555555555555/git/connect',
      );
      expect(req.method).toBe('POST');
      expect(req.headers['X-Agentmark-App-Id']).toBe(
        '11111111-2222-4333-8444-555555555555',
      );
      expect(req.headers['Authorization']).toBe('Bearer tok');
      expect(req.body).toEqual({ provider: 'github' });
    } finally {
      stub.restore();
    }
  });

  it('passes flat body fields through verbatim (no accidental nesting)', async () => {
    registerOpenAPITools(server, {
      spec: simpleSpec,
      baseUrl: 'https://api.test',
      bearer: 'tok',
    });
    const stub = stubFetch({ status: 200, body: { id: 'app-1', name: 'My App' } });
    try {
      const result = await invokeRegisteredTool(server, 'create_app', {
        name: 'My App',
        description: 'A test app',
      });
      expect(stub.captured[0].body).toEqual({
        name: 'My App',
        description: 'A test app',
      });
      // No X-Agentmark-App-Id when path has no {appId}.
      expect(stub.captured[0].headers['X-Agentmark-App-Id']).toBeUndefined();
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content[0].text)).toEqual({
        id: 'app-1',
        name: 'My App',
      });
    } finally {
      stub.restore();
    }
  });

  it('surfaces non-2xx as MCP isError with the response body in the text content', async () => {
    registerOpenAPITools(server, {
      spec: simpleSpec,
      baseUrl: 'https://api.test',
      bearer: 'tok',
    });
    const stub = stubFetch({
      status: 400,
      body: { error: 'name is required' },
    });
    try {
      const result = await invokeRegisteredTool(server, 'create_app', {
        name: 'x',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('HTTP 400');
      expect(result.content[0].text).toContain('name is required');
    } finally {
      stub.restore();
    }
  });

  it('skips duplicate operationIds rather than crashing or overwriting', () => {
    const dupeSpec: OpenAPISpec = {
      paths: {
        '/v1/a': { get: { operationId: 'same' } },
        '/v1/b': { get: { operationId: 'same' } },
      },
    };
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const registered = registerOpenAPITools(server, {
      spec: dupeSpec,
      baseUrl: 'https://api.test',
      bearer: 'tok',
    });
    expect(registered).toHaveLength(1);
    expect(registered[0].path).toBe('/v1/a');
    expect(warn).toHaveBeenCalled();
    const warnArgs = warn.mock.calls[0][0] as string;
    expect(warnArgs).toContain('"same"');
    expect(warnArgs).toMatch(/already in use|duplicate/);
    warn.mockRestore();
  });

  it('omits the Authorization header when bearer is empty (local-dev unauth path)', async () => {
    // Reason: `agentmark dev` (the local server) doesn't validate
    // auth — sending `Bearer ` (empty token) would be misleading and
    // some servers reject it. Cleanest behavior: when no bearer is
    // configured, send no Authorization header at all. The cloud
    // would 401, which is the right signal; the local dev server
    // ignores the missing header and responds normally.
    const spec: OpenAPISpec = {
      paths: { '/v1/traces': { get: { operationId: 'list-traces' } } },
    };
    registerOpenAPITools(server, {
      spec,
      baseUrl: 'http://localhost:9418',
      bearer: '',
    });
    const stub = stubFetch({ status: 200, body: { data: [] } });
    try {
      await invokeRegisteredTool(server, 'list_traces', {});
      expect(stub.captured).toHaveLength(1);
      expect(stub.captured[0].headers['Authorization']).toBeUndefined();
    } finally {
      stub.restore();
    }
  });

  it('does include the Authorization header when a bearer IS provided', async () => {
    const spec: OpenAPISpec = {
      paths: { '/v1/traces': { get: { operationId: 'list-traces' } } },
    };
    registerOpenAPITools(server, {
      spec,
      baseUrl: 'https://api.agentmark.co',
      bearer: 'am_xyz',
    });
    const stub = stubFetch({ status: 200, body: { data: [] } });
    try {
      await invokeRegisteredTool(server, 'list_traces', {});
      expect(stub.captured[0].headers['Authorization']).toBe('Bearer am_xyz');
    } finally {
      stub.restore();
    }
  });

  it('injects X-Agentmark-App-Id from defaultAppId on app-scoped routes with no {appId} path param', async () => {
    // The headline fix: GET /v1/traces (and ~50 other app-scoped
    // routes) carry app-id as a header, not a path param. Without the
    // defaultAppId fallback the gateway 401s "Missing app id" and the
    // entire trace/span/score read surface is unusable for a headless
    // agent. Resolved from AGENTMARK_APP_ID in production.
    const spec: OpenAPISpec = {
      paths: { '/v1/traces': { get: { operationId: 'list-traces' } } },
    };
    registerOpenAPITools(server, {
      spec,
      baseUrl: 'https://api.agentmark.co',
      bearer: 'am_xyz',
      defaultAppId: 'app-from-env',
    });
    const stub = stubFetch({ status: 200, body: { data: [] } });
    try {
      await invokeRegisteredTool(server, 'list_traces', {});
      expect(stub.captured[0].headers['X-Agentmark-App-Id']).toBe('app-from-env');
    } finally {
      stub.restore();
    }
  });

  it('prefers a {appId} path param over defaultAppId when both are present', async () => {
    // An explicit path-param appId is a per-call override and must win
    // over the configured default — otherwise an agent operating on a
    // specific app via /v1/apps/{appId}/... would silently hit the
    // wrong app.
    registerOpenAPITools(server, {
      spec: simpleSpec, // has /v1/apps/{appId}/git/connect
      baseUrl: 'https://api.test',
      bearer: 'tok',
      defaultAppId: 'env-default-app',
    });
    const stub = stubFetch({ status: 200, body: { url: 'x', state: 'y' } });
    try {
      await invokeRegisteredTool(server, 'start_app_git_connect', {
        appId: '11111111-2222-4333-8444-555555555555',
        provider: 'github',
      });
      expect(stub.captured[0].headers['X-Agentmark-App-Id']).toBe(
        '11111111-2222-4333-8444-555555555555',
      );
    } finally {
      stub.restore();
    }
  });

  it('sends no X-Agentmark-App-Id when neither a path param nor defaultAppId is available', async () => {
    const spec: OpenAPISpec = {
      paths: { '/v1/traces': { get: { operationId: 'list-traces' } } },
    };
    registerOpenAPITools(server, {
      spec,
      baseUrl: 'https://api.agentmark.co',
      bearer: 'am_xyz',
      // no defaultAppId
    });
    const stub = stubFetch({ status: 200, body: { data: [] } });
    try {
      await invokeRegisteredTool(server, 'list_traces', {});
      expect(stub.captured[0].headers['X-Agentmark-App-Id']).toBeUndefined();
    } finally {
      stub.restore();
    }
  });

  // Stub for next test (replaces the deleted defense-against-both-taken test).
  it('still skips when an operationId collides with a pre-claimed name on the server (defensive)', () => {
    // Edge case: someone has used the same server instance to register
    // a tool before calling registerOpenAPITools (no current production
    // caller does this since the hand-rolled tools were removed, but
    // the safety net should stay — McpServer throws on second
    // registration with the same name, which would abort the entire
    // OpenAPI pass).
    server.tool('list_traces', 'preclaimed', {}, async () => ({
      content: [{ type: 'text' as const, text: '[]' }],
    }));
    const spec: OpenAPISpec = {
      paths: { '/v1/traces': { get: { operationId: 'list-traces' } } },
    };
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const registered = registerOpenAPITools(server, {
      spec,
      baseUrl: 'https://api.test',
      bearer: 'tok',
    });
    expect(registered).toEqual([]);
    expect(warn.mock.calls[0][0]).toMatch(/skipping/i);
    warn.mockRestore();
  });

  it('skips deprecated operations', () => {
    const deprecatedSpec: OpenAPISpec = {
      paths: {
        '/v1/old': { get: { operationId: 'old-thing', deprecated: true } },
        '/v1/new': { get: { operationId: 'new-thing' } },
      },
    };
    const registered = registerOpenAPITools(server, {
      spec: deprecatedSpec,
      baseUrl: 'https://api.test',
      bearer: 'tok',
    });
    expect(registered.map((t) => t.name)).toEqual(['new_thing']);
  });

  it('honors the `include` filter when caller passes one', () => {
    const registered = registerOpenAPITools(server, {
      spec: simpleSpec,
      baseUrl: 'https://api.test',
      bearer: 'tok',
      include: (_op, _method, path) => path.startsWith('/v1/apps') && !path.includes('{appId}'),
    });
    expect(registered.map((t) => t.name)).toEqual(['create_app']);
  });

  it('appends query parameters when the operation declares them', async () => {
    const queryParamSpec: OpenAPISpec = {
      paths: {
        '/v1/apps': {
          get: {
            operationId: 'list-apps',
            parameters: [
              { name: 'limit', in: 'query', schema: { type: 'integer' } },
              { name: 'cursor', in: 'query', schema: { type: 'string' } },
            ],
          },
        },
      },
    };
    registerOpenAPITools(server, {
      spec: queryParamSpec,
      baseUrl: 'https://api.test',
      bearer: 'tok',
    });
    const stub = stubFetch({ status: 200, body: { items: [] } });
    try {
      await invokeRegisteredTool(server, 'list_apps', { limit: 25 });
      expect(stub.captured[0].url).toBe('https://api.test/v1/apps?limit=25');
      // cursor omitted because not passed
    } finally {
      stub.restore();
    }
  });

  it('throws a clear error when a required path param is missing at call time', async () => {
    registerOpenAPITools(server, {
      spec: simpleSpec,
      baseUrl: 'https://api.test',
      bearer: 'tok',
    });
    const stub = stubFetch({ status: 200, body: {} });
    try {
      const result = await invokeRegisteredTool(server, 'start_app_git_connect', {
        provider: 'github',
        // appId intentionally missing — Zod normally catches this, but
        // we want defense-in-depth in buildRequest too.
      });
      // Either Zod rejected at validate, or buildRequest threw inside
      // the handler and we surfaced it as isError. Both are acceptable —
      // the contract is "client gets a clear error, not a silent
      // 404 with /v1/apps/{appId}/git/connect literally in the URL".
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toMatch(/appId|required/i);
    } finally {
      stub.restore();
    }
  });

  // --- mid-session credential refresh (issue #2657) ----------------------

  it('resolves the bearer fresh per call when given a resolver function', async () => {
    // The headline #2657 fix: a `agentmark login` performed mid-session
    // must be picked up on the NEXT tool call without restarting the MCP
    // client. The server now passes a resolver, not a startup string, so
    // each invocation reads the current credential.
    const spec: OpenAPISpec = {
      paths: { '/v1/traces': { get: { operationId: 'list-traces' } } },
    };
    const tokens = ['stale_token', 'fresh_after_relogin'];
    let call = 0;
    registerOpenAPITools(server, {
      spec,
      baseUrl: 'https://api.agentmark.co',
      bearer: () => tokens[call++] ?? null, // different token each resolution
    });
    const stub = stubFetch({ status: 200, body: { data: [] } });
    try {
      await invokeRegisteredTool(server, 'list_traces', {});
      await invokeRegisteredTool(server, 'list_traces', {});
      expect(stub.captured[0].headers['Authorization']).toBe('Bearer stale_token');
      expect(stub.captured[1].headers['Authorization']).toBe('Bearer fresh_after_relogin');
    } finally {
      stub.restore();
    }
  });

  it('retries once with a refreshed credential when the first attempt 401s', async () => {
    // Within a single call: the token read at send-time is rejected, but
    // the user has since logged in. Re-resolve and retry once with the
    // fresh token before surfacing the error.
    const spec: OpenAPISpec = {
      paths: { '/v1/traces': { get: { operationId: 'list-traces' } } },
    };
    const tokens = ['expired_token', 'fresh_token'];
    let call = 0;
    registerOpenAPITools(server, {
      spec,
      baseUrl: 'https://api.agentmark.co',
      bearer: () => tokens[Math.min(call++, tokens.length - 1)] ?? null,
    });
    const stub = stubFetchSequence([
      { status: 401, body: { error: { code: 'unauthorized', message: 'Not authorized' } } },
      { status: 200, body: { data: ['trace1'] } },
    ]);
    try {
      const result = await invokeRegisteredTool(server, 'list_traces', {});
      // Two HTTP attempts: first with the stale token, retry with fresh.
      expect(stub.captured).toHaveLength(2);
      expect(stub.captured[0].headers['Authorization']).toBe('Bearer expired_token');
      expect(stub.captured[1].headers['Authorization']).toBe('Bearer fresh_token');
      // The retry succeeded, so the caller sees success, not the 401.
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content[0].text)).toEqual({ data: ['trace1'] });
    } finally {
      stub.restore();
    }
  });

  it('does NOT retry when the re-resolved credential is unchanged (avoids a pointless second call)', async () => {
    const spec: OpenAPISpec = {
      paths: { '/v1/traces': { get: { operationId: 'list-traces' } } },
    };
    registerOpenAPITools(server, {
      spec,
      baseUrl: 'https://api.agentmark.co',
      bearer: () => 'same_token', // never changes — no fresh login happened
    });
    const stub = stubFetchSequence([
      { status: 401, body: { error: { message: 'Not authorized' } } },
    ]);
    try {
      const result = await invokeRegisteredTool(server, 'list_traces', {});
      expect(stub.captured).toHaveLength(1); // no retry
      expect(result.isError).toBe(true);
    } finally {
      stub.restore();
    }
  });

  it('appends the authErrorHint to a surviving 401 (expired-session guidance, #2655)', async () => {
    const spec: OpenAPISpec = {
      paths: { '/v1/traces': { get: { operationId: 'list-traces' } } },
    };
    registerOpenAPITools(server, {
      spec,
      baseUrl: 'https://api.agentmark.co',
      bearer: () => null, // expired/dropped → no header
      authErrorHint: () => 'Your AgentMark session has expired. Run `agentmark login`.',
    });
    const stub = stubFetch({
      status: 401,
      body: { error: { code: 'unauthorized', message: 'Missing auth header' } },
    });
    try {
      const result = await invokeRegisteredTool(server, 'list_traces', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('HTTP 401');
      expect(result.content[0].text).toContain('agentmark login');
    } finally {
      stub.restore();
    }
  });

  it('does NOT append the hint to non-401 errors', async () => {
    const spec: OpenAPISpec = {
      paths: { '/v1/apps': { post: { operationId: 'create-app' } } },
    };
    registerOpenAPITools(server, {
      spec,
      baseUrl: 'https://api.agentmark.co',
      bearer: () => 'tok',
      authErrorHint: () => 'SHOULD NOT APPEAR',
    });
    const stub = stubFetch({ status: 400, body: { error: 'name is required' } });
    try {
      const result = await invokeRegisteredTool(server, 'create_app', { name: '' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).not.toContain('SHOULD NOT APPEAR');
    } finally {
      stub.restore();
    }
  });
});
