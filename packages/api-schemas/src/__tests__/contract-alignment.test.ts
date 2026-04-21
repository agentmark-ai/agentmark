/**
 * Contract Alignment Tests
 *
 * Verifies that shared constants in constants.ts match the inline values
 * used by api-contract Zod schemas. Catches drift between constants and
 * schema definitions.
 */

import { describe, it, expect } from 'vitest';
import {
  // Constants
  TRACE_STATUS_VALUES,
  SORT_ORDERS,
  SCORE_RESOURCE_TYPES,
  SCORE_SOURCE_TYPES,
  PAGINATION,
  ALLOWED_TRACE_SORT_FIELDS,
  ALLOWED_SESSION_SORT_FIELDS,
  FILTER_CONSTANTS,
  MAX_DATE_RANGE_DAYS,
  DATE_RANGE_PRESETS,
  PERCENTILE_METRICS,
  SCORE_TREND_INTERVALS,
  // Schemas
  TracesListParamsSchema,
  ScoresListParamsSchema,
  CreateScoreBodySchema,
  PaginationParamsSchema,
  DatasetsListResponseSchema,
  AppendDatasetRowResponseSchema,
  TraceGraphResponseSchema,
  GraphNodeSchema,
  ScoreNamesResponseSchema,
  ScoreDetailResponseSchema,
} from '../index';

describe('constants ↔ schema alignment', () => {
  describe('TRACE_STATUS_VALUES', () => {
    it('should match TracesListParamsSchema status enum', () => {
      // Parse each constant value — should succeed
      for (const status of TRACE_STATUS_VALUES) {
        expect(() => TracesListParamsSchema.parse({ status })).not.toThrow();
      }
      // A value NOT in the constants should fail
      expect(() => TracesListParamsSchema.parse({ status: 'UNKNOWN' })).toThrow();
    });
  });

  describe('SORT_ORDERS', () => {
    it('should contain exactly asc and desc', () => {
      expect(SORT_ORDERS).toEqual(['asc', 'desc']);
    });
  });

  describe('SCORE_RESOURCE_TYPES', () => {
    it('should match ScoresListParamsSchema resource_type enum', () => {
      for (const rt of SCORE_RESOURCE_TYPES) {
        expect(() => ScoresListParamsSchema.parse({ resource_type: rt })).not.toThrow();
      }
      expect(() => ScoresListParamsSchema.parse({ resource_type: 'unknown' })).toThrow();
    });
  });

  describe('SCORE_SOURCE_TYPES', () => {
    it('should match CreateScoreBodySchema source enum', () => {
      for (const src of SCORE_SOURCE_TYPES) {
        const body = { resource_id: 'r1', name: 'n1', score: 1, source: src };
        expect(() => CreateScoreBodySchema.parse(body)).not.toThrow();
      }
    });

    it('should reject unknown source', () => {
      const body = { resource_id: 'r1', name: 'n1', score: 1, source: 'unknown' };
      expect(() => CreateScoreBodySchema.parse(body)).toThrow();
    });
  });

  describe('PAGINATION', () => {
    it('maxLimit should match PaginationParamsSchema upper bound', () => {
      // At the boundary — should pass
      expect(() => PaginationParamsSchema.parse({ limit: PAGINATION.maxLimit })).not.toThrow();
      // Over the boundary — should fail
      expect(() => PaginationParamsSchema.parse({ limit: PAGINATION.maxLimit + 1 })).toThrow();
    });

    it('defaultLimit should be the default when limit is omitted', () => {
      const result = PaginationParamsSchema.parse({});
      expect(result.limit).toBe(PAGINATION.defaultLimit);
    });
  });

  describe('constant completeness', () => {
    it('DATE_RANGE_PRESETS should include custom', () => {
      expect(DATE_RANGE_PRESETS).toContain('custom');
    });

    it('PERCENTILE_METRICS should have 4 entries', () => {
      expect(PERCENTILE_METRICS).toHaveLength(4);
      expect(PERCENTILE_METRICS).toContain('latency');
    });

    it('SCORE_TREND_INTERVALS should include hour, day, week, month', () => {
      expect(SCORE_TREND_INTERVALS).toEqual(['hour', 'day', 'week', 'month']);
    });

    it('MAX_DATE_RANGE_DAYS should be 90', () => {
      expect(MAX_DATE_RANGE_DAYS).toBe(90);
    });

    it('ALLOWED_TRACE_SORT_FIELDS should include start_time', () => {
      expect(ALLOWED_TRACE_SORT_FIELDS).toContain('start_time');
    });

    it('ALLOWED_SESSION_SORT_FIELDS should include trace_count', () => {
      expect(ALLOWED_SESSION_SORT_FIELDS).toContain('trace_count');
    });

    it('FILTER_CONSTANTS.allowedFields should include all 17 standard fields', () => {
      expect(FILTER_CONSTANTS.allowedFields.length).toBeGreaterThanOrEqual(17);
      expect(FILTER_CONSTANTS.allowedFields).toContain('model');
      expect(FILTER_CONSTANTS.allowedFields).toContain('tags');
      expect(FILTER_CONSTANTS.allowedFields).toContain('session_id');
    });

    it('FILTER_CONSTANTS.allowedOperators should include existence operators', () => {
      expect(FILTER_CONSTANTS.allowedOperators).toContain('exists');
      expect(FILTER_CONSTANTS.allowedOperators).toContain('doesNotExist');
      expect(FILTER_CONSTANTS.allowedOperators).toContain('does_not_exist');
    });
  });

  describe('dataset and graph response schemas', () => {
    it('DatasetsListResponseSchema should accept { datasets: string[] }', () => {
      const valid = { datasets: ['datasets/foo.jsonl', 'bar.jsonl'] };
      expect(() => DatasetsListResponseSchema.parse(valid)).not.toThrow();
    });

    it('DatasetsListResponseSchema should reject missing datasets field', () => {
      expect(() => DatasetsListResponseSchema.parse({})).toThrow();
    });

    it('AppendDatasetRowResponseSchema should accept { data: { line_number } }', () => {
      expect(() =>
        AppendDatasetRowResponseSchema.parse({ data: { line_number: 0 } }),
      ).not.toThrow();
    });

    it('AppendDatasetRowResponseSchema should reject legacy { success: true } shape', () => {
      expect(() => AppendDatasetRowResponseSchema.parse({ success: true })).toThrow();
    });

    it('TraceGraphResponseSchema should accept { data: [...nodes] }', () => {
      const valid = {
        data: [
          { nodeId: 'n1', spanId: 's1', nodeType: 'task', displayName: 'Start', spanName: 'start' },
          { parentNodeId: 'n1', nodeId: 'n2', spanId: 's2', nodeType: 'task', displayName: 'End', spanName: 'end' },
        ],
      };
      expect(() => TraceGraphResponseSchema.parse(valid)).not.toThrow();
    });

    it('GraphNodeSchema should require nodeId, spanId, spanName', () => {
      expect(() => GraphNodeSchema.parse({ nodeId: 'n1' })).toThrow();
      expect(() => GraphNodeSchema.parse({
        nodeId: 'n1', spanId: 's1', nodeType: '', displayName: '', spanName: 'x',
      })).not.toThrow();
    });

    it('ScoreNamesResponseSchema should accept { data: string[] }', () => {
      expect(() => ScoreNamesResponseSchema.parse({ data: ['accuracy', 'relevance'] })).not.toThrow();
    });

    it('ScoreDetailResponseSchema should accept { data: ScoreResponse }', () => {
      const valid = {
        data: {
          // `id` is typed as uuid to match the pre-migration yaml.
          id: '00000000-0000-4000-8000-000000000001',
          resource_id: 'span-1',
          name: 'accuracy',
          score: 0.95,
          label: 'good',
          reason: 'High quality',
          source: 'eval',
          created_at: '2026-04-16T00:00:00.000Z',
        },
      };
      expect(() => ScoreDetailResponseSchema.parse(valid)).not.toThrow();
    });

    it('ScoreDetailResponseSchema should reject missing data field', () => {
      expect(() => ScoreDetailResponseSchema.parse({})).toThrow();
    });
  });
});
