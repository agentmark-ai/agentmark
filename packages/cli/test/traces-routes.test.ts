import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import db from '../cli-src/server/database';
import {
  getTraces,
  getSpans,
  getTraceById,
  searchSpans,
  type TraceFilterOptions,
  type SpanFilterOptions,
} from '../cli-src/server/routes/traces';

// Helper to clean up the database between tests
function clearDatabase() {
  db.exec('DELETE FROM traces');
}

// Helper to insert test spans directly into the database
function insertTestSpan(data: {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  spanName: string;
  type?: string;
  statusCode?: string;
  statusMessage?: string;
  duration?: number;
  timestamp?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  sessionId?: string;
  traceName?: string;
  datasetRunId?: string;
  metadata?: Record<string, string>;
}) {
  const timestampNs = data.timestamp || String(Date.now() * 1000000);

  const stmt = db.prepare(`
    INSERT INTO traces (
      TraceId, SpanId, ParentSpanId, SpanName, Type, StatusCode, StatusMessage,
      Duration, Timestamp, Model, InputTokens, OutputTokens, Cost,
      SessionId, TraceName, DatasetRunId, Metadata, SpanAttributes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.traceId,
    data.spanId,
    data.parentSpanId || null,
    data.spanName,
    data.type || 'SPAN',
    data.statusCode || '0',
    data.statusMessage || null,
    data.duration || 100,
    timestampNs,
    data.model || '',
    data.inputTokens || 0,
    data.outputTokens || 0,
    data.cost || 0,
    data.sessionId || '',
    data.traceName || '',
    data.datasetRunId || '',
    data.metadata ? JSON.stringify(data.metadata) : null,
    '{}'
  );
}

describe('Traces Routes', () => {
  beforeEach(() => {
    clearDatabase();
  });

  afterEach(() => {
    clearDatabase();
  });

  describe('getTraces', () => {
    it('should return empty array when no traces exist', async () => {
      const result = await getTraces();
      expect(result).toEqual([]);
    });

    it('should return traces with aggregated data', async () => {
      // Create a trace with two spans
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Root Span',
        type: 'SPAN',
        duration: 200,
        traceName: 'Test Trace',
      });
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-2',
        parentSpanId: 'span-1',
        spanName: 'Child Span',
        type: 'GENERATION',
        duration: 100,
        inputTokens: 50,
        outputTokens: 100,
        cost: 0.001,
      });

      const result = await getTraces();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('trace-1');
      expect(result[0].tokens).toBe(150); // 50 + 100
      expect(result[0].cost).toBe(0.001);
    });

    it('should filter by status', async () => {
      insertTestSpan({
        traceId: 'trace-ok',
        spanId: 'span-1',
        spanName: 'OK Trace',
        statusCode: '0',
      });
      insertTestSpan({
        traceId: 'trace-error',
        spanId: 'span-2',
        spanName: 'Error Trace',
        statusCode: '2',
      });

      const result = await getTraces({ status: '2' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('trace-error');
    });

    it('should filter by name (LIKE pattern)', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'User Authentication',
        traceName: 'User Authentication',
      });
      insertTestSpan({
        traceId: 'trace-2',
        spanId: 'span-2',
        spanName: 'Payment Processing',
        traceName: 'Payment Processing',
      });

      const result = await getTraces({ name: 'Auth' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('trace-1');
    });

    it('should filter by latency_gt', async () => {
      insertTestSpan({
        traceId: 'trace-fast',
        spanId: 'span-1',
        spanName: 'Fast',
        duration: 50,
      });
      insertTestSpan({
        traceId: 'trace-slow',
        spanId: 'span-2',
        spanName: 'Slow',
        duration: 500,
      });

      const result = await getTraces({ latency_gt: 100 });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('trace-slow');
    });

    it('should filter by latency_lt', async () => {
      insertTestSpan({
        traceId: 'trace-fast',
        spanId: 'span-1',
        spanName: 'Fast',
        duration: 50,
      });
      insertTestSpan({
        traceId: 'trace-slow',
        spanId: 'span-2',
        spanName: 'Slow',
        duration: 500,
      });

      const result = await getTraces({ latency_lt: 100 });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('trace-fast');
    });

    it('should apply limit correctly', async () => {
      for (let i = 0; i < 10; i++) {
        insertTestSpan({
          traceId: `trace-${i}`,
          spanId: `span-${i}`,
          spanName: `Trace ${i}`,
        });
      }

      const result = await getTraces({ limit: 5 });

      expect(result).toHaveLength(5);
    });

    it('should apply offset correctly', async () => {
      for (let i = 0; i < 10; i++) {
        insertTestSpan({
          traceId: `trace-${i}`,
          spanId: `span-${i}`,
          spanName: `Trace ${i}`,
          timestamp: String((1000 + i) * 1000000), // Increasing timestamps
        });
      }

      const result = await getTraces({ limit: 3, offset: 5 });

      expect(result).toHaveLength(3);
    });

    it('should ignore invalid limit (NaN)', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Test',
      });

      // NaN should be ignored (treated as no limit)
      const result = await getTraces({ limit: NaN });

      expect(result).toHaveLength(1);
    });

    it('should ignore negative limit', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Test',
      });

      // Negative limit should be ignored
      const result = await getTraces({ limit: -1 });

      expect(result).toHaveLength(1);
    });

    it('should ignore Infinity limit', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Test',
      });

      // Infinity should be ignored
      const result = await getTraces({ limit: Infinity });

      expect(result).toHaveLength(1);
    });
  });

  describe('getSpans', () => {
    it('should return empty array for non-existent trace', async () => {
      const result = await getSpans('non-existent');
      expect(result).toEqual([]);
    });

    it('should return all spans for a trace', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Root',
      });
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-2',
        parentSpanId: 'span-1',
        spanName: 'Child',
      });
      insertTestSpan({
        traceId: 'trace-2',
        spanId: 'span-3',
        spanName: 'Different Trace',
      });

      const result = await getSpans('trace-1');

      expect(result).toHaveLength(2);
      expect(result.map(s => s.id).sort()).toEqual(['span-1', 'span-2']);
    });

    it('should normalize status codes (2.0 -> 2)', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Error Span',
        statusCode: '2.0',
      });

      const result = await getSpans('trace-1');

      expect(result[0].status).toBe('2');
    });

    it('should parse span attributes as JSON', async () => {
      const stmt = db.prepare(`
        INSERT INTO traces (TraceId, SpanId, SpanName, Type, StatusCode, Duration, Timestamp, SpanAttributes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        'trace-1',
        'span-1',
        'Test',
        'SPAN',
        '0',
        100,
        String(Date.now() * 1000000),
        JSON.stringify({ 'custom.key': 'value' })
      );

      const result = await getSpans('trace-1');

      expect(result[0].data.attributes).toBe(JSON.stringify({ 'custom.key': 'value' }));
    });

    it('should convert timestamp from nanoseconds to milliseconds', async () => {
      const nowMs = Date.now();
      const nowNs = nowMs * 1000000;

      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Test',
        timestamp: String(nowNs),
      });

      const result = await getSpans('trace-1');

      // Should be approximately equal (allowing for rounding)
      expect(Math.abs(result[0].timestamp - nowMs)).toBeLessThan(1000);
    });
  });

  describe('getTraceById', () => {
    it('should return null for non-existent trace', async () => {
      const result = await getTraceById('non-existent');
      expect(result).toBeNull();
    });

    it('should return trace with spans', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Root',
        traceName: 'My Trace',
        type: 'GENERATION',
        inputTokens: 100,
        outputTokens: 200,
        cost: 0.01,
      });

      const result = await getTraceById('trace-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('trace-1');
      expect(result?.name).toBe('My Trace');
      expect(result?.spans).toHaveLength(1);
      expect(result?.data.tokens).toBe(300);
      expect(result?.data.cost).toBe(0.01);
    });
  });

  describe('searchSpans', () => {
    beforeEach(() => {
      // Set up test data for searchSpans tests
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Generation Span',
        type: 'GENERATION',
        model: 'gpt-4',
        statusCode: '0',
        duration: 100,
      });
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-2',
        spanName: 'Error Span',
        type: 'SPAN',
        statusCode: '2',
        duration: 50,
      });
      insertTestSpan({
        traceId: 'trace-2',
        spanId: 'span-3',
        spanName: 'Claude Generation',
        type: 'GENERATION',
        model: 'claude-3-opus',
        statusCode: '0',
        duration: 200,
      });
    });

    it('should return all spans when no filters applied', async () => {
      const result = await searchSpans();
      expect(result).toHaveLength(3);
    });

    it('should filter by traceId', async () => {
      const result = await searchSpans({ traceId: 'trace-1' });

      expect(result).toHaveLength(2);
      expect(result.every(s => s.traceId === 'trace-1')).toBe(true);
    });

    it('should filter by type', async () => {
      const result = await searchSpans({ type: 'GENERATION' });

      expect(result).toHaveLength(2);
      expect(result.every(s => s.data.type === 'GENERATION')).toBe(true);
    });

    it('should filter by status', async () => {
      const result = await searchSpans({ status: '2' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('span-2');
    });

    it('should filter by status matching both formats (2 and 2.0)', async () => {
      // Add a span with status 2.0 format
      insertTestSpan({
        traceId: 'trace-3',
        spanId: 'span-4',
        spanName: 'Another Error',
        statusCode: '2.0',
        duration: 75,
      });

      const result = await searchSpans({ status: '2' });

      expect(result).toHaveLength(2);
    });

    it('should filter by name (LIKE pattern)', async () => {
      const result = await searchSpans({ name: 'Generation' });

      expect(result).toHaveLength(2);
    });

    it('should filter by model (LIKE pattern)', async () => {
      const result = await searchSpans({ model: 'claude' });

      expect(result).toHaveLength(1);
      expect(result[0].data.model).toBe('claude-3-opus');
    });

    it('should filter by minDuration', async () => {
      const result = await searchSpans({ minDuration: 100 });

      expect(result).toHaveLength(2);
      expect(result.every(s => s.duration >= 100)).toBe(true);
    });

    it('should filter by maxDuration', async () => {
      const result = await searchSpans({ maxDuration: 100 });

      expect(result).toHaveLength(2);
      expect(result.every(s => s.duration <= 100)).toBe(true);
    });

    it('should combine multiple filters', async () => {
      const result = await searchSpans({
        type: 'GENERATION',
        minDuration: 150,
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('span-3');
    });

    it('should apply limit correctly', async () => {
      const result = await searchSpans({ limit: 2 });
      expect(result).toHaveLength(2);
    });

    it('should apply offset correctly', async () => {
      const allSpans = await searchSpans();
      const withOffset = await searchSpans({ limit: 2, offset: 1 });

      expect(withOffset).toHaveLength(2);
      expect(withOffset[0].id).toBe(allSpans[1].id);
    });

    it('should ignore NaN limit', async () => {
      const result = await searchSpans({ limit: NaN });
      expect(result).toHaveLength(3);
    });

    it('should ignore negative limit', async () => {
      const result = await searchSpans({ limit: -5 });
      expect(result).toHaveLength(3);
    });

    it('should ignore Infinity limit', async () => {
      const result = await searchSpans({ limit: Infinity });
      expect(result).toHaveLength(3);
    });

    it('should ignore NaN offset', async () => {
      const result = await searchSpans({ limit: 2, offset: NaN });
      expect(result).toHaveLength(2);
    });

    it('should ignore negative offset', async () => {
      const result = await searchSpans({ limit: 2, offset: -1 });
      expect(result).toHaveLength(2);
    });

    it('should accept typed SpanFilterOptions parameter', async () => {
      // Verify type safety with explicit SpanFilterOptions
      const options: SpanFilterOptions = {
        traceId: 'trace-1',
        type: 'GENERATION',
        status: '0',
        name: 'Generation',
        model: 'gpt',
        minDuration: 50,
        maxDuration: 150,
        limit: 10,
        offset: 0,
      };

      const result = await searchSpans(options);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('span-1');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should safely handle malicious name input', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Normal Span',
      });

      // This should not cause any SQL error or return unexpected results
      const result = await getTraces({ name: "'; DROP TABLE traces; --" });

      // Should return empty (no match) not crash
      expect(result).toEqual([]);

      // Verify table still exists
      const check = await getTraces();
      expect(check).toHaveLength(1);
    });

    it('should safely handle malicious status input', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Test',
        statusCode: '0',
      });

      // This should not cause any SQL error
      const result = await getTraces({ status: "0'; DROP TABLE traces; --" });

      expect(result).toEqual([]);

      // Verify table still exists
      const check = await getTraces();
      expect(check).toHaveLength(1);
    });

    it('should safely handle malicious model input in searchSpans', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Test',
        model: 'gpt-4',
      });

      const result = await searchSpans({ model: "'; DELETE FROM traces; --" });

      expect(result).toEqual([]);

      // Verify data still exists
      const check = await searchSpans();
      expect(check).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string filters', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Test',
      });

      // Empty string name filter should match everything via LIKE '%%'
      const result = await getTraces({ name: '' });
      expect(result).toHaveLength(1);
    });

    it('should handle very large limit values', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Test',
      });

      // Large but finite limit should work
      const result = await getTraces({ limit: 1000000 });
      expect(result).toHaveLength(1);
    });

    it('should handle zero limit', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Test',
      });

      // Zero limit should be ignored (not finite positive)
      const result = await getTraces({ limit: 0 });
      expect(result).toHaveLength(1);
    });

    it('should handle special characters in trace IDs', async () => {
      insertTestSpan({
        traceId: 'trace/with/slashes',
        spanId: 'span-1',
        spanName: 'Test',
      });

      const result = await getSpans('trace/with/slashes');
      expect(result).toHaveLength(1);
    });

    it('should handle unicode in span names', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: '日本語テスト 🚀',
      });

      const result = await searchSpans({ name: '日本語' });
      expect(result).toHaveLength(1);
    });

    it('should handle metadata JSON parsing', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Test',
        metadata: { 'custom.key': 'value', 'nested.key': 'nested-value' },
      });

      const result = await getSpans('trace-1');
      expect(result[0].data.metadata).toEqual({ 'custom.key': 'value', 'nested.key': 'nested-value' });
    });

    it('should handle null/undefined filter values gracefully', async () => {
      insertTestSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        spanName: 'Test',
      });

      // TypeScript should prevent this, but runtime should handle it
      const options: TraceFilterOptions = {
        status: undefined,
        name: undefined,
        latency_gt: undefined,
        latency_lt: undefined,
        limit: undefined,
        offset: undefined,
      };

      const result = await getTraces(options);
      expect(result).toHaveLength(1);
    });
  });
});
