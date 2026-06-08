/**
 * Walk the OpenAPI spec and register one MCP tool per operation.
 *
 * Tool name derivation:
 *   - `operationId` → snake_case (e.g. `create-app` → `create_app`,
 *     `start-app-git-connect` → `start_app_git_connect`).
 *   - Operations without an operationId fall back to
 *     `${method}_${path-slug}`. The AgentMark gateway always emits an
 *     operationId, so this branch is defensive.
 *
 * Input schema:
 *   - Path params → required string fields (UUIDs etc.).
 *   - Query params → optional / required per spec.
 *   - Body fields are FLATTENED into the top-level input — agents
 *     just pass `name: "x"`, not `body: { name: "x" }`. This is
 *     ergonomically far better for LLM tool-calling and matches the
 *     pattern used by Stripe's Agent Toolkit.
 *
 * Handler:
 *   - Pulls path params out and substitutes into the URL.
 *   - Pulls query params out and appends.
 *   - Treats everything else as the JSON body (for POST/PATCH/PUT).
 *   - Adds `Authorization: Bearer <token>` and (when applicable)
 *     `X-Agentmark-App-Id` from the appId arg.
 *   - Returns the gateway's response verbatim. On non-2xx the
 *     handler emits a structured MCP error block.
 *
 * Why we don't curate names / descriptions per tool here: the spec
 * already carries `summary` + `description` on every operation, and
 * `description` on every parameter / schema property. The gateway
 * authors curate IN the spec — single source of truth — and the MCP
 * server picks them up automatically. Drift goes to zero.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type {
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPISchema,
  OpenAPISpec,
} from './spec-loader.js';
import { resolveRef } from './spec-loader.js';
import { openApiSchemaToZod } from './to-zod.js';

export interface RegisterOpenAPIToolsOptions {
  spec: OpenAPISpec;
  baseUrl: string;
  /**
   * The bearer credential, as a static string OR a resolver called once
   * per tool invocation. Pass a resolver (e.g. `resolveBearer`) so a
   * `agentmark login` performed mid-session is picked up on the next call
   * — the server otherwise closes over the token resolved at startup and
   * a re-login is never seen (issue #2657). A plain string keeps the
   * old static behavior (used by tests and the local-dev unauth path).
   */
  bearer: string | (() => string | null);
  /**
   * Default `X-Agentmark-App-Id` for app-scoped routes whose path has
   * no `{appId}` param (GET /v1/traces, /v1/spans, POST /v1/scores, …).
   * Resolved from `AGENTMARK_APP_ID`. An explicit `{appId}` path param
   * still takes precedence per-call. Without this, those routes 401
   * with "Missing app id" and the whole trace/span/score read surface
   * is unusable for a headless agent.
   */
  defaultAppId?: string;
  /**
   * Optional hint appended to a persistent 401's error text — e.g.
   * "your session expired, run `agentmark login`". Called when a 401
   * survives the credential-refresh retry, so the agent gets an
   * actionable cause instead of the gateway's opaque message. Return
   * `undefined` to append nothing.
   */
  authErrorHint?: () => string | undefined;
  /**
   * Operations to register. Defaults to "all under /v1/" that have an
   * operationId. Callers can pass a filter for development (e.g. to
   * narrow to just apps endpoints) or to exclude paths that don't
   * make sense as agent tools (health checks, capabilities, etc.).
   */
  include?: (op: OpenAPIOperation, method: string, path: string) => boolean;
}

const SUPPORTED_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type HttpMethod = (typeof SUPPORTED_METHODS)[number];

function toSnakeCase(s: string): string {
  return s
    .replace(/[-\s.]+/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function pathToSlug(path: string): string {
  return path
    .replace(/^\/+/, '')
    .replace(/\{([^}]+)\}/g, 'by_$1')
    .replace(/[\/-]/g, '_');
}

interface ToolBinding {
  /** MCP tool name */
  name: string;
  /** Description shown to the LLM in tool selection. */
  description: string;
  /** Combined input shape — path + query + body all flattened. */
  inputShape: Record<string, z.ZodTypeAny>;
  /** Builds the HTTP request from validated args. */
  buildRequest: (args: Record<string, unknown>) => {
    url: string;
    method: HttpMethod;
    body?: unknown;
    appIdHeader?: string;
  };
}

function buildBindingForOperation(
  method: HttpMethod,
  path: string,
  op: OpenAPIOperation,
  spec: OpenAPISpec,
  baseUrl: string,
): ToolBinding | null {
  if (op.deprecated) return null;

  const opId = op.operationId || `${method}_${pathToSlug(path)}`;
  const name = toSnakeCase(opId);

  const descParts = [op.summary, op.description].filter(Boolean);
  const description = descParts.join(' — ') || `${method.toUpperCase()} ${path}`;

  const inputShape: Record<string, z.ZodTypeAny> = {};
  const pathParamNames: string[] = [];
  const queryParamNames: string[] = [];
  let bodyPropertyNames: string[] = [];

  // Path + query + header parameters
  for (const rawParam of op.parameters || []) {
    const param = resolveRefParam(spec, rawParam);
    if (!param) continue;
    if (param.in !== 'path' && param.in !== 'query') continue;

    const zodType = openApiSchemaToZod(param.schema, spec);
    const described = param.description ? zodType.describe(param.description) : zodType;
    const finalType = param.required ? described : described.optional();
    inputShape[param.name] = finalType;

    if (param.in === 'path') pathParamNames.push(param.name);
    if (param.in === 'query') queryParamNames.push(param.name);
  }

  // Body — flatten top-level properties into the input shape.
  const bodySchema = resolveRef(
    spec,
    op.requestBody?.content?.['application/json']?.schema,
  );
  if (bodySchema?.type === 'object' && bodySchema.properties) {
    const bodyRequired = new Set(bodySchema.required || []);
    for (const [key, propSchema] of Object.entries(bodySchema.properties)) {
      if (key in inputShape) continue; // Don't clobber a path/query param of the same name.
      const propZod = openApiSchemaToZod(propSchema, spec);
      const described = propSchema.description
        ? propZod.describe(propSchema.description)
        : propZod;
      inputShape[key] = bodyRequired.has(key) ? described : described.optional();
      bodyPropertyNames.push(key);
    }
  } else if (bodySchema) {
    // Non-object body (rare). Fall back to a single `body` arg.
    inputShape.body = openApiSchemaToZod(bodySchema, spec);
    bodyPropertyNames = ['body'];
  }

  return {
    name,
    description,
    inputShape,
    buildRequest: (args) => {
      // Substitute path params.
      let urlPath = path;
      for (const pathParam of pathParamNames) {
        const value = args[pathParam];
        if (typeof value !== 'string') {
          throw new Error(`Missing required path parameter: ${pathParam}`);
        }
        urlPath = urlPath.replace(`{${pathParam}}`, encodeURIComponent(value));
      }

      // Append query string.
      const qs = new URLSearchParams();
      for (const queryParam of queryParamNames) {
        const value = args[queryParam];
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          for (const v of value) qs.append(queryParam, String(v));
        } else {
          qs.set(queryParam, String(value));
        }
      }
      const querySuffix = qs.toString() ? `?${qs.toString()}` : '';

      // Pull body fields.
      let body: unknown = undefined;
      if (method !== 'get' && method !== 'delete' && bodyPropertyNames.length > 0) {
        if (bodyPropertyNames.length === 1 && bodyPropertyNames[0] === 'body') {
          body = args.body;
        } else {
          const obj: Record<string, unknown> = {};
          for (const key of bodyPropertyNames) {
            if (args[key] !== undefined) obj[key] = args[key];
          }
          if (Object.keys(obj).length > 0) body = obj;
        }
      }

      // Per-app routes still want the legacy X-Agentmark-App-Id header
      // for callers using API-key auth. When the path itself carries
      // `{appId}`, surface that value into the header too. Tenant-scoped
      // routes (POST /v1/apps, GET /v1/apps) have no `{appId}` and the
      // gateway's allowlist permits the header to be absent.
      const appIdHeader =
        pathParamNames.includes('appId') && typeof args.appId === 'string'
          ? args.appId
          : undefined;

      return {
        url: `${baseUrl}${urlPath}${querySuffix}`,
        method,
        body,
        appIdHeader,
      };
    },
  };
}

function resolveRefParam(
  spec: OpenAPISpec,
  param: OpenAPIParameter | (OpenAPISchema & { name?: string }),
): OpenAPIParameter | undefined {
  if ('$ref' in param && (param as OpenAPISchema).$ref) {
    const resolved = resolveRef(spec, param as OpenAPISchema);
    if (!resolved || !('name' in resolved)) return undefined;
    return resolved as unknown as OpenAPIParameter;
  }
  return param as OpenAPIParameter;
}

// ----------------------------------------------------------------------------
// MCP registration
// ----------------------------------------------------------------------------

export interface RegisteredOpenAPITool {
  name: string;
  method: HttpMethod;
  path: string;
}

export function registerOpenAPITools(
  server: McpServer,
  options: RegisterOpenAPIToolsOptions,
): RegisteredOpenAPITool[] {
  const { spec, baseUrl, bearer, include, defaultAppId, authErrorHint } = options;
  // Normalize the credential to a per-call resolver. A static string
  // keeps the old behavior; a function is re-invoked on every tool call
  // (and again on a 401) so a fresh `agentmark login` is picked up
  // without restarting the MCP client (issue #2657).
  const getBearer: () => string | null =
    typeof bearer === 'function' ? bearer : () => bearer;
  const registered: RegisteredOpenAPITool[] = [];
  // Defense against operationId collisions inside the spec. There used
  // to be a name-collision path here for the hand-rolled `list_traces` /
  // `get_trace` tools (rename to `cloud_<name>`), but those were
  // removed once the local dev server started serving its own
  // `/v1/openapi.json` — every endpoint now goes through the same
  // OpenAPI-driven path, so the only collision worth defending against
  // is a malformed spec with duplicate operationIds.
  const claimedNames = new Set<string>(
    Object.keys(
      (server as unknown as { _registeredTools?: Record<string, unknown> })._registeredTools || {},
    ),
  );

  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of SUPPORTED_METHODS) {
      const op = (item as Record<string, OpenAPIOperation | undefined>)[method];
      if (!op) continue;
      if (include && !include(op, method, path)) continue;

      const binding = buildBindingForOperation(method, path, op, spec, baseUrl);
      if (!binding) continue;

      if (claimedNames.has(binding.name)) {
        console.error(
          `[agentmark-mcp] Skipping tool "${binding.name}" (${method.toUpperCase()} ${path}) — name already in use.`,
        );
        continue;
      }
      claimedNames.add(binding.name);

      server.tool(
        binding.name,
        binding.description,
        binding.inputShape,
        async (rawArgs: Record<string, unknown>) => {
          try {
            const { url, method: m, body, appIdHeader } = binding.buildRequest(rawArgs);

            // Send the request with a specific bearer. Factored out so a
            // 401 can be retried once with a freshly-resolved credential.
            const send = (token: string | null) => {
              const headers: Record<string, string> = { Accept: 'application/json' };
              // Omit the Authorization header entirely when no bearer is
              // configured. Local dev calls (`agentmark dev` at
              // localhost:9418) don't validate auth and would treat
              // `Bearer ` as a malformed token; the cloud rejects
              // missing-auth with 401 which is what we want to surface.
              if (token) headers.Authorization = `Bearer ${token}`;
              // Path-param appId wins; otherwise fall back to the
              // configured default (AGENTMARK_APP_ID). App-scoped routes
              // that carry app-id as a header (not a path param) rely on
              // this fallback — without it they 401 "Missing app id".
              const resolvedAppId = appIdHeader ?? defaultAppId;
              if (resolvedAppId) headers['X-Agentmark-App-Id'] = resolvedAppId;
              if (body !== undefined) headers['Content-Type'] = 'application/json';
              return fetch(url, {
                method: m.toUpperCase(),
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
              });
            };

            // Resolve the credential fresh for THIS call (picks up a
            // mid-session `agentmark login`), then send.
            let usedToken = getBearer();
            let response = await send(usedToken);

            // On a 401, re-resolve once: if the on-disk credential changed
            // (the user logged in since we read it), retry with the fresh
            // token before surfacing the error (issue #2657).
            if (response.status === 401) {
              const fresh = getBearer();
              if (fresh && fresh !== usedToken) {
                usedToken = fresh;
                response = await send(fresh);
              }
            }

            const text = await response.text();
            let parsed: unknown = text;
            try {
              parsed = JSON.parse(text);
            } catch {
              // Non-JSON response (e.g. 204 empty body) — surface raw.
            }

            if (!response.ok) {
              // A surviving 401 usually means no usable credential. Append
              // an actionable hint (e.g. expired session → re-login) so the
              // agent doesn't chase the gateway's opaque message (#2655).
              const hint =
                response.status === 401 && authErrorHint ? authErrorHint() : undefined;
              const baseText = `HTTP ${response.status} ${response.statusText}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)}`;
              return {
                isError: true,
                content: [
                  {
                    type: 'text' as const,
                    text: hint ? `${baseText}\n\n${hint}` : baseText,
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: 'text' as const,
                  text:
                    typeof parsed === 'string'
                      ? parsed
                      : JSON.stringify(parsed, null, 2),
                },
              ],
            };
          } catch (err) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: `Tool call failed: ${(err as Error).message}`,
                },
              ],
            };
          }
        },
      );

      registered.push({ name: binding.name, method, path });
    }
  }

  return registered;
}
