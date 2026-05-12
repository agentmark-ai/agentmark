/**
 * Consumer-side envelope contract test - the regression gate for the
 * client wrappers in `cli/src/lib/api/`.
 *
 * Sibling to `live-contract.test.ts`, which guards the SERVER side
 * (api-server emits canonical envelopes). This test guards the CONSUMER
 * side (functions in cli/src/lib/api/* correctly *read* the envelopes
 * the server emits), and would have caught the half-completed envelope
 * migration that left getTraceById/getExperiments/getExperimentById/
 * getSessions/getScoresByResourceId reading legacy keys after #2112
 * migrated only getTraces.
 *
 * This is the symmetric half of live-contract.test.ts: same in-memory
 * SQLite + real createApiServer setup, but the assertions are on the
 * client function return values (non-undefined, expected shape) rather
 * than on the wire response body. If a future server change drops the
 * legacy fallback or a client regresses to reading a wrong key, the
 * matching pair of tests fails together and the diagnosis is obvious.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import BetterSqlite3 from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Test DB - schema mirrors cli-src/server/database/index.ts
// (kept inline because the mock factory needs to be hoisted; we cannot
// import the real DB factory across the test file boundary).
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

// The UI-components type imports are irrelevant to runtime behavior here -
// stub them so the test does not need the full ui-components build.
vi.mock('@agentmark-ai/ui-components', () => ({}));

// API_URL is module-level on import, so we need a mutable mock that we
// can repoint at the random port the api-server binds to in beforeAll.
// The holder must be hoisted alongside vi.mock so it exists at the
// time the mock factory runs.
const { apiConfig } = vi.hoisted(() => ({
  apiConfig: { API_URL: '' } as { API_URL: string },
}));
vi.mock('../../src/config/api', () => apiConfig);

import { createApiServer } from '../../cli-src/api-server';
import { getTraces, getTraceById, getTraceGraph } from '../../src/lib/api/traces';
import {
  getExperiments,
  getExperimentById,
  getExperimentsWithTotal,
} from '../../src/lib/api/experiments';
import {
  getSessions,
  getSessionsWithTotal,
  getTracesBySessionId,
} from '../../src/lib/api/sessions';
import { getScoresByResourceId } from '../../src/lib/api/scores';
import { getDatasets } from '../../src/lib/api/datasets';
import { getRequests } from '../../src/lib/api/requests';

// Suppress the test type checker - BetterSqlite3 is the type source.
type _UsedTypeOnly = BetterSqlite3.Database;

let server: Server;

const TRACE_ID = 'trace-consumer-envelope-001';
const SPAN_ID = 'span-consumer-envelope-001';
const SESSION_ID = 'sess-consumer-envelope';
const SCORE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function nowNanos(): string {
  return String(Date.now() * 1_000_000);
}

beforeAll(async () => {
  server = (await createApiServer(0)) as unknown as Server;
  const { port } = server.address() as AddressInfo;
  apiConfig.API_URL = 'http://localhost:' + port;

  // Seed one trace + one score so detail/list endpoints have data to
  // return through the canonical envelope. The snake_case wire fields
  // are produced by the wire-mappers regardless of seed details.
  testDb
    .prepare(
      `INSERT INTO traces (TraceId, SpanId, ParentSpanId, Type, Timestamp, Duration,
        SpanName, SpanKind, ServiceName, StatusCode, StatusMessage,
        Model, InputTokens, OutputTokens, TotalTokens, Cost,
        Input, Output, OutputObject, ToolCalls,
        SessionId, SessionName, Tags, Metadata, SpanAttributes,
        DatasetRunId, DatasetRunName, DatasetPath, DatasetItemName,
        DatasetExpectedOutput, DatasetInput, PromptName
      ) VALUES (?,?,'','GENERATION',?,1500,'chat gpt-4o-mini','CLIENT','agentmark','1','',
        'gpt-4o-mini',20,25,45,0.0000123,
        '[{"role":"user","content":"hi"}]','hello back', NULL, NULL,
        ?, 'consumer-envelope session', '["consumer-envelope","seed-v1"]', '{}', '{}',
        ?, 'consumer-envelope-run', 'datasets/sample.jsonl', 'item-1',
        'expected', 'input-text', 'sample-prompt'
      )`,
    )
    .run(TRACE_ID, SPAN_ID, nowNanos(), SESSION_ID, 'run-consumer-envelope-001');

  testDb
    .prepare(
      `INSERT INTO scores (id, resource_id, name, score, label, reason, source, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(
      SCORE_ID,
      TRACE_ID,
      'consumer-envelope-eval',
      0.87,
      'good',
      'verified',
      'eval',
      new Date().toISOString(),
    );
});

afterAll(() => {
  server?.close();
  testDb.close();
});

// ---------------------------------------------------------------------------
// getTraces / getTraceById / getTraceGraph - the bug fixed in #2112 left
// getTraceById behind. This pair of tests asserts the consumer reads the
// canonical { data: ... } envelope from /v1/traces and /v1/traces/:id.
// ---------------------------------------------------------------------------

describe('consumer-envelope - traces', () => {
  it('getTraces returns the seeded trace through the canonical envelope', async () => {
    const result = await getTraces();
    expect(result).toBeDefined();
    expect(Array.isArray(result.traces)).toBe(true);
    const ours = result.traces.find((t) => t.id === TRACE_ID);
    expect(ours).toBeDefined();
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('getTraceById returns a non-null TraceData with the seeded id', async () => {
    const trace = await getTraceById(TRACE_ID);
    // The pre-fix bug returned undefined here because data.trace was
    // not in the canonical envelope. This assertion is the regression
    // gate.
    expect(trace).not.toBeNull();
    expect(trace).toBeDefined();
    expect((trace as { id: string }).id).toBe(TRACE_ID);
  });

  it('getTraceById returns null on 404 (no envelope confusion)', async () => {
    const trace = await getTraceById('does-not-exist-' + Date.now());
    expect(trace).toBeNull();
  });

  it('getTraceGraph returns an array (graph projection on detail endpoint)', async () => {
    const graph = await getTraceGraph(TRACE_ID);
    expect(Array.isArray(graph)).toBe(true);
  });

  it('getTraces surfaces wire-level tags array on the list shape', async () => {
    // The list wire (TraceResponseSchema) carries `tags?: string[]` —
    // the seed trace was inserted with `["consumer-envelope","seed-v1"]`
    // on its Tags column. Surface it here so any UI built against
    // `Trace.tags` reads the wire value, not undefined. The detail
    // wire doesn't currently emit tags, but if it ever adds them the
    // adapter in `wireTraceDetailToTraceData` is now forward-compatible.
    const result = await getTraces();
    const ours = result.traces.find((t) => t.id === TRACE_ID);
    expect(ours).toBeDefined();
    if (!ours) return;
    const tags = (ours as { tags?: string[] }).tags;
    expect(Array.isArray(tags)).toBe(true);
    expect(tags).toContain('consumer-envelope');
    expect(tags).toContain('seed-v1');
  });
});

// ---------------------------------------------------------------------------
// getExperiments / getExperimentById - the experiments page was broken
// twice over: wrong envelope key + flat-vs-nested shape. The list test
// asserts a defined array; the detail test asserts the reshape produces
// the consumer-side `{ summary, items }` form.
// ---------------------------------------------------------------------------

describe('consumer-envelope - experiments', () => {
  it('getExperiments returns a defined array (envelope-safe even when empty)', async () => {
    const result = await getExperiments();
    // The pre-fix bug returned undefined when reading data.experiments
    // off the canonical { data: [...], pagination } envelope, which
    // tripped a TypeError downstream when callers did `.map(...)`.
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getExperimentById returns null when the experiment does not exist (no .id-on-undefined throw)', async () => {
    // The pre-fix bug returned the entire `{ data: {...} }` envelope
    // and downstream code did `.summary.id`, which threw because the
    // wire is flat. Guard against that regression.
    const detail = await getExperimentById('does-not-exist-experiment-' + Date.now());
    expect(detail).toBeNull();
  });

  it('getExperimentsWithTotal surfaces pagination.total from the envelope', async () => {
    // Pre-fix bug: the experiments page hardcoded
    // total={experiments.length}, ignoring pagination.total. Once the
    // user paginates past the default 50-row window the "X of N"
    // counter is silently wrong. The new helper exposes the envelope's
    // total so the page can pass the real count to the list component.
    const { experiments, total } = await getExperimentsWithTotal();
    expect(typeof total).toBe('number');
    expect(total).toBeGreaterThanOrEqual(experiments.length);
  });
});

// ---------------------------------------------------------------------------
// getSessions / getTracesBySessionId - the same envelope-key bug that
// silently empties the sessions list page.
// ---------------------------------------------------------------------------

describe('consumer-envelope - sessions', () => {
  it('getSessions returns a defined array containing the seeded session', async () => {
    const sessions = await getSessions();
    // The pre-fix bug returned undefined when reading data.sessions off
    // { data: [...] }. Asserting Array.isArray catches the regression
    // without coupling the test to the seed state's exact length.
    expect(sessions).toBeDefined();
    expect(Array.isArray(sessions)).toBe(true);
    const ours = sessions.find((s) => s.id === SESSION_ID);
    expect(ours).toBeDefined();
  });

  it('getSessions translates snake_case wire fields to camelCase consumer fields', async () => {
    // Pre-fix bug: the wire emits `trace_count`, `total_cost`,
    // `total_tokens`, `latency_ms`, but the CLI consumer Session shape
    // (and the page-level mapper that follows it) read `traceCount`,
    // `totalCost`, `totalTokens`, `latency`. Result: every row on
    // /sessions silently rendered "-" for stats. The boundary
    // translation in `wireSessionToSession` is the regression gate.
    const sessions = await getSessions();
    const ours = sessions.find((s) => s.id === SESSION_ID);
    expect(ours).toBeDefined();
    if (!ours) return;
    expect(ours.traceCount).toBeDefined();
    expect(ours.traceCount).toBeGreaterThanOrEqual(1);
    expect(typeof ours.totalCost).toBe('number');
    expect(typeof ours.totalTokens).toBe('number');
    expect(typeof ours.latency).toBe('number');
    // start/end are wire ISO strings; the consumer must convert to ms.
    expect(typeof ours.start).toBe('number');
    expect(Number.isFinite(ours.start)).toBe(true);
  });

  it('getSessionsWithTotal surfaces pagination.total from the envelope', async () => {
    // Pre-fix bug: the page hardcoded sessionCount={sessions.length},
    // dropping the real total from the envelope's pagination block.
    // Once the user paginates past the default window the count is
    // silently wrong.
    const { sessions, total } = await getSessionsWithTotal();
    expect(typeof total).toBe('number');
    expect(total).toBeGreaterThanOrEqual(sessions.length);
  });

  it('getTracesBySessionId returns an array (already migrated to canonical envelope)', async () => {
    const traces = await getTracesBySessionId(SESSION_ID);
    expect(Array.isArray(traces)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getScoresByResourceId - silent failure mode (the fallback `|| []`
// papered over a real bug). Seeded data must surface, not get dropped.
// ---------------------------------------------------------------------------

describe('consumer-envelope - scores', () => {
  it('getScoresByResourceId surfaces a seeded score (the silent-empty regression)', async () => {
    const scores = await getScoresByResourceId(TRACE_ID);
    expect(Array.isArray(scores)).toBe(true);
    // The pre-fix bug returned [] silently because the consumer read
    // body.scores instead of body.data. With seed data, the corrected
    // consumer must surface the score.
    expect(scores.length).toBeGreaterThanOrEqual(1);
    const ours = scores.find((s) => s.id === SCORE_ID);
    expect(ours).toBeDefined();
    expect(ours?.name).toBe('consumer-envelope-eval');
  });

  it('getScoresByResourceId returns [] for an unknown resource (no shape mismatch)', async () => {
    const scores = await getScoresByResourceId('no-such-resource-' + Date.now());
    expect(Array.isArray(scores)).toBe(true);
    expect(scores).toHaveLength(0);
  });

  it('two-query merge surfaces a CLI eval score (resource_id=traceId) when the user clicks a child span', async () => {
    // CLI eval scores live with `resource_id = traceId` while dashboard
    // annotations live with `resource_id = spanId`. The trace drawer
    // surfaces a span's evaluations by issuing both queries and merging
    // the results de-duplicated by score id (see the `handleSpanChange`
    // callback in `src/app/traces/trace-drawer.tsx`). Without the merge,
    // the user clicking the LLM child span (whose own span id is NOT the
    // trace id) would always see "No evaluation data" even though the
    // score exists. This test pins the merge contract: independent
    // queries combined must surface the trace-level eval.
    const childSpanId = 'span-no-scores-here';
    const [bySpan, byTrace] = await Promise.all([
      getScoresByResourceId(childSpanId),
      getScoresByResourceId(TRACE_ID),
    ]);
    expect(bySpan).toHaveLength(0);
    expect(byTrace.length).toBeGreaterThanOrEqual(1);

    // Mirror the merge pattern from trace-drawer.tsx exactly.
    const seen = new Set<string>();
    const merged: typeof bySpan = [];
    for (const list of [bySpan, byTrace]) {
      for (const s of list) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        merged.push(s);
      }
    }
    const ours = merged.find((s) => s.id === SCORE_ID);
    expect(ours).toBeDefined();
    expect(ours?.name).toBe('consumer-envelope-eval');
  });

  it('two-query merge does not double-count when span.id === trace.id (root selection)', async () => {
    // For the synthetic-root view (or a single-root trace where
    // `selectedSpan.id === traceId`), the merge contract guards against
    // double counting by only firing the second query when the trace id
    // differs from the span id. This test mirrors that guard.
    const queries = [getScoresByResourceId(TRACE_ID)];
    // Mirror trace-drawer.tsx: skip the second query when ids collide.
    const traceIdForSpan: string | undefined = TRACE_ID;
    if (traceIdForSpan && traceIdForSpan !== TRACE_ID) {
      queries.push(getScoresByResourceId(traceIdForSpan));
    }
    expect(queries).toHaveLength(1);
    const [scores] = await Promise.all(queries);
    expect(scores!.filter((s) => s.id === SCORE_ID)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getDatasets - api-server here still emits the legacy `{ datasets: [] }`
// shape. The consumer is now envelope-tolerant for forward-compat, so
// the assertion is the same regardless of which shape the server is on:
// returns a defined array.
// ---------------------------------------------------------------------------

describe('consumer-envelope - datasets', () => {
  it('getDatasets returns a defined string array', async () => {
    const datasets = await getDatasets();
    expect(Array.isArray(datasets)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getRequests - reads `GET /v1/requests`, which lists GENERATION-type
// traces in the canonical `{ data: [...], pagination }` envelope. The
// seeded root span above is a GENERATION, so it surfaces here. The
// consumer must (a) pull rows off `data`, never the legacy flat
// `{ requests }`, and (b) parse the wire's ISO `ts` string into a
// `Date` for the `<Requests>` UI component. A regression on either
// re-introduces the original `Cannot read properties of undefined
// (reading 'map')` / invalid-date crash.
// ---------------------------------------------------------------------------

describe('consumer-envelope - requests', () => {
  it('getRequests reads the canonical envelope and surfaces the seeded GENERATION span', async () => {
    const requests = await getRequests();
    expect(Array.isArray(requests)).toBe(true);

    const seeded = requests.find((r) => r.id === SPAN_ID);
    expect(seeded).toBeDefined();
    expect(seeded!.model_used).toBe('gpt-4o-mini');
    expect(seeded!.trace_id).toBe(TRACE_ID);
    // The consumer parses the wire's ISO `ts` string into a Date.
    expect(seeded!.ts).toBeInstanceOf(Date);
    expect(Number.isNaN(seeded!.ts.getTime())).toBe(false);
  });
});
