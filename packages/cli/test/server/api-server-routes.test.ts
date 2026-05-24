import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import fs from 'fs';
import path from 'path';

// vi.hoisted runs before vi.mock hoisting, so testDb is available in mock factories
const { testDb } = vi.hoisted(() => {
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(':memory:');
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
      Tags TEXT DEFAULT '',
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
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_traces_trace_id ON traces(TraceId);
    CREATE INDEX IF NOT EXISTS idx_traces_session_id ON traces(SessionId);
    CREATE INDEX IF NOT EXISTS idx_traces_type_timestamp ON traces(Type, Timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_traces_dataset_run_id ON traces(DatasetRunId);
  `);
  return { testDb: db };
});

vi.mock('../../cli-src/server/database', () => ({ default: testDb }));

// Must mock findPromptFiles and getTemplateDXInstance so the server can start
// without a real filesystem of prompt files
vi.mock('@agentmark-ai/shared-utils', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return { ...actual, findPromptFiles: vi.fn().mockResolvedValue([]) };
});

vi.mock('@agentmark-ai/prompt-core', () => ({
  getTemplateDXInstance: vi.fn().mockReturnValue({
    parse: vi.fn().mockResolvedValue({}),
  }),
}));

import { createApiServer } from '../../cli-src/api-server';

// ---------------------------------------------------------------------------
// Test setup — start server on a random port
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;
const testConfigPath = path.join(process.cwd(), 'agentmark.json');
const testDatasetName = '__api_server_dataset_e2e';
const testTraceImportDatasetName = '__api_server_trace_import_e2e';
const testSpanImportDatasetName = '__api_server_span_import_e2e';
const testDatasetPaths = [
  path.join(process.cwd(), 'agentmark', `${testDatasetName}.jsonl`),
  path.join(process.cwd(), 'agentmark', `${testTraceImportDatasetName}.jsonl`),
  path.join(process.cwd(), 'agentmark', `${testSpanImportDatasetName}.jsonl`),
];
let hadExistingConfig = false;
let existingConfigContents = '';

beforeAll(async () => {
  hadExistingConfig = fs.existsSync(testConfigPath);
  if (hadExistingConfig) {
    existingConfigContents = fs.readFileSync(testConfigPath, 'utf-8');
  } else {
    fs.writeFileSync(
      testConfigPath,
      JSON.stringify({ version: '2.0.0', agentmarkPath: '.' }, null, 2),
      'utf-8',
    );
  }

  // Seed a trace so GET /v1/traces has data to return
  testDb.prepare(`
    INSERT INTO traces (
      TraceId, SpanId, ParentSpanId, Type, Timestamp, Duration, SpanName, StatusCode,
      Cost, TotalTokens, Input, Output, Metadata, CreatedAt
    )
    VALUES (
      'trace-int-1', 'span-int-1', '', 'SPAN', '1704067200000000', 100, 'test-trace', '1',
      0.01, 50, '{"question":"hello"}', '{"answer":"world"}', '{"source":"integration"}', datetime('now')
    )
  `).run();

  // Seed a GENERATION span on the same trace so GET /v1/requests has data.
  testDb.prepare(`
    INSERT INTO traces (
      TraceId, SpanId, ParentSpanId, Type, Timestamp, Duration, SpanName, StatusCode,
      Model, InputTokens, OutputTokens, Cost, Input, Output, UserId, PromptName,
      StatusMessage, Props, CreatedAt
    )
    VALUES (
      'trace-int-1', 'gen-int-1', 'span-int-1', 'GENERATION', '1704067200100000', 80,
      'invoke gpt-4o', '1', 'gpt-4o', 156, 89, 0.0042, '{"q":"capital of France"}',
      'Paris.', 'user-int-1', 'geography-qa', '', '{"lang":"en"}', datetime('now')
    )
  `).run();

  server = await createApiServer(0) as unknown as Server;
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
});

afterAll(() => {
  server?.close();
  if (hadExistingConfig) {
    fs.writeFileSync(testConfigPath, existingConfigContents, 'utf-8');
  } else if (fs.existsSync(testConfigPath)) {
    fs.unlinkSync(testConfigPath);
  }
  for (const datasetPath of testDatasetPaths) {
    if (fs.existsSync(datasetPath)) {
      fs.unlinkSync(datasetPath);
    }
  }
  testDb.close();
});

// ---------------------------------------------------------------------------
// Tests — correspond to the 4 manual test items in the PR
// ---------------------------------------------------------------------------

describe('API server route integration', () => {
  // Manual test item 1: GET /v1/traces returns { data, pagination } envelope
  it('GET /v1/traces returns { data, pagination } envelope', async () => {
    const res = await fetch(`${baseUrl}/v1/traces`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('pagination');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toEqual(
      expect.objectContaining({ total: expect.any(Number), limit: expect.any(Number), offset: expect.any(Number) }),
    );

    // Verify trace shape
    if (body.data.length > 0) {
      const trace = body.data[0];
      expect(trace).toHaveProperty('id');
      expect(trace).toHaveProperty('status');
      expect(trace).toHaveProperty('start');
      expect(trace).toHaveProperty('end');
    }
  });

  // Manual test item 2: GET /v1/capabilities returns local capabilities map
  it('GET /v1/capabilities returns local capabilities map', async () => {
    const res = await fetch(`${baseUrl}/v1/capabilities`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.target).toBe('local');
    expect(body).toHaveProperty('url');
    expect(body).toHaveProperty('endpoints');

    // Verify local endpoints
    expect(body.endpoints.traces).toBe(true);
    expect(body.endpoints.sessions).toBe(true);
    expect(body.endpoints.scores).toBe(true);
    expect(body.endpoints.experiments).toBe(true);
    expect(body.endpoints.datasets).toBe(true);
    expect(body.endpoints.prompts).toBe(true);

    // Remote-only should be false
    expect(body.endpoints.metrics).toBe(false);
    expect(body.endpoints.score_analytics).toBe(false);
  });

  it('GET /v1/config returns the local agentmark.json contents', async () => {
    const res = await fetch(`${baseUrl}/v1/config`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('commit_sha');
    expect(body.data).toHaveProperty('config');
    expect(body.data.config).toHaveProperty('agentmarkPath');
  });

  // Manual test item 3: GET /v1/metrics returns 501 with hint
  // The canonical envelope nests `error: { code, message, hint }` under
  // a single `error` key (post envelope-canonicalization).
  it('GET /v1/metrics returns 501 with hint', async () => {
    const res = await fetch(`${baseUrl}/v1/metrics`);
    expect(res.status).toBe(501);

    const body = await res.json();
    expect(body.error).toEqual(
      expect.objectContaining({
        code: 'not_available_locally',
        message: expect.any(String),
        hint: expect.stringContaining('--remote'),
      }),
    );
  });

  // Removed: GET /v1/openapi.json. The local CLI dev server no longer
  // bundles + serves the OpenAPI spec — that was the read endpoint
  // for the retired `agentmark api` specli wrapper. The
  // `agentmark-mcp` server now fetches the spec directly from
  // `api.agentmark.co/v1/openapi.json` (cached locally for 24h), so
  // the local dev server doesn't need to mirror it.

  it('POST /v1/datasets/:datasetName/rows enforces canonical dataset row shape', async () => {
    const res = await fetch(`${baseUrl}/v1/datasets/${testDatasetName}/rows`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { question: 'hello' },
        expected_output: { answer: 'world' },
        metadata: { split: 'eval' },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.line_number).toBe(0);

    const stored = fs.readFileSync(testDatasetPaths[0]!, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(stored).toEqual([{
      input: { question: 'hello' },
      expected_output: { answer: 'world' },
      metadata: { split: 'eval' },
    }]);
  });

  it('POST /v1/datasets/:datasetName/rows/from-traces imports canonical rows from trace data', async () => {
    const res = await fetch(`${baseUrl}/v1/datasets/${testTraceImportDatasetName}/rows/from-traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        trace_ids: ['trace-int-1'],
        mapping: {
          input: '$.input',
          expected_output: '$.output',
          metadata: {
            source: '$.metadata.source',
            trace_id: '$.id',
          },
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.added).toBe(1);
    expect(body.data.results[0]).toMatchObject({ source_id: 'trace-int-1', status: 'created', line_number: 0 });

    const stored = fs.readFileSync(testDatasetPaths[1]!, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(stored).toEqual([{
      input: { question: 'hello' },
      expected_output: { answer: 'world' },
      metadata: { source: 'integration', trace_id: 'trace-int-1' },
    }]);
  });

  it('POST /v1/datasets/:datasetName/rows/from-spans imports canonical rows from span data', async () => {
    const res = await fetch(`${baseUrl}/v1/datasets/${testSpanImportDatasetName}/rows/from-spans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        span_ids: ['span-int-1'],
        mapping: {
          input: '$.input',
          expected_output: '$.output',
          metadata: {
            span_id: '$.id',
          },
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.added).toBe(1);
    expect(body.data.results[0]).toMatchObject({ source_id: 'span-int-1', status: 'created', line_number: 0 });

    const stored = fs.readFileSync(testDatasetPaths[2]!, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(stored).toEqual([{
      input: { question: 'hello' },
      expected_output: { answer: 'world' },
      metadata: { span_id: 'span-int-1' },
    }]);
  });

  it('POST /v1/datasets/:datasetName/rows/from-traces returns 207 when every source is missing', async () => {
    const res = await fetch(`${baseUrl}/v1/datasets/${testTraceImportDatasetName}/rows/from-traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        trace_ids: ['missing-trace'],
      }),
    });

    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.data).toEqual({
      added: 0,
      results: [
        { source_id: 'missing-trace', status: 'failed', error: 'Source not found' },
      ],
    });
  });

  it('POST /v1/datasets/:datasetName/rows/from-spans returns 207 when every source is missing', async () => {
    const res = await fetch(`${baseUrl}/v1/datasets/${testSpanImportDatasetName}/rows/from-spans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        span_ids: ['missing-span'],
      }),
    });

    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.data).toEqual({
      added: 0,
      results: [
        { source_id: 'missing-span', status: 'failed', error: 'Source not found' },
      ],
    });
  });

  // Additional: verify 501 stub for score aggregations.
  // Canonical envelope: `error: { code, message, hint }`.
  it('GET /v1/scores/aggregations returns 501', async () => {
    const res = await fetch(`${baseUrl}/v1/scores/aggregations`);
    expect(res.status).toBe(501);

    const body = await res.json();
    expect(body.error).toEqual(
      expect.objectContaining({ code: 'not_available_locally' }),
    );
  });

  // Additional: verify { data, pagination } envelope on sessions
  it('GET /v1/sessions returns { data, pagination } envelope', async () => {
    const res = await fetch(`${baseUrl}/v1/sessions`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('pagination');
    expect(Array.isArray(body.data)).toBe(true);
  });

  // Additional: verify { data, pagination } envelope on scores
  it('GET /v1/scores returns { data, pagination } envelope', async () => {
    const res = await fetch(`${baseUrl}/v1/scores`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('pagination');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /v1/requests returns { data, pagination } with the seeded GENERATION span', async () => {
    const res = await fetch(`${baseUrl}/v1/requests`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('pagination');
    expect(Array.isArray(body.data)).toBe(true);

    const row = body.data.find((r: { id: string }) => r.id === 'gen-int-1');
    expect(row).toBeDefined();
    // snake_case wire shape — the contract external SDK consumers see.
    expect(row).toMatchObject({
      id: 'gen-int-1',
      trace_id: 'trace-int-1',
      model_used: 'gpt-4o',
      prompt_tokens: 156,
      completion_tokens: 89,
      status: 'OK',
      prompt_name: 'geography-qa',
      user_id: 'user-int-1',
    });
    expect(row).not.toHaveProperty('modelUsed');
  });

  it('GET /v1/requests?model= filters to the matching model', async () => {
    const match = await fetch(`${baseUrl}/v1/requests?model=gpt-4o`);
    expect(match.status).toBe(200);
    const matchBody = await match.json();
    expect(matchBody.data.some((r: { id: string }) => r.id === 'gen-int-1')).toBe(true);

    const miss = await fetch(`${baseUrl}/v1/requests?model=does-not-exist`);
    const missBody = await miss.json();
    expect(missBody.data).toEqual([]);
    expect(missBody.pagination.total).toBe(0);
  });

  it('GET /v1/requests with invalid limit returns 400', async () => {
    const res = await fetch(`${baseUrl}/v1/requests?limit=-1`);
    expect(res.status).toBe(400);
  });

  // Verify invalid limit/offset returns 400
  it('GET /v1/traces with invalid limit returns 400', async () => {
    const res = await fetch(`${baseUrl}/v1/traces?limit=-1`);
    expect(res.status).toBe(400);
  });

  // --- New endpoint coverage ---

  it('GET /v1/traces/:traceId/spans returns spans for a trace', async () => {
    const res = await fetch(`${baseUrl}/v1/traces/trace-int-1/spans`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /v1/traces/:traceId/spans/:spanId returns span IO', async () => {
    const res = await fetch(`${baseUrl}/v1/traces/trace-int-1/spans/span-int-1`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('input');
    expect(body.data).toHaveProperty('output');
  });

  it('GET /v1/traces/:traceId/spans/:spanId returns 404 for missing span', async () => {
    const res = await fetch(`${baseUrl}/v1/traces/trace-int-1/spans/nonexistent`);
    expect(res.status).toBe(404);
  });

  it('GET /v1/scores/names returns { data } with array of strings', async () => {
    // Seed a score so there's at least one name
    testDb.prepare(`
      INSERT OR IGNORE INTO scores (id, resource_id, score, label, reason, name, source)
      VALUES ('score-int-1', 'trace-int-1', 0.9, '', '', 'accuracy', 'eval')
    `).run();

    const res = await fetch(`${baseUrl}/v1/scores/names`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toContain('accuracy');
  });

  it('POST /v1/scores returns { message, id } matching the wire format', async () => {
    // Phase B (#2081): the CLI now validates bodies with a shared Zod
    // schema that requires `resource_id`. Pre-migration, the service
    // layer was lenient and accepted both `resourceId` and
    // `resource_id`; that leniency is gone by design.
    const res = await fetch(`${baseUrl}/v1/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_id: 'trace-int-1', score: 0.8, label: '', reason: '', name: 'quality' }),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('id');
    expect(body.message).toBe('Score created successfully');
    // Should NOT have a nested `data` wrapper
    expect(body).not.toHaveProperty('data');
  });

  it('POST /v1/scores/batch inserts all items and returns 201 when all valid', async () => {
    const res = await fetch(`${baseUrl}/v1/scores/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scores: [
          { resource_id: 'trace-int-1', name: 'quality', score: 0.91, client_id: 'row-1' },
          { resourceId: 'trace-int-1', name: 'relevance', score: 0.82 },
        ],
      }),
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      data: {
        results: Array<{ status: string; id?: string; client_id?: string }>;
        summary: { total: number; succeeded: number; failed: number };
      };
    };
    expect(body.data.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
    expect(body.data.results[0]!.status).toBe('success');
    expect(body.data.results[0]!.client_id).toBe('row-1');
    expect(body.data.results[1]!.status).toBe('success');
    expect(body.data.results[1]!.client_id).toBeUndefined();

    // Verify both rows actually landed (look up by the server-generated IDs so we
    // don't collide with scores inserted by prior tests)
    const ids = body.data.results
      .filter((r): r is { status: 'success'; id: string; client_id?: string } => r.status === 'success')
      .map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const rows = testDb
      .prepare(`SELECT name FROM scores WHERE id IN (${placeholders})`)
      .all(...ids) as Array<{ name: string }>;
    expect(rows.map((r) => r.name).sort()).toEqual(['quality', 'relevance']);
  });

  it('POST /v1/scores/batch returns 207 on mixed success and validation errors', async () => {
    const res = await fetch(`${baseUrl}/v1/scores/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scores: [
          { resource_id: 'trace-int-1', name: 'good', score: 0.5 },
          { name: 'missing-resource', score: 0.1 }, // no resource_id
          { resource_id: 'trace-int-1', name: 'bad-dt', score: 0.5, dataType: 'bogus' },
        ],
      }),
    });
    expect(res.status).toBe(207);

    const body = (await res.json()) as {
      data: {
        results: Array<{ status: string; error?: { code: string } }>;
        summary: { total: number; succeeded: number; failed: number };
      };
    };
    expect(body.data.summary).toEqual({ total: 3, succeeded: 1, failed: 2 });
    expect(body.data.results[0]!.status).toBe('success');
    expect(body.data.results[1]!.error!.code).toBe('missing_required_field');
    expect(body.data.results[2]!.error!.code).toBe('invalid_field_value');
  });

  it('POST /v1/scores/batch returns 400 when every item fails validation', async () => {
    const res = await fetch(`${baseUrl}/v1/scores/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores: [{ name: 'no-resource', score: 1 }] }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /v1/scores/batch returns 413 when batch exceeds max size', async () => {
    const scores = Array.from({ length: 1001 }, (_, i) => ({
      resource_id: `t-${i}`,
      name: 'n',
      score: 0,
    }));
    const res = await fetch(`${baseUrl}/v1/scores/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores }),
    });
    expect(res.status).toBe(413);
  });

  it('POST /v1/scores/batch returns 400 when envelope is malformed', async () => {
    const res = await fetch(`${baseUrl}/v1/scores/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ not_scores: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /v1/pricing returns a model-id-keyed pricing map', async () => {
    const res = await fetch(`${baseUrl}/v1/pricing`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, { promptPrice: number; completionPrice: number }>;
    // Must return an object, be non-empty, and every entry must have the
    // two price fields as numbers. We don't assert specific model IDs —
    // the registry can change without breaking this shape contract.
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();

    const entries = Object.entries(body);
    expect(entries.length).toBeGreaterThan(0);
    for (const [, entry] of entries.slice(0, 5)) {
      expect(typeof entry.promptPrice).toBe('number');
      expect(typeof entry.completionPrice).toBe('number');
    }

    // Caching header must be set so the shape matches the wire contract.
    expect(res.headers.get('cache-control')).toMatch(/max-age=\d+/);
  });

  it('GET /v1/capabilities reports pricing: true', async () => {
    const res = await fetch(`${baseUrl}/v1/capabilities`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { endpoints: Record<string, boolean> };
    expect(body.endpoints.pricing).toBe(true);
  });

});
