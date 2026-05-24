/**
 * Fetch + cache the AgentMark gateway's OpenAPI spec.
 *
 * The MCP server registers tools from this spec at startup, so the
 * tool surface always matches what the gateway actually accepts.
 * No drift between client and server because there's only ONE
 * description — the gateway's `/v1/openapi.json`.
 *
 * Cache lifetime: 24h. The gateway's spec changes when the gateway
 * deploys a new version; the user can force a refresh by restarting
 * the MCP server (or deleting the cache file).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CACHE_DIR = path.join(os.homedir(), '.agentmark');
const CACHE_FILE = path.join(CACHE_DIR, 'mcp-openapi-cache.json');
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  fetchedAt: string;
  baseUrl: string;
  spec: OpenAPISpec;
}

// -----------------------------------------------------------------------------
// OpenAPI 3.x type shapes — only the fields we actually consume. Avoids
// pulling in a heavyweight types package; we don't need full validation.
// -----------------------------------------------------------------------------

export interface OpenAPISpec {
  paths: Record<string, OpenAPIPathItem>;
  components?: { schemas?: Record<string, OpenAPISchema> };
}

export interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
}

export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses?: Record<string, unknown>;
  deprecated?: boolean;
}

export interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: OpenAPISchema;
}

export interface OpenAPIRequestBody {
  required?: boolean;
  description?: string;
  content?: {
    'application/json'?: { schema?: OpenAPISchema };
  };
}

export interface OpenAPISchema {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: OpenAPISchema;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  nullable?: boolean;
  description?: string;
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

// -----------------------------------------------------------------------------
// Fetch + cache
// -----------------------------------------------------------------------------

function readCache(baseUrl: string): OpenAPISpec | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(raw) as CacheEntry;
    if (cache.baseUrl !== baseUrl) return null;
    const age = Date.now() - new Date(cache.fetchedAt).getTime();
    if (age > CACHE_MAX_AGE_MS) return null;
    return cache.spec;
  } catch {
    return null;
  }
}

function writeCache(baseUrl: string, spec: OpenAPISpec): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const entry: CacheEntry = {
      fetchedAt: new Date().toISOString(),
      baseUrl,
      spec,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(entry), 'utf-8');
  } catch {
    // Best-effort. A failed cache write isn't fatal.
  }
}

export async function fetchOpenAPISpec(
  baseUrl: string,
  options: { forceRefresh?: boolean } = {},
): Promise<OpenAPISpec> {
  if (!options.forceRefresh) {
    const cached = readCache(baseUrl);
    if (cached) return cached;
  }

  const response = await fetch(`${baseUrl}/v1/openapi.json`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenAPI spec from ${baseUrl}/v1/openapi.json: ${response.status} ${response.statusText}`,
    );
  }
  const spec = (await response.json()) as OpenAPISpec;
  writeCache(baseUrl, spec);
  return spec;
}

// -----------------------------------------------------------------------------
// Reference resolution. The gateway's spec inlines most schemas but uses
// $ref for shared response envelopes; resolve those before passing to the
// Zod converter so callers see flat shapes.
// -----------------------------------------------------------------------------

export function resolveRef(
  spec: OpenAPISpec,
  schema: OpenAPISchema | undefined,
): OpenAPISchema | undefined {
  if (!schema) return undefined;
  if (!schema.$ref) return schema;
  // Refs look like '#/components/schemas/Foo'.
  const parts = schema.$ref.replace(/^#\//, '').split('/');
  let cursor: unknown = spec;
  for (const part of parts) {
    if (cursor && typeof cursor === 'object' && part in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cursor as OpenAPISchema;
}
