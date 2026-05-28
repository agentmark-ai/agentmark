import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import db from '../cli-src/server/database';
import { getExperimentById, getExperiments, getBaselineScores } from '../cli-src/server/routes/experiments';
import { hashRowInput } from '@agentmark-ai/prompt-core';

// Helper to clean up the database between tests
function clearDatabase() {
  db.exec('DELETE FROM traces');
  db.exec('DELETE FROM scores');
}

// Helper to insert a span with experiment-relevant fields
function insertSpan(data: {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  spanName?: string;
  datasetRunId?: string;
  datasetRunName?: string;
  model?: string;
  totalTokens?: number;
  cost?: number;
  duration?: number;
  timestamp?: string;
  input?: string;
  output?: string;
  datasetItemName?: string;
  datasetExpectedOutput?: string;
  datasetInput?: string;
}) {
  const stmt = db.prepare(`
    INSERT INTO traces (
      TraceId, SpanId, ParentSpanId, SpanName, Type, Timestamp, Duration,
      DatasetRunId, DatasetRunName, Model, TotalTokens, Cost,
      Input, Output, DatasetItemName, DatasetExpectedOutput, DatasetInput
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.traceId,
    data.spanId,
    data.parentSpanId || null,
    data.spanName || 'test-span',
    'SPAN',
    data.timestamp || new Date().toISOString(),
    data.duration || 100,
    data.datasetRunId || '',
    data.datasetRunName || '',
    data.model || '',
    data.totalTokens || 0,
    data.cost || 0,
    data.input || null,
    data.output || null,
    data.datasetItemName || '',
    data.datasetExpectedOutput || '',
    data.datasetInput || '',
  );
}

describe('getExperimentById', () => {
  beforeEach(() => {
    clearDatabase();
  });

  afterEach(() => {
    clearDatabase();
  });

  it('should return null for non-existent experiment', async () => {
    const result = await getExperimentById('non-existent');
    expect(result).toBeNull();
  });

  it('should return totalTokens and model from child generation spans', async () => {
    // Root span (experiment wrapper) — no model/tokens
    insertSpan({
      traceId: 'trace-1',
      spanId: 'root-span-1',
      datasetRunId: 'test-run',
      datasetRunName: 'test-experiment',
      datasetItemName: 'item-1',
      model: '',
      totalTokens: 0,
    });

    // Child span (generation) — has model and tokens
    insertSpan({
      traceId: 'trace-1',
      spanId: 'child-span-1',
      parentSpanId: 'root-span-1',
      model: 'gpt-4o',
      totalTokens: 42,
      cost: 0.001,
    });

    const result = await getExperimentById('test-run');

    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);

    const item = result!.items[0];
    expect(item.totalTokens).toBe(42);
    expect(item.model).toBe('gpt-4o');
    expect(item.cost).toBe(0.001);
  });

  it('should fall back to root span tokens/model when no child spans exist', async () => {
    // Root span with model and tokens but no child generation spans
    insertSpan({
      traceId: 'trace-solo',
      spanId: 'root-span-solo',
      datasetRunId: 'test-run-no-children',
      datasetRunName: 'solo-experiment',
      datasetItemName: 'item-solo',
      model: 'claude-3',
      totalTokens: 10,
      cost: 0.005,
    });

    const result = await getExperimentById('test-run-no-children');

    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);

    const item = result!.items[0];
    expect(item.totalTokens).toBe(10);
    expect(item.model).toBe('claude-3');
  });

  it('should aggregate totalTokens across multiple child spans', async () => {
    // Root span
    insertSpan({
      traceId: 'trace-multi',
      spanId: 'root-multi',
      datasetRunId: 'test-run-multi',
      datasetRunName: 'multi-experiment',
      datasetItemName: 'item-multi',
    });

    // First child generation span
    insertSpan({
      traceId: 'trace-multi',
      spanId: 'child-1',
      parentSpanId: 'root-multi',
      model: 'gpt-4o',
      totalTokens: 30,
      cost: 0.001,
    });

    // Second child generation span
    insertSpan({
      traceId: 'trace-multi',
      spanId: 'child-2',
      parentSpanId: 'root-multi',
      model: 'gpt-4o',
      totalTokens: 20,
      cost: 0.002,
    });

    const result = await getExperimentById('test-run-multi');

    expect(result).not.toBeNull();
    const item = result!.items[0];
    // SUM of child tokens: 30 + 20 = 50
    expect(item.totalTokens).toBe(50);
    expect(item.model).toBe('gpt-4o');
    // SUM of child costs: 0.001 + 0.002 = 0.003
    expect(item.cost).toBeCloseTo(0.003);
  });

  it('should return correct fields in ExperimentItem interface', async () => {
    insertSpan({
      traceId: 'trace-fields',
      spanId: 'root-fields',
      datasetRunId: 'test-run-fields',
      datasetRunName: 'fields-experiment',
      datasetItemName: 'test-item',
      datasetExpectedOutput: 'expected answer',
      datasetInput: 'test input',
      duration: 250,
    });

    insertSpan({
      traceId: 'trace-fields',
      spanId: 'child-fields',
      parentSpanId: 'root-fields',
      model: 'gpt-4o-mini',
      totalTokens: 100,
      cost: 0.01,
      output: 'actual answer',
    });

    const result = await getExperimentById('test-run-fields');

    expect(result).not.toBeNull();
    const item = result!.items[0];

    expect(item.traceId).toBe('trace-fields');
    expect(item.itemName).toBe('test-item');
    expect(item.totalTokens).toBe(100);
    expect(item.model).toBe('gpt-4o-mini');
    expect(item.latencyMs).toBe(250);
    expect(item.cost).toBe(0.01);
    // Verify these properties exist on the interface
    expect(item).toHaveProperty('input');
    expect(item).toHaveProperty('expectedOutput');
    expect(item).toHaveProperty('actualOutput');
    expect(item).toHaveProperty('scores');
  });
});

describe('getBaselineScores', () => {
  // Insert a root experiment span carrying the experiment identity (ExperimentKey
  // + SourceTreeHash columns) and the dataset row input. Mirrors how a stored
  // experiment run looks after the identity re-scope.
  function insertBaselineRoot(data: {
    traceId: string;
    datasetRunId: string;
    experimentKey: string;
    sourceTreeHash: string;
    datasetInput: string;
    timestamp?: string;
  }) {
    db.prepare(`
      INSERT INTO traces (
        TraceId, SpanId, ParentSpanId, SpanName, Type, Timestamp, CreatedAt, Duration,
        DatasetRunId, ExperimentKey, SourceTreeHash, DatasetInput
      ) VALUES (?, ?, NULL, 'root', 'SPAN', ?, ?, 100, ?, ?, ?, ?)
    `).run(
      data.traceId,
      `${data.traceId}-root`,
      data.timestamp || new Date().toISOString(),
      data.timestamp || new Date().toISOString(),
      data.datasetRunId,
      data.experimentKey,
      data.sourceTreeHash,
      data.datasetInput,
    );
  }

  function insertScore(resourceId: string, name: string, score: number) {
    db.prepare(`
      INSERT INTO scores (id, resource_id, score, label, reason, name, type, source, created_at)
      VALUES (?, ?, ?, '', '', ?, 'experiment', 'eval', ?)
    `).run(`${resourceId}-${name}`, resourceId, score, name, new Date().toISOString());
  }

  const KEY = './prompts/qa.prompt.mdx';

  beforeEach(() => clearDatabase());
  afterEach(() => clearDatabase());

  it('returns per-(row × scorer) scores keyed by the same hash as the live runner, with an exact match', async () => {
    const inputA = { q: 'alpha' };
    const inputB = { q: 'beta' };
    insertBaselineRoot({ traceId: 'b-1', datasetRunId: 'run-1', experimentKey: KEY, sourceTreeHash: 'tree-abc', datasetInput: JSON.stringify(inputA) });
    insertBaselineRoot({ traceId: 'b-2', datasetRunId: 'run-1', experimentKey: KEY, sourceTreeHash: 'tree-abc', datasetInput: JSON.stringify(inputB) });
    insertScore('b-1', 'groundedness', 0.91);
    insertScore('b-2', 'groundedness', 0.80);

    const { resolved, rows } = await getBaselineScores(KEY, 'tree-abc');

    expect(resolved).toEqual({ runId: 'run-1', treeHash: 'tree-abc', matchedExactCommit: true });
    expect(rows).toEqual(
      expect.arrayContaining([
        { inputHash: hashRowInput(inputA), scorer: 'groundedness', score: 0.91 },
        { inputHash: hashRowInput(inputB), scorer: 'groundedness', score: 0.80 },
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it('prefers an exact tree-hash match over a more recent run at a different tree hash', async () => {
    const input = { q: 'alpha' };
    // Newer run is at a DIFFERENT tree hash; older run is the exact match.
    insertBaselineRoot({ traceId: 'exact-1', datasetRunId: 'run-exact', experimentKey: KEY, sourceTreeHash: 'tree-abc', datasetInput: JSON.stringify(input), timestamp: '2026-01-01T00:00:00.000Z' });
    insertScore('exact-1', 'groundedness', 0.50);
    insertBaselineRoot({ traceId: 'recent-1', datasetRunId: 'run-recent', experimentKey: KEY, sourceTreeHash: 'tree-other', datasetInput: JSON.stringify(input), timestamp: '2026-05-01T00:00:00.000Z' });
    insertScore('recent-1', 'groundedness', 0.95);

    const { resolved, rows } = await getBaselineScores(KEY, 'tree-abc');

    // Exact wins even though it's older.
    expect(resolved).toEqual({ runId: 'run-exact', treeHash: 'tree-abc', matchedExactCommit: true });
    expect(rows).toEqual([{ inputHash: hashRowInput(input), scorer: 'groundedness', score: 0.50 }]);
  });

  it('falls back to the most recent run of the same experiment_key when no exact tree-hash match exists', async () => {
    const input = { q: 'alpha' };
    insertBaselineRoot({ traceId: 'old-1', datasetRunId: 'run-old', experimentKey: KEY, sourceTreeHash: 'tree-1', datasetInput: JSON.stringify(input), timestamp: '2026-01-01T00:00:00.000Z' });
    insertScore('old-1', 'groundedness', 0.50);
    insertBaselineRoot({ traceId: 'new-1', datasetRunId: 'run-new', experimentKey: KEY, sourceTreeHash: 'tree-2', datasetInput: JSON.stringify(input), timestamp: '2026-05-01T00:00:00.000Z' });
    insertScore('new-1', 'groundedness', 0.95);

    const { resolved, rows } = await getBaselineScores(KEY, 'tree-NONE');

    // No exact match → most recent run, flagged as a non-exact (fallback) match.
    expect(resolved).toEqual({ runId: 'run-new', treeHash: 'tree-2', matchedExactCommit: false });
    expect(rows).toEqual([{ inputHash: hashRowInput(input), scorer: 'groundedness', score: 0.95 }]);
  });

  it('does not cross-wire to a different experiment_key sharing the dataset (resolved:null)', async () => {
    // A different eval ran at the same tree hash against the same input — must NOT match.
    insertBaselineRoot({ traceId: 'other-1', datasetRunId: 'run-other', experimentKey: './prompts/OTHER.prompt.mdx', sourceTreeHash: 'tree-abc', datasetInput: JSON.stringify({ q: 'x' }) });
    insertScore('other-1', 'groundedness', 0.91);

    const { resolved, rows } = await getBaselineScores(KEY, 'tree-abc');
    expect(resolved).toBeNull();
    expect(rows).toEqual([]);
  });
});

// Root spans can arrive with `ParentSpanId = ''` (OTEL exporters write empty
// strings rather than NULL for missing parent IDs). All three root-span
// queries — getExperiments, getExperimentById, getBaselineScores — must treat
// empty string as a root. A regression here causes silent data discrepancies:
// the baseline gate finds rows the list/detail queries miss.
describe('root-span queries — empty-string ParentSpanId', () => {
  beforeEach(() => clearDatabase());
  afterEach(() => clearDatabase());

  function insertRootWithEmptyParent(data: {
    traceId: string;
    spanId: string;
    datasetRunId: string;
    datasetRunName?: string;
    experimentKey?: string;
    sourceTreeHash?: string;
    datasetInput?: string;
  }) {
    db.prepare(`
      INSERT INTO traces (
        TraceId, SpanId, ParentSpanId, SpanName, Type, Timestamp, CreatedAt, Duration,
        DatasetRunId, DatasetRunName, ExperimentKey, SourceTreeHash, DatasetInput
      ) VALUES (?, ?, '', 'root', 'SPAN', ?, ?, 100, ?, ?, ?, ?, ?)
    `).run(
      data.traceId,
      data.spanId,
      new Date().toISOString(),
      new Date().toISOString(),
      data.datasetRunId,
      data.datasetRunName ?? '',
      data.experimentKey ?? '',
      data.sourceTreeHash ?? '',
      data.datasetInput ?? '',
    );
  }

  it('getExperiments returns runs whose root span has ParentSpanId=""', async () => {
    insertRootWithEmptyParent({
      traceId: 'er-1', spanId: 'er-root-1', datasetRunId: 'run-empty-parent', datasetRunName: 'empty-parent-exp',
    });
    const runs = await getExperiments();
    expect(runs.map((r) => r.id)).toContain('run-empty-parent');
  });

  it('getExperimentById finds the run whose root span has ParentSpanId=""', async () => {
    insertRootWithEmptyParent({
      traceId: 'eb-1', spanId: 'eb-root-1', datasetRunId: 'run-by-id-empty', datasetRunName: 'detail-empty-parent',
    });
    const result = await getExperimentById('run-by-id-empty');
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0]!.traceId).toBe('eb-1');
  });

  it('getBaselineScores resolves a run whose root span has ParentSpanId=""', async () => {
    const input = { q: 'empty-parent' };
    insertRootWithEmptyParent({
      traceId: 'bs-1', spanId: 'bs-root-1', datasetRunId: 'run-baseline-empty',
      experimentKey: './prompts/qa.prompt.mdx', sourceTreeHash: 'tree-zzz',
      datasetInput: JSON.stringify(input),
    });
    db.prepare(`
      INSERT INTO scores (id, resource_id, score, label, reason, name, type, source, created_at)
      VALUES ('bs-1-sc', 'bs-1', 0.77, '', '', 'groundedness', 'experiment', 'eval', ?)
    `).run(new Date().toISOString());

    const { resolved, rows } = await getBaselineScores('./prompts/qa.prompt.mdx', 'tree-zzz');
    expect(resolved).toEqual({ runId: 'run-baseline-empty', treeHash: 'tree-zzz', matchedExactCommit: true });
    expect(rows).toEqual([{ inputHash: hashRowInput(input), scorer: 'groundedness', score: 0.77 }]);
  });
});
