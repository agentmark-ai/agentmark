import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import db from '../cli-src/server/database';
import { getExperimentById } from '../cli-src/server/routes/experiments';

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
