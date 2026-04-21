import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { NotAvailableLocallyError } from '../../../cli-src/server/services/errors';

// Mock the route modules that use the global db singleton.
// The service delegates getTraces/getTraceDetail/getExperiments to these.
vi.mock('../../../cli-src/server/routes/traces', () => ({
  getTraces: vi.fn(),
  getTraceCount: vi.fn(),
  getTraceById: vi.fn(),
  getTracesBySessionId: vi.fn(),
}));

vi.mock('../../../cli-src/server/routes/experiments', () => ({
  getExperiments: vi.fn(),
  getExperimentById: vi.fn(),
}));

import { LocalObservabilityService } from '../../../cli-src/server/services/local-observability-service';
import {
  getTraces as mockGetTraces,
  getTraceCount as mockGetTraceCount,
  getTraceById as mockGetTraceById,
  getTracesBySessionId as mockGetTracesBySessionId,
} from '../../../cli-src/server/routes/traces';
import {
  getExperiments as mockGetExperiments,
} from '../../../cli-src/server/routes/experiments';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APP_ID = 'local' as any; // Satisfies VerifiedAppId branded type

function createTestDb(): Database.Database {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE IF NOT EXISTS traces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      TraceId TEXT NOT NULL,
      SpanId TEXT NOT NULL,
      ParentSpanId TEXT,
      Type TEXT NOT NULL DEFAULT 'SPAN',
      Timestamp TEXT NOT NULL,
      EndTime REAL,
      Duration INTEGER,
      SpanName TEXT,
      SpanKind TEXT,
      ServiceName TEXT,
      TraceState TEXT,
      StatusCode TEXT,
      StatusMessage TEXT,
      Model TEXT DEFAULT '',
      InputTokens INTEGER DEFAULT 0,
      OutputTokens INTEGER DEFAULT 0,
      TotalTokens INTEGER DEFAULT 0,
      ReasoningTokens INTEGER DEFAULT 0,
      Cost REAL DEFAULT 0.0,
      Input TEXT,
      Output TEXT,
      OutputObject TEXT,
      ToolCalls TEXT,
      FinishReason TEXT,
      Settings TEXT,
      SessionId TEXT DEFAULT '',
      SessionName TEXT DEFAULT '',
      UserId TEXT DEFAULT '',
      TraceName TEXT DEFAULT '',
      DatasetRunId TEXT DEFAULT '',
      DatasetRunName TEXT DEFAULT '',
      DatasetPath TEXT DEFAULT '',
      DatasetItemName TEXT DEFAULT '',
      DatasetExpectedOutput TEXT DEFAULT '',
      DatasetInput TEXT DEFAULT '',
      PromptName TEXT DEFAULT '',
      Props TEXT,
      Metadata TEXT,
      ResourceAttributes TEXT,
      SpanAttributes TEXT,
      Events TEXT,
      Links TEXT,
      CreatedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      score REAL NOT NULL,
      label TEXT NOT NULL,
      reason TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT,
      source TEXT DEFAULT 'eval',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  return db;
}

function insertTrace(
  database: Database.Database,
  overrides: Partial<{
    TraceId: string;
    SpanId: string;
    ParentSpanId: string | null;
    Type: string;
    Timestamp: string;
    Duration: number;
    SpanName: string;
    StatusCode: string;
    Model: string;
    Input: string;
    Output: string;
    OutputObject: string;
    ToolCalls: string;
    Metadata: string;
    SessionId: string;
    SessionName: string;
    TraceName: string;
    Cost: number;
    TotalTokens: number;
    InputTokens: number;
    OutputTokens: number;
    PromptName: string;
    DatasetRunId: string;
    DatasetRunName: string;
    DatasetPath: string;
    CreatedAt: string;
  }> = {},
) {
  const defaults = {
    TraceId: 'trace-1',
    SpanId: 'span-1',
    ParentSpanId: null,
    Type: 'SPAN',
    Timestamp: '1000000000000000',
    Duration: 100,
    SpanName: 'test-span',
    StatusCode: '1',
    Model: '',
    Input: '',
    Output: '',
    OutputObject: '',
    ToolCalls: null,
    Metadata: '{}',
    SessionId: '',
    SessionName: '',
    TraceName: '',
    Cost: 0,
    TotalTokens: 0,
    InputTokens: 0,
    OutputTokens: 0,
    PromptName: '',
    DatasetRunId: '',
    DatasetRunName: '',
    DatasetPath: '',
    CreatedAt: '2026-01-01 00:00:00',
  };
  const row = { ...defaults, ...overrides };
  database.prepare(`
    INSERT INTO traces (
      TraceId, SpanId, ParentSpanId, Type, Timestamp, Duration,
      SpanName, StatusCode, Model, Input, Output, OutputObject, ToolCalls,
      Metadata, SessionId, SessionName, TraceName, Cost, TotalTokens,
      InputTokens, OutputTokens, PromptName, DatasetRunId, DatasetRunName,
      DatasetPath, CreatedAt
    ) VALUES (
      @TraceId, @SpanId, @ParentSpanId, @Type, @Timestamp, @Duration,
      @SpanName, @StatusCode, @Model, @Input, @Output, @OutputObject, @ToolCalls,
      @Metadata, @SessionId, @SessionName, @TraceName, @Cost, @TotalTokens,
      @InputTokens, @OutputTokens, @PromptName, @DatasetRunId, @DatasetRunName,
      @DatasetPath, @CreatedAt
    )
  `).run(row);
}

function insertScore(
  database: Database.Database,
  overrides: Partial<{
    id: string;
    resource_id: string;
    score: number;
    label: string;
    reason: string;
    name: string;
    type: string;
    source: string;
    created_at: string;
  }> = {},
) {
  const defaults = {
    id: 'score-1',
    resource_id: 'trace-1',
    score: 0.9,
    label: '',
    reason: '',
    name: 'accuracy',
    type: null,
    source: 'eval',
    created_at: '2026-01-01 00:00:00',
  };
  const row = { ...defaults, ...overrides };
  database.prepare(`
    INSERT INTO scores (id, resource_id, score, label, reason, name, type, source, created_at)
    VALUES (@id, @resource_id, @score, @label, @reason, @name, @type, @source, @created_at)
  `).run(row);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalObservabilityService', () => {
  let testDb: Database.Database;
  let service: LocalObservabilityService;

  beforeEach(() => {
    vi.clearAllMocks();
    testDb = createTestDb();
    service = new LocalObservabilityService(testDb);
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('should create service with a valid db instance', () => {
      expect(service).toBeInstanceOf(LocalObservabilityService);
    });
  });

  // -------------------------------------------------------------------------
  // checkConnectivity
  // -------------------------------------------------------------------------

  describe('checkConnectivity', () => {
    it('should return true when db is valid', async () => {
      const result = await service.checkConnectivity();
      expect(result).toBe(true);
    });

    it('should return false when db throws on pragma', async () => {
      testDb.close();
      const result = await service.checkConnectivity();
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Methods not available locally — NotAvailableLocallyError
  // -------------------------------------------------------------------------

  describe('methods not available locally', () => {
    const notAvailableMethods: Array<{
      method: string;
      call: (svc: LocalObservabilityService) => Promise<unknown>;
    }> = [
      { method: 'getMetrics', call: (svc) => svc.getMetrics(APP_ID, { start: '', end: '' }) },
      { method: 'getExtendedMetrics', call: (svc) => svc.getExtendedMetrics(APP_ID, { start: '', end: '' }) },
      { method: 'getModelStats', call: (svc) => svc.getModelStats(APP_ID, { start: '', end: '' }) },
      { method: 'getPercentiles', call: (svc) => svc.getPercentiles(APP_ID, { dateRange: { start: '', end: '' } } as any) },
      { method: 'getScoreAggregations', call: (svc) => svc.getScoreAggregations(APP_ID, { start: '', end: '' }) },
      { method: 'getScoreHistogram', call: (svc) => svc.getScoreHistogram(APP_ID, 'test', { start: '', end: '' }) },
      { method: 'getScoreTrend', call: (svc) => svc.getScoreTrend(APP_ID, 'test', 'day' as any, { start: '', end: '' }) },
      { method: 'getScoreComparison', call: (svc) => svc.getScoreComparison(APP_ID, 'a', 'b', { start: '', end: '' }) },
      { method: 'getScoreScatter', call: (svc) => svc.getScoreScatter(APP_ID, 'a', 'b', { start: '', end: '' }) },
      { method: 'getRankingData', call: (svc) => svc.getRankingData(APP_ID, { start: '', end: '' }, 'model') },
      { method: 'getAggregateRequests', call: (svc) => svc.getAggregateRequests(APP_ID, {} as any) },
      { method: 'getSpanKindBreakdown', call: (svc) => svc.getSpanKindBreakdown(APP_ID, { startDate: '', endDate: '' }) },
    ];

    for (const { method, call } of notAvailableMethods) {
      it(`should throw NotAvailableLocallyError for ${method}`, async () => {
        await expect(call(service)).rejects.toThrow(NotAvailableLocallyError);
      });

      it(`should include method name "${method}" in the error`, async () => {
        try {
          await call(service);
          expect.fail('Should have thrown');
        } catch (err: any) {
          expect(err).toBeInstanceOf(NotAvailableLocallyError);
          expect(err.method).toBe(method);
          expect(err.message).toContain(`${method}()`);
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // getTraces
  // -------------------------------------------------------------------------

  describe('getTraces', () => {
    it('should return empty traces with pagination when no traces exist', async () => {
      (mockGetTraces as any).mockResolvedValue([]);
      (mockGetTraceCount as any).mockResolvedValue(0);

      const result = await service.getTraces(APP_ID, { limit: 10, offset: 0 });

      expect(result).toEqual({
        traces: [],
        total: 0,
        limit: 10,
        offset: 0,
      });
    });

    it('should return traces in correct format when traces exist', async () => {
      (mockGetTraces as any).mockResolvedValue([
        {
          id: 'trace-1',
          name: 'my-trace',
          status: '1',
          start: 1704067200000,
          end: 1704067201000,
          latency: 1000,
          cost: 0.05,
          tokens: 150,
          span_count: 3,
        },
      ]);
      (mockGetTraceCount as any).mockResolvedValue(1);

      const result = await service.getTraces(APP_ID, { limit: 50, offset: 0 });

      expect(result.traces).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.traces[0]).toEqual({
        id: 'trace-1',
        name: 'my-trace',
        status: 'OK',
        start: expect.any(String),
        end: expect.any(String),
        latencyMs: 1000,
        cost: 0.05,
        tokens: 150,
        spanCount: 3,
      });
    });

    it('should map status name to code when filtering by status', async () => {
      (mockGetTraces as any).mockResolvedValue([]);
      (mockGetTraceCount as any).mockResolvedValue(0);

      await service.getTraces(APP_ID, { limit: 10, offset: 0, status: 'ERROR' });

      expect(mockGetTraces).toHaveBeenCalledWith(
        expect.objectContaining({ status: '2' }),
      );
      expect(mockGetTraceCount).toHaveBeenCalledWith(
        expect.objectContaining({ status: '2' }),
      );
    });

    it('should pass undefined status when no status filter provided', async () => {
      (mockGetTraces as any).mockResolvedValue([]);
      (mockGetTraceCount as any).mockResolvedValue(0);

      await service.getTraces(APP_ID, { limit: 10, offset: 0 });

      expect(mockGetTraces).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined }),
      );
    });

    it('should map status code 0 to UNSET', async () => {
      (mockGetTraces as any).mockResolvedValue([
        { id: 't1', name: '', status: '0', start: 0, end: 0, latency: 0, cost: 0, tokens: 0, span_count: 0 },
      ]);
      (mockGetTraceCount as any).mockResolvedValue(1);

      const result = await service.getTraces(APP_ID, { limit: 10, offset: 0 });

      expect(result.traces[0].status).toBe('UNSET');
    });

    it('should pass through unknown status codes as-is', async () => {
      (mockGetTraces as any).mockResolvedValue([
        { id: 't1', name: '', status: '99', start: 0, end: 0, latency: 0, cost: 0, tokens: 0, span_count: 0 },
      ]);
      (mockGetTraceCount as any).mockResolvedValue(1);

      const result = await service.getTraces(APP_ID, { limit: 10, offset: 0 });

      expect(result.traces[0].status).toBe('99');
    });
  });

  // -------------------------------------------------------------------------
  // getTraceDetail
  // -------------------------------------------------------------------------

  describe('getTraceDetail', () => {
    it('should return null when trace is not found', async () => {
      (mockGetTraceById as any).mockResolvedValue(null);

      const result = await service.getTraceDetail(APP_ID, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should map raw trace to TraceDetail format', async () => {
      (mockGetTraceById as any).mockResolvedValue({
        id: 'trace-1',
        name: 'root-span',
        data: {
          name: 'My Trace',
          status: '1',
          start: 1704067200000,
          end: 1704067201000,
          latency: 1000,
          cost: 0.05,
          tokens: 150,
        },
        spans: [
          {
            id: 'span-1',
            traceId: 'trace-1',
            parentId: null,
            name: 'root',
            duration: 1000,
            timestamp: 1704067200000,
            data: {
              status: '1',
              type: 'SPAN',
              duration: 1000,
            },
          },
        ],
      });

      const result = await service.getTraceDetail(APP_ID, 'trace-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('trace-1');
      expect(result!.name).toBe('My Trace');
      expect(result!.status).toBe('OK');
      expect(result!.spans).toHaveLength(1);
      expect(result!.spans[0].id).toBe('span-1');
    });
  });

  // -------------------------------------------------------------------------
  // getTraceDetailLightweight
  // -------------------------------------------------------------------------

  describe('getTraceDetailLightweight', () => {
    it('should delegate to getTraceDetail', async () => {
      (mockGetTraceById as any).mockResolvedValue(null);

      const result = await service.getTraceDetailLightweight(APP_ID, 'trace-1');

      expect(result).toBeNull();
      expect(mockGetTraceById).toHaveBeenCalledWith('trace-1');
    });
  });

  // -------------------------------------------------------------------------
  // getSpanIO
  // -------------------------------------------------------------------------

  describe('getSpanIO', () => {
    it('should return null when span is not found', async () => {
      const result = await service.getSpanIO(APP_ID, 'nonexistent', 'nonexistent');
      expect(result).toBeNull();
    });

    it('should return span IO data when span exists', async () => {
      insertTrace(testDb, {
        TraceId: 'trace-1',
        SpanId: 'span-1',
        Input: '{"messages": []}',
        Output: 'Hello world',
        OutputObject: '{"result": true}',
        ToolCalls: '[{"name": "read"}]',
      });

      const result = await service.getSpanIO(APP_ID, 'trace-1', 'span-1');

      expect(result).toEqual({
        input: '{"messages": []}',
        output: 'Hello world',
        outputObject: '{"result": true}',
        toolCalls: '[{"name": "read"}]',
      });
    });

    it('should return empty strings for null input/output', async () => {
      insertTrace(testDb, {
        TraceId: 'trace-1',
        SpanId: 'span-1',
        Input: null as any,
        Output: null as any,
      });

      const result = await service.getSpanIO(APP_ID, 'trace-1', 'span-1');

      expect(result).not.toBeNull();
      expect(result!.input).toBe('');
      expect(result!.output).toBe('');
      expect(result!.outputObject).toBeNull();
      expect(result!.toolCalls).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getDistinctMetadataKeys
  // -------------------------------------------------------------------------

  describe('getDistinctMetadataKeys', () => {
    it('should return empty array when no metadata exists', async () => {
      const result = await service.getDistinctMetadataKeys(APP_ID);
      expect(result).toEqual([]);
    });

    it('should return sorted unique keys from all metadata', async () => {
      insertTrace(testDb, { TraceId: 't1', SpanId: 's1', Metadata: '{"env": "prod", "version": "1.0"}' });
      insertTrace(testDb, { TraceId: 't2', SpanId: 's2', Metadata: '{"env": "staging", "team": "backend"}' });

      const result = await service.getDistinctMetadataKeys(APP_ID);

      expect(result).toEqual(['env', 'team', 'version']);
    });

    it('should skip rows with invalid JSON metadata', async () => {
      insertTrace(testDb, { TraceId: 't1', SpanId: 's1', Metadata: 'not-json' });
      insertTrace(testDb, { TraceId: 't2', SpanId: 's2', Metadata: '{"valid": "yes"}' });

      const result = await service.getDistinctMetadataKeys(APP_ID);

      expect(result).toEqual(['valid']);
    });

    it('should skip rows with empty metadata', async () => {
      insertTrace(testDb, { TraceId: 't1', SpanId: 's1', Metadata: '' });

      const result = await service.getDistinctMetadataKeys(APP_ID);

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getSessions
  // -------------------------------------------------------------------------

  describe('getSessions', () => {
    it('should return empty data with pagination when no sessions exist', async () => {
      const result = await service.getSessions(APP_ID, { limit: 10, offset: 0 });

      expect(result).toEqual({
        sessions: [],
        total: 0,
        limit: 10,
        offset: 0,
      });
    });

    it('should return sessions when traces have session IDs', async () => {
      insertTrace(testDb, {
        TraceId: 't1', SpanId: 's1', SessionId: 'sess-1', SessionName: 'Chat 1',
        TraceName: 'trace1', Timestamp: '1000000000000000', Duration: 500, Cost: 0.01, TotalTokens: 100,
      });
      insertTrace(testDb, {
        TraceId: 't2', SpanId: 's2', SessionId: 'sess-1',
        TraceName: 'trace2', Timestamp: '2000000000000000', Duration: 300, Cost: 0.02, TotalTokens: 200,
      });

      const result = await service.getSessions(APP_ID, { limit: 10, offset: 0 });

      expect(result.total).toBe(1);
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].id).toBe('sess-1');
      expect(result.sessions[0].name).toBe('Chat 1');
      expect(result.sessions[0].traceCount).toBe(2);
    });

    it('should not count traces with null or empty session IDs', async () => {
      insertTrace(testDb, { TraceId: 't1', SpanId: 's1', SessionId: '' });
      insertTrace(testDb, { TraceId: 't2', SpanId: 's2', SessionId: 'null' });

      const result = await service.getSessions(APP_ID, { limit: 10, offset: 0 });

      expect(result.total).toBe(0);
      expect(result.sessions).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getSessionTraces
  // -------------------------------------------------------------------------

  describe('getSessionTraces', () => {
    it('should delegate to queryTracesBySessionId and map results', async () => {
      (mockGetTracesBySessionId as any).mockResolvedValue([
        {
          id: 'trace-1',
          data: { name: 'Trace 1', status: '1', start: 0, end: 0, latency: 0, cost: 0, tokens: 0 },
          spans: [],
        },
      ]);

      const result = await service.getSessionTraces(APP_ID, 'sess-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('trace-1');
      expect(mockGetTracesBySessionId).toHaveBeenCalledWith('sess-1');
    });
  });

  // -------------------------------------------------------------------------
  // Scores
  // -------------------------------------------------------------------------

  describe('getScores', () => {
    it('should return empty scores with pagination when no scores exist', async () => {
      const result = await service.getScores(APP_ID, {});

      expect(result).toEqual({
        scores: [],
        total: 0,
        limit: 50,
        offset: 0,
      });
    });

    it('should return scores when they exist', async () => {
      insertScore(testDb, { id: 'sc-1', resource_id: 'trace-1', score: 0.9, name: 'accuracy', label: 'good', reason: 'correct' });

      const result = await service.getScores(APP_ID, {});

      expect(result.total).toBe(1);
      expect(result.scores).toHaveLength(1);
      expect(result.scores[0]).toEqual({
        id: 'sc-1',
        resourceId: 'trace-1',
        name: 'accuracy',
        score: 0.9,
        label: 'good',
        reason: 'correct',
        source: 'eval',
        createdAt: expect.any(String),
      });
    });

    it('should filter by resourceId', async () => {
      insertScore(testDb, { id: 'sc-1', resource_id: 'trace-1', name: 'a' });
      insertScore(testDb, { id: 'sc-2', resource_id: 'trace-2', name: 'b' });

      const result = await service.getScores(APP_ID, { resourceId: 'trace-1' });

      expect(result.total).toBe(1);
      expect(result.scores[0].resourceId).toBe('trace-1');
    });

    it('should filter by name', async () => {
      insertScore(testDb, { id: 'sc-1', resource_id: 'trace-1', name: 'accuracy' });
      insertScore(testDb, { id: 'sc-2', resource_id: 'trace-1', name: 'relevance' });

      const result = await service.getScores(APP_ID, { name: 'accuracy' });

      expect(result.total).toBe(1);
      expect(result.scores[0].name).toBe('accuracy');
    });

    it('should filter by source', async () => {
      insertScore(testDb, { id: 'sc-1', resource_id: 'trace-1', source: 'eval' });
      insertScore(testDb, { id: 'sc-2', resource_id: 'trace-1', source: 'annotation' });

      const result = await service.getScores(APP_ID, { source: 'annotation' });

      expect(result.total).toBe(1);
      expect(result.scores[0].source).toBe('annotation');
    });

    it('should use default limit of 50 and offset of 0', async () => {
      const result = await service.getScores(APP_ID, {});

      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should respect custom limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        insertScore(testDb, { id: `sc-${i}`, resource_id: 'trace-1', name: 'accuracy' });
      }

      const result = await service.getScores(APP_ID, { limit: 2, offset: 1 });

      expect(result.scores).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(1);
    });
  });

  describe('getScoresBySpanIds', () => {
    it('should return empty object when given empty array', async () => {
      const result = await service.getScoresBySpanIds(APP_ID, []);
      expect(result).toEqual({});
    });

    it('should return empty object when no scores match', async () => {
      const result = await service.getScoresBySpanIds(APP_ID, ['nonexistent']);
      expect(result).toEqual({});
    });

    it('should group scores by resource_id', async () => {
      insertScore(testDb, { id: 'sc-1', resource_id: 'span-a', name: 'accuracy', score: 0.8 });
      insertScore(testDb, { id: 'sc-2', resource_id: 'span-a', name: 'relevance', score: 0.9 });
      insertScore(testDb, { id: 'sc-3', resource_id: 'span-b', name: 'accuracy', score: 0.7 });

      const result = await service.getScoresBySpanIds(APP_ID, ['span-a', 'span-b']);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result['span-a']).toHaveLength(2);
      expect(result['span-b']).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // getDistinctScoreNames
  // -------------------------------------------------------------------------

  describe('getDistinctScoreNames', () => {
    it('should return empty names array when no scores exist', async () => {
      const result = await service.getDistinctScoreNames(APP_ID);
      expect(result).toEqual({ names: [] });
    });

    it('should return distinct sorted names', async () => {
      insertScore(testDb, { id: 'sc-1', name: 'relevance' });
      insertScore(testDb, { id: 'sc-2', name: 'accuracy' });
      insertScore(testDb, { id: 'sc-3', name: 'accuracy' });

      const result = await service.getDistinctScoreNames(APP_ID);

      expect(result.names).toEqual(['accuracy', 'relevance']);
    });
  });

  // -------------------------------------------------------------------------
  // detectScoreType
  // -------------------------------------------------------------------------

  describe('detectScoreType', () => {
    it('should return numeric when no scores exist for given name', async () => {
      const result = await service.detectScoreType(APP_ID, 'nonexistent');
      expect(result).toBe('numeric');
    });

    it('should return numeric when scores have no labels', async () => {
      insertScore(testDb, { id: 'sc-1', name: 'accuracy', score: 0.9, label: '' });
      insertScore(testDb, { id: 'sc-2', name: 'accuracy', score: 0.8, label: '' });

      const result = await service.detectScoreType(APP_ID, 'accuracy');
      expect(result).toBe('numeric');
    });

    it('should return boolean when all labels are true/false', async () => {
      insertScore(testDb, { id: 'sc-1', name: 'correct', score: 1, label: 'true' });
      insertScore(testDb, { id: 'sc-2', name: 'correct', score: 0, label: 'false' });
      insertScore(testDb, { id: 'sc-3', name: 'correct', score: 1, label: 'True' });

      const result = await service.detectScoreType(APP_ID, 'correct');
      expect(result).toBe('boolean');
    });

    it('should return categorical when labels are non-boolean strings', async () => {
      insertScore(testDb, { id: 'sc-1', name: 'quality', score: 1, label: 'good' });
      insertScore(testDb, { id: 'sc-2', name: 'quality', score: 0, label: 'bad' });

      const result = await service.detectScoreType(APP_ID, 'quality');
      expect(result).toBe('categorical');
    });

    it('should return categorical when labels include non-boolean values', async () => {
      insertScore(testDb, { id: 'sc-1', name: 'quality', score: 1, label: 'true' });
      insertScore(testDb, { id: 'sc-2', name: 'quality', score: 0, label: 'maybe' });

      const result = await service.detectScoreType(APP_ID, 'quality');
      expect(result).toBe('categorical');
    });
  });

  // -------------------------------------------------------------------------
  // getExperiments
  // -------------------------------------------------------------------------

  describe('getExperiments', () => {
    it('should return experiments with pagination envelope when no experiments exist', async () => {
      (mockGetExperiments as any).mockResolvedValue([]);

      const result = await service.getExperiments(APP_ID, { limit: 50, offset: 0 });

      expect(result).toEqual({
        experiments: [],
        total: 0,
        limit: 50,
        offset: 0,
        filterOptions: {
          promptNames: [],
          datasetPaths: [],
        },
      });
    });

    it('should return experiments in correct format', async () => {
      (mockGetExperiments as any).mockResolvedValue([
        {
          id: 'exp-1',
          name: 'Experiment 1',
          promptName: 'my-prompt',
          datasetPath: 'dataset.jsonl',
          itemCount: 10,
          avgLatencyMs: 500,
          totalCost: 1.5,
          avgScore: 0.85,
          createdAt: '2026-01-01',
          commitSha: 'abc123',
        },
      ]);

      const result = await service.getExperiments(APP_ID, { limit: 50, offset: 0 });

      expect(result.experiments).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.experiments[0].id).toBe('exp-1');
      expect(result.filterOptions!.promptNames).toEqual(['my-prompt']);
      expect(result.filterOptions!.datasetPaths).toEqual(['dataset.jsonl']);
    });

    it('should filter by promptName', async () => {
      (mockGetExperiments as any).mockResolvedValue([
        { id: 'exp-1', promptName: 'prompt-a', datasetPath: '', name: '', itemCount: 0, avgLatencyMs: 0, totalCost: 0, avgScore: null, createdAt: '', commitSha: '' },
        { id: 'exp-2', promptName: 'prompt-b', datasetPath: '', name: '', itemCount: 0, avgLatencyMs: 0, totalCost: 0, avgScore: null, createdAt: '', commitSha: '' },
      ]);

      const result = await service.getExperiments(APP_ID, { limit: 50, offset: 0, promptName: 'prompt-a' });

      expect(result.experiments).toHaveLength(1);
      expect(result.experiments[0].id).toBe('exp-1');
      expect(result.total).toBe(1);
    });

    it('should filter by datasetPath', async () => {
      (mockGetExperiments as any).mockResolvedValue([
        { id: 'exp-1', promptName: '', datasetPath: 'data-a.jsonl', name: '', itemCount: 0, avgLatencyMs: 0, totalCost: 0, avgScore: null, createdAt: '', commitSha: '' },
        { id: 'exp-2', promptName: '', datasetPath: 'data-b.jsonl', name: '', itemCount: 0, avgLatencyMs: 0, totalCost: 0, avgScore: null, createdAt: '', commitSha: '' },
      ]);

      const result = await service.getExperiments(APP_ID, { limit: 50, offset: 0, datasetPath: 'data-b.jsonl' });

      expect(result.experiments).toHaveLength(1);
      expect(result.experiments[0].id).toBe('exp-2');
    });

    it('should apply pagination after filtering', async () => {
      const experiments = Array.from({ length: 5 }, (_, i) => ({
        id: `exp-${i}`, promptName: 'p', datasetPath: '', name: '', itemCount: 0,
        avgLatencyMs: 0, totalCost: 0, avgScore: null, createdAt: '', commitSha: '',
      }));
      (mockGetExperiments as any).mockResolvedValue(experiments);

      const result = await service.getExperiments(APP_ID, { limit: 2, offset: 1, promptName: 'p' });

      expect(result.experiments).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.experiments[0].id).toBe('exp-1');
      expect(result.experiments[1].id).toBe('exp-2');
    });
  });

  // -------------------------------------------------------------------------
  // getPromptLogs
  // -------------------------------------------------------------------------

  describe('getPromptLogs', () => {
    it('should return empty logs when no generation spans exist', async () => {
      const result = await service.getPromptLogs(APP_ID, { limit: 10, offset: 0 });

      expect(result).toEqual({
        logs: [],
        total: 0,
        limit: 10,
        offset: 0,
      });
    });

    it('should return only GENERATION type spans', async () => {
      insertTrace(testDb, { TraceId: 't1', SpanId: 'gen-1', Type: 'GENERATION', Model: 'claude', Cost: 0.05, InputTokens: 100, OutputTokens: 50, Duration: 500 });
      insertTrace(testDb, { TraceId: 't1', SpanId: 'span-1', Type: 'SPAN', Model: '', Duration: 1000 });

      const result = await service.getPromptLogs(APP_ID, { limit: 50, offset: 0 });

      expect(result.total).toBe(1);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].id).toBe('gen-1');
      expect(result.logs[0].modelUsed).toBe('claude');
    });

    it('should filter by model', async () => {
      insertTrace(testDb, { TraceId: 't1', SpanId: 'gen-1', Type: 'GENERATION', Model: 'claude' });
      insertTrace(testDb, { TraceId: 't2', SpanId: 'gen-2', Type: 'GENERATION', Model: 'gpt-4' });

      const result = await service.getPromptLogs(APP_ID, { limit: 50, offset: 0, model: 'claude' });

      expect(result.total).toBe(1);
      expect(result.logs[0].modelUsed).toBe('claude');
    });

    it('should filter by status name', async () => {
      insertTrace(testDb, { TraceId: 't1', SpanId: 'gen-1', Type: 'GENERATION', StatusCode: '1' });
      insertTrace(testDb, { TraceId: 't2', SpanId: 'gen-2', Type: 'GENERATION', StatusCode: '2' });

      const result = await service.getPromptLogs(APP_ID, { limit: 50, offset: 0, status: 'ERROR' });

      expect(result.total).toBe(1);
      expect(result.logs[0].status).toBe('ERROR');
    });
  });

  // -------------------------------------------------------------------------
  // getDatasetRuns
  // -------------------------------------------------------------------------

  describe('getDatasetRuns', () => {
    it('should return empty runs when no dataset traces exist', async () => {
      const result = await service.getDatasetRuns(APP_ID, {});

      expect(result).toEqual({
        runs: [],
        total: 0,
        limit: 50,
        offset: 0,
      });
    });

    it('should return dataset runs with correct aggregation', async () => {
      insertTrace(testDb, {
        TraceId: 't1', SpanId: 's1', ParentSpanId: null,
        DatasetRunId: 'run-1', DatasetRunName: 'My Run', DatasetPath: 'data.jsonl',
        Duration: 500, CreatedAt: '2026-01-01 00:00:00',
      });
      insertTrace(testDb, {
        TraceId: 't2', SpanId: 's2', ParentSpanId: null,
        DatasetRunId: 'run-1', DatasetRunName: 'My Run', DatasetPath: 'data.jsonl',
        Duration: 700, CreatedAt: '2026-01-01 00:01:00',
      });

      const result = await service.getDatasetRuns(APP_ID, {});

      expect(result.total).toBe(1);
      expect(result.runs).toHaveLength(1);
      expect(result.runs[0].id).toBe('run-1');
      expect(result.runs[0].name).toBe('My Run');
      expect(result.runs[0].itemCount).toBe(2);
    });
  });
});
