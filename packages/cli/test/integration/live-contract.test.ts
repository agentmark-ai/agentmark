/**
 * Live-CLI contract test - the regression gate for the api-server's
 * wire shapes.
 *
 * Boots the actual createApiServer, walks every public /v1/* endpoint
 * verb on both an empty DB and a seeded DB, and validates each
 * response body against the corresponding schema from
 * @agentmark-ai/api-schemas. The point is to lock the wire contract
 * so any drift (camelCase reappearing in scores list, sessions losing
 * snake_case after a refactor, etc.) fails this test loudly.
 *
 * Phase-1 bugs hid behind fixture-shaped tests that passed CI green -
 * this test deliberately doesn't mock anything below the express app:
 * it talks to the real SQLite-backed service layer, the real wire
 * mappers, and validates with the real published schemas.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import BetterSqlite3 from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Test DB - schema mirrors cli-src/server/database/index.ts
// (kept inline because the mock factory needs to be hoisted; the test file
// boundary can't import the real DB factory directly).
// ---------------------------------------------------------------------------
const { testDb } = vi.hoisted(() => {
  const Sqlite = require('better-sqlite3');
  const db = new Sqlite(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS traces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      TraceId TEXT NOT NULL, SpanId TEXT NOT NULL, ParentSpanId TEXT,
      Type TEXT NOT NULL DEFAULT 'SPAN', Timestamp TEXT NOT NULL, EndTime REAL,
      Duration INTEGER, SpanName TEXT, SpanKind TEXT, ServiceName TEXT,
      TraceState TEXT, StatusCode TEXT, StatusMessage TEXT,
      Model TEXT DEFAULT '', InputTokens INTEGER DEFAULT 0,
      OutputTokens INTEGER DEFAULT 0, TotalTokens INTEGER DEFAULT 0,
      ReasoningTokens INTEGER DEFAULT 0, Cost REAL DEFAULT 0.0,
      Input TEXT, Output TEXT, OutputObject TEXT, ToolCalls TEXT,
      FinishReason TEXT, Settings TEXT, SessionId TEXT DEFAULT '',
      SessionName TEXT DEFAULT '', UserId TEXT DEFAULT '',
      TraceName TEXT DEFAULT '', DatasetRunId TEXT DEFAULT '',
      DatasetRunName TEXT DEFAULT '', DatasetPath TEXT DEFAULT '',
      DatasetItemName TEXT DEFAULT '', DatasetExpectedOutput TEXT DEFAULT '',
      DatasetInput TEXT DEFAULT '', PromptName TEXT DEFAULT '', Props TEXT,
      Tags TEXT NOT NULL DEFAULT '[]',
      Metadata TEXT, ResourceAttributes TEXT, SpanAttributes TEXT,
      Events TEXT, Links TEXT, CreatedAt TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, score REAL NOT NULL,
      label TEXT NOT NULL, reason TEXT NOT NULL, name TEXT NOT NULL,
      type TEXT, source TEXT DEFAULT 'eval',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  return { testDb: db };
});

vi.mock('../../cli-src/server/database', () => ({ default: testDb }));

vi.mock('@agentmark-ai/shared-utils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, findPromptFiles: vi.fn().mockResolvedValue([]) };
});

vi.mock('@agentmark-ai/prompt-core', () => ({
  getTemplateDXInstance: vi.fn().mockReturnValue({
    parse: vi.fn().mockResolvedValue({}),
  }),
}));

import { createApiServer } from '../../cli-src/api-server';
import {
  TracesListResponseSchema,
  TraceDetailResponseSchema,
  SpansListResponseSchema,
  TraceSpansListResponseSchema,
  SpanIOResponseSchema,
  ScoresListResponseSchema,
  ScoreDetailResponseSchema,
  ScoreNamesResponseSchema,
  SessionsListResponseSchema,
  ErrorEnvelopeSchema,
} from '@agentmark-ai/api-schemas';
import type { ZodType } from 'zod';

// Suppress the test type checker - BetterSqlite3 is the type source
type _UsedTypeOnly = BetterSqlite3.Database;

let server: Server;
let baseUrl: string;

const TRACE_ID = 'trace-live-contract-001';
const SPAN_ID = 'span-live-contract-001';
const SESSION_ID = 'sess-live-contract';

function nowNanos(): string {
  return String(Date.now() * 1_000_000);
}

beforeAll(async () => {
  server = (await createApiServer(0)) as unknown as Server;
  const { port } = server.address() as AddressInfo;
  baseUrl = 'http://localhost:' + port;
});

afterAll(() => {
  server?.close();
  testDb.close();
});

async function getJson(pathname: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(baseUrl + pathname);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { status: res.status, body };
}

async function postJson(
  pathname: string,
  payload: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(baseUrl + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { status: res.status, body };
}

function expectSchema<T extends ZodType>(schema: T, value: unknown): void {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(
      'Schema validation failed:\n' +
        JSON.stringify(result.error.issues, null, 2) +
        '\nReceived: ' +
        JSON.stringify(value, null, 2),
    );
  }
}

// ---------------------------------------------------------------------------
// Empty-DB walk - every endpoint must return a schema-valid response
// ---------------------------------------------------------------------------

describe('live-contract - empty DB', () => {
  it('GET /health returns 200 (liveness probe used by `agentmark api`)', async () => {
    const r = await getJson('/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual(expect.objectContaining({ status: 'ok' }));
  });

  // Removed: GET /v1/openapi.json. The local CLI dev server no longer
  // serves the OpenAPI spec — the agentmark-mcp server fetches it
  // live from the gateway at startup, so bundling a stale snapshot
  // into the CLI is no longer useful. Headless agents read the spec
  // from `api.agentmark.co/v1/openapi.json` directly.

  it('GET /v1/capabilities returns target=local', async () => {
    const r = await getJson('/v1/capabilities');
    expect(r.status).toBe(200);
    expect((r.body as { target: string }).target).toBe('local');
  });

  it('GET /v1/traces - list is schema-valid + snake_case', async () => {
    const r = await getJson('/v1/traces');
    expect(r.status).toBe(200);
    expectSchema(TracesListResponseSchema, r.body);
  });

  it('GET /v1/traces/:id - 404 emits canonical envelope', async () => {
    const r = await getJson('/v1/traces/does-not-exist');
    expect(r.status).toBe(404);
    expectSchema(ErrorEnvelopeSchema, r.body);
  });

  it('GET /v1/spans - list is schema-valid (empty)', async () => {
    const r = await getJson('/v1/spans');
    expect(r.status).toBe(200);
    expectSchema(SpansListResponseSchema, r.body);
  });

  it('GET /v1/scores - list is schema-valid (empty)', async () => {
    const r = await getJson('/v1/scores');
    expect(r.status).toBe(200);
    expectSchema(ScoresListResponseSchema, r.body);
  });

  it('GET /v1/scores/names - schema-valid (empty)', async () => {
    const r = await getJson('/v1/scores/names');
    expect(r.status).toBe(200);
    expectSchema(ScoreNamesResponseSchema, r.body);
  });

  it('GET /v1/scores/:id - 404 emits canonical envelope', async () => {
    const r = await getJson('/v1/scores/00000000-0000-0000-0000-000000000000');
    expect(r.status).toBe(404);
    expectSchema(ErrorEnvelopeSchema, r.body);
  });

  it('GET /v1/sessions - list is schema-valid (empty)', async () => {
    const r = await getJson('/v1/sessions');
    expect(r.status).toBe(200);
    expectSchema(SessionsListResponseSchema, r.body);
  });

  it('GET /v1/metrics - 501 emits canonical envelope', async () => {
    const r = await getJson('/v1/metrics');
    expect(r.status).toBe(501);
    expectSchema(ErrorEnvelopeSchema, r.body);
    const body = r.body as { error: { code: string; hint?: string } };
    expect(body.error.code).toBe('not_available_locally');
    expect(typeof body.error.hint).toBe('string');
  });

  it('GET /v1/scores/aggregations - 501 emits canonical envelope', async () => {
    const r = await getJson('/v1/scores/aggregations');
    expect(r.status).toBe(501);
    expectSchema(ErrorEnvelopeSchema, r.body);
    expect((r.body as { error: { code: string } }).error.code).toBe('not_available_locally');
  });

  it('GET /v1/foobar - unknown route emits canonical envelope (not HTML)', async () => {
    const r = await getJson('/v1/foobar');
    expect(r.status).toBe(404);
    expectSchema(ErrorEnvelopeSchema, r.body);
  });

  it('GET /v1/templates without ?path - 400 emits canonical envelope', async () => {
    const r = await getJson('/v1/templates');
    expect(r.status).toBe(400);
    expectSchema(ErrorEnvelopeSchema, r.body);
  });

  it('POST /v1/traces with bad body - 400 emits canonical envelope', async () => {
    const r = await postJson('/v1/traces', {});
    expect(r.status).toBe(400);
    expectSchema(ErrorEnvelopeSchema, r.body);
  });

  it('POST /v1/scores with invalid source - canonical envelope', async () => {
    const r = await postJson('/v1/scores', {
      resource_id: 't1',
      name: 'x',
      score: 1,
      source: 'not_a_source',
    });
    expect(r.status).toBe(400);
    expectSchema(ErrorEnvelopeSchema, r.body);
  });
});

// ---------------------------------------------------------------------------
// Seeded-DB walk - drives the same endpoints with real rows. This is where
// the snake_case wire-mapper drift used to silently pass with empty fixtures.
// ---------------------------------------------------------------------------

describe('live-contract - seeded DB', () => {
  beforeAll(() => {
    testDb
      .prepare(
        `INSERT INTO traces (TraceId, SpanId, ParentSpanId, Type, Timestamp, Duration,
          SpanName, SpanKind, ServiceName, StatusCode, StatusMessage,
          Model, InputTokens, OutputTokens, TotalTokens, Cost,
          Input, Output, OutputObject, ToolCalls,
          SessionId, SessionName, Tags, Metadata, SpanAttributes
        ) VALUES (?,?,'','GENERATION',?,1500,'chat gpt-4o-mini','CLIENT','agentmark','1','',
          'gpt-4o-mini',20,25,45,0.0000123,
          '[{"role":"user","content":"hi"}]','hello back', NULL, NULL,
          ?, 'live-contract session', '["live-contract","seed-v1"]', '{}', '{}'
        )`,
      )
      .run(TRACE_ID, SPAN_ID, nowNanos(), SESSION_ID);

    testDb
      .prepare(
        `INSERT INTO scores (id, resource_id, name, score, label, reason, source, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        TRACE_ID,
        'live-contract-eval',
        0.95,
        'good',
        'verified',
        'eval',
        new Date().toISOString(),
      );
  });

  it('GET /v1/traces - list shape is snake_case + tags pass through', async () => {
    const r = await getJson('/v1/traces');
    expect(r.status).toBe(200);
    expectSchema(TracesListResponseSchema, r.body);
    const body = r.body as {
      data: Array<{ id: string; latency_ms: number; span_count: number; tags?: string[] }>;
    };
    const ours = body.data.find((t) => t.id === TRACE_ID);
    expect(ours).toBeDefined();
    expect(ours).toHaveProperty('latency_ms');
    expect(ours).toHaveProperty('span_count');
    expect(ours?.tags).toEqual(expect.arrayContaining(['live-contract', 'seed-v1']));
  });

  it('GET /v1/traces/:id - detail wire shape is snake_case', async () => {
    const r = await getJson('/v1/traces/' + TRACE_ID);
    expect(r.status).toBe(200);
    expectSchema(TraceDetailResponseSchema, r.body);
    const detail = (r.body as { data: { spans: Array<Record<string, unknown>> } }).data;
    expect(detail.spans[0]).toHaveProperty('trace_id');
    expect(detail.spans[0]).toHaveProperty('parent_id');
    expect(detail.spans[0]).toHaveProperty('duration_ms');
  });

  it('GET /v1/traces/:id?fields=graph - schema-valid', async () => {
    const r = await getJson('/v1/traces/' + TRACE_ID + '?fields=graph');
    expect(r.status).toBe(200);
    expectSchema(TraceDetailResponseSchema, r.body);
  });

  it('GET /v1/traces/:id/spans - list is snake_case', async () => {
    const r = await getJson('/v1/traces/' + TRACE_ID + '/spans');
    expect(r.status).toBe(200);
    expectSchema(TraceSpansListResponseSchema, r.body);
  });

  it('GET /v1/spans - search list is snake_case', async () => {
    const r = await getJson('/v1/spans');
    expect(r.status).toBe(200);
    expectSchema(SpansListResponseSchema, r.body);
  });

  it('GET /v1/traces/:id/spans/:id - span IO is snake_case', async () => {
    const r = await getJson('/v1/traces/' + TRACE_ID + '/spans/' + SPAN_ID);
    expect(r.status).toBe(200);
    expectSchema(SpanIOResponseSchema, r.body);
    const body = r.body as { data: Record<string, unknown> };
    expect(body.data).toHaveProperty('output_object');
    expect(body.data).toHaveProperty('tool_calls');
  });

  it('GET /v1/scores - list is snake_case (parity with detail)', async () => {
    const r = await getJson('/v1/scores');
    expect(r.status).toBe(200);
    expectSchema(ScoresListResponseSchema, r.body);
    const body = r.body as { data: Array<Record<string, unknown>> };
    expect(body.data[0]).toHaveProperty('resource_id');
    expect(body.data[0]).toHaveProperty('created_at');
  });

  it('GET /v1/scores/:id - detail is snake_case', async () => {
    const r = await getJson('/v1/scores/f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(r.status).toBe(200);
    expectSchema(ScoreDetailResponseSchema, r.body);
  });

  it('GET /v1/sessions - list is snake_case', async () => {
    const r = await getJson('/v1/sessions');
    expect(r.status).toBe(200);
    expectSchema(SessionsListResponseSchema, r.body);
    const body = r.body as { data: Array<Record<string, unknown>> };
    const sess = body.data.find((s) => s.id === SESSION_ID);
    expect(sess).toBeDefined();
    expect(sess).toHaveProperty('trace_count');
    expect(sess).toHaveProperty('total_cost');
    expect(sess).toHaveProperty('total_tokens');
    expect(sess).toHaveProperty('latency_ms');
  });

  it('GET /v1/traces?tag= - count CTE includes trace_tags JOIN (no SQLITE_ERROR)', async () => {
    const r = await getJson('/v1/traces?tag=live-contract');
    expect(r.status).toBe(200);
    expectSchema(TracesListResponseSchema, r.body);
    const body = r.body as {
      data: Array<{ id: string }>;
      pagination: { total: number };
    };
    expect(body.data.find((t) => t.id === TRACE_ID)).toBeDefined();
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /v1/traces?tag= - non-matching tag returns empty list', async () => {
    const r = await getJson('/v1/traces?tag=does-not-exist-xyz');
    expect(r.status).toBe(200);
    expectSchema(TracesListResponseSchema, r.body);
    expect((r.body as { data: unknown[] }).data).toHaveLength(0);
  });
});
