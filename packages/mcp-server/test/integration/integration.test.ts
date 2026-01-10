/**
 * Integration Tests for MCP Server ↔ CLI Server
 *
 * These tests verify ACTUAL behavior across the integration boundary.
 * Per the constitution (IV. Testability - Test Value Requirements):
 * - Tests MUST use real implementations, not mocks
 * - Tests MUST verify outcomes, not implementation
 * - Tests MUST catch real bugs
 *
 * REQUIREMENTS:
 * - CLI server must be running on TEST_PORT (default: 9419)
 * - Test data must be seeded (run node ../../scripts/seed-test-data.js)
 *
 * Local development:
 *   Terminal 1: cd packages/cli && AGENTMARK_PORT=9419 npm run dev
 *   Terminal 2: node scripts/seed-test-data.js 9419  (from repo root)
 *   Terminal 3: npm run test:integration
 *
 * CI runs these automatically after starting the CLI server and seeding data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { HttpDataSource } from '../../src/data-source/http-data-source.js';

const TEST_PORT = Number(process.env.INTEGRATION_TEST_PORT) || 9419;
const TEST_URL = `http://localhost:${TEST_PORT}`;

// Expected values from seed-test-data.js
// Note: CLI uses span name for trace name, not agentmark.trace.name attribute
const SEED_TRACE_ID = 'd4cda95b652f4a1592b449d5929fda1b';
const SEED_TRACE_NAME = 'integration-test-trace'; // Root span name becomes trace name
const SEED_ROOT_SPAN_ID = '6e0c63257de34c92';
const SEED_GENERATION_SPAN_ID = '7e0c63257de34c93';

let dataSource: HttpDataSource;

describe('MCP Server Integration Tests', () => {
  beforeAll(async () => {
    dataSource = new HttpDataSource(TEST_URL, 5000);

    // Verify server is running - provides clear error message with fix instructions
    try {
      const response = await fetch(`${TEST_URL}/v1/traces`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `CLI server not responding on ${TEST_URL}: ${message}\n` +
        `Start it with: cd packages/cli && AGENTMARK_PORT=${TEST_PORT} npm run dev`
      );
    }
  });

  describe('listTraces - Real HTTP Integration', () => {
    it('should fetch seeded trace with correct values', async () => {
      const result = await dataSource.listTraces({ limit: 10 });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.hasMore).toBe(false); // Only one trace seeded

      // Find our seeded trace
      const seededTrace = result.items.find(t => t.id === SEED_TRACE_ID);
      expect(seededTrace).toBeDefined();
      expect(seededTrace!.name).toBe(SEED_TRACE_NAME);
      expect(seededTrace!.status).toBe('1'); // OK status
      expect(seededTrace!.latency).toBe(1000); // 1 second (end - start)
      // Note: tokens are 0 because CLI doesn't parse gen_ai.usage attributes
      expect(seededTrace!.tokens).toBe(0);
    });

    it('should handle pagination with cursor round-trip', async () => {
      // With only 1 seeded trace, limit=1 should return it with no more pages
      const page1 = await dataSource.listTraces({ limit: 1 });

      expect(page1.items.length).toBe(1);
      expect(page1.items[0].id).toBe(SEED_TRACE_ID);
      expect(page1.hasMore).toBe(false);
    });
  });

  describe('getTrace - Real HTTP Integration', () => {
    it('should return seeded trace with correct spans', async () => {
      const result = await dataSource.getTrace(SEED_TRACE_ID);

      expect(result).not.toBeNull();
      expect(result!.trace.id).toBe(SEED_TRACE_ID);
      expect(result!.trace.name).toBe(SEED_TRACE_NAME);

      // Should have 2 spans: root + generation
      expect(result!.spans.items.length).toBe(2);
      expect(result!.spans.hasMore).toBe(false);

      // Verify span IDs
      const spanIds = result!.spans.items.map(s => s.id);
      expect(spanIds).toContain(SEED_ROOT_SPAN_ID);
      expect(spanIds).toContain(SEED_GENERATION_SPAN_ID);
    });

    it('should return null for non-existent trace', async () => {
      const result = await dataSource.getTrace('definitely-not-a-real-trace-id-xyz-123');
      expect(result).toBeNull();
    });

    it('should filter spans by type', async () => {
      // Note: CLI stores all spans as type=SPAN, not GENERATION
      // The agentmark.span.type attribute is stored in attributes JSON but not parsed
      const result = await dataSource.getTrace(SEED_TRACE_ID, {
        filters: [{ field: 'data.type', operator: 'eq', value: 'SPAN' }],
      });

      expect(result).not.toBeNull();
      expect(result!.spans.items.length).toBe(2); // Both spans have type=SPAN
      const spanIds = result!.spans.items.map(s => s.id);
      expect(spanIds).toContain(SEED_ROOT_SPAN_ID);
      expect(spanIds).toContain(SEED_GENERATION_SPAN_ID);
    });
  });

  describe('Error Handling', () => {
    it('should throw when connecting to unreachable server', async () => {
      const badDataSource = new HttpDataSource('http://localhost:99999', 1000);
      await expect(badDataSource.listTraces()).rejects.toThrow();
    });

    it('should throw on unsupported filter', async () => {
      await expect(
        dataSource.getTrace(SEED_TRACE_ID, {
          filters: [{ field: 'invalid.field', operator: 'eq', value: 'test' }],
        })
      ).rejects.toThrow(/unsupported/i);
    });
  });

  describe('Data Format Compatibility', () => {
    it('should correctly parse trace response format', async () => {
      const result = await dataSource.listTraces({ limit: 1 });
      const trace = result.items[0];

      // Verify all expected fields exist with correct types
      expect(trace.id).toBe(SEED_TRACE_ID);
      expect(trace.name).toBe(SEED_TRACE_NAME);
      expect(trace.status).toBe('1');
      expect(trace.latency).toBe(1000);
      expect(typeof trace.cost).toBe('number');
      expect(trace.tokens).toBe(0); // CLI doesn't parse gen_ai.usage attributes
      expect(typeof trace.start).toBe('number');
      expect(typeof trace.end).toBe('number');
    });

    it('should correctly parse span response format', async () => {
      const result = await dataSource.getTrace(SEED_TRACE_ID);
      const generationSpan = result!.spans.items.find(s => s.id === SEED_GENERATION_SPAN_ID);

      expect(generationSpan).toBeDefined();
      expect(generationSpan!.traceId).toBe(SEED_TRACE_ID);
      expect(generationSpan!.name).toBe('generation-span');
      expect(generationSpan!.duration).toBe(800); // 900ms - 100ms
      expect(typeof generationSpan!.timestamp).toBe('number');
      expect(generationSpan!.data).toBeDefined();
      // Note: type is SPAN because CLI doesn't parse agentmark.span.type attribute
      expect(generationSpan!.data?.type).toBe('SPAN');
    });
  });
});
