/**
 * Contract test for the `/v1/traces` list-response wire shape.
 *
 * Pins the output of `toTracesListResponseWire` against a locally-
 * declared Zod schema. Any drift between the mapper and the schema
 * breaks this test — keep them in sync.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { toTracesListResponseWire } from '../cli-src/server/wire-mappers';
import type { TracesResponse } from '../cli-src/server/services/types';

// -----------------------------------------------------------------------------
// Wire contract — snake_case fields, ISO datetimes, latency in ms.
// Must match what `toTracesListResponseWire` emits.
// -----------------------------------------------------------------------------
const TraceResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['UNSET', 'OK', 'ERROR']),
  start: z.string().datetime(),
  end: z.string().datetime(),
  latency_ms: z.number(),
  cost: z.number(),
  tokens: z.number().int().nonnegative(),
  span_count: z.number().int().nonnegative(),
  tags: z.array(z.string()).optional(),
});

const TracesListResponseSchema = z.object({
  data: z.array(TraceResponseSchema),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  }),
});

function makeServiceResult(overrides: Partial<TracesResponse> = {}): TracesResponse {
  return {
    traces: [
      {
        id: 'trace-1',
        name: 'First trace',
        status: 'OK',
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-01T00:00:01.500Z',
        latencyMs: 1500,
        cost: 0.0042,
        tokens: 731,
        spanCount: 4,
      },
      {
        id: 'trace-2',
        name: 'Second trace',
        status: 'ERROR',
        start: '2026-01-02T00:00:00.000Z',
        end: '2026-01-02T00:00:00.800Z',
        latencyMs: 800,
        cost: 0,
        tokens: 0,
        spanCount: 1,
      },
    ] as TracesResponse['traces'],
    total: 2,
    limit: 50,
    offset: 0,
    ...overrides,
  };
}

describe('toTracesListResponseWire', () => {
  it('produces a body that parses cleanly against the wire schema', () => {
    const wire = toTracesListResponseWire(makeServiceResult());

    const parsed = TracesListResponseSchema.safeParse(wire);
    if (!parsed.success) {
      throw new Error(
        `wire body failed schema validation:\n${parsed.error.toString()}`,
      );
    }
    expect(parsed.success).toBe(true);
  });

  it('renames camelCase service fields to snake_case wire names', () => {
    const wire = toTracesListResponseWire(makeServiceResult());
    const [first] = wire.data;

    // snake_case is the invariant — the whole reason this mapper exists.
    expect(first).toHaveProperty('latency_ms', 1500);
    expect(first).toHaveProperty('span_count', 4);
    expect(first).not.toHaveProperty('latencyMs');
    expect(first).not.toHaveProperty('spanCount');
  });

  it('passes through tags when the service layer surfaces them', () => {
    const wire = toTracesListResponseWire(
      makeServiceResult({
        traces: [
          {
            id: 'trace-tagged',
            name: 'Tagged',
            status: 'OK',
            start: '2026-01-01T00:00:00.000Z',
            end: '2026-01-01T00:00:01.500Z',
            latencyMs: 1500,
            cost: 0,
            tokens: 0,
            spanCount: 1,
            tags: ['prod', 'checkout'],
          },
        ] as TracesResponse['traces'],
      }),
    );

    expect(wire.data[0].tags).toEqual(['prod', 'checkout']);
  });

  it('defaults tags to [] when the service omits them (trace has no tagged spans)', () => {
    // makeServiceResult() deliberately produces TraceSummary rows without
    // `tags` set — mirrors a trace whose spans never emitted
    // `agentmark.tags`.
    const wire = toTracesListResponseWire(makeServiceResult());

    for (const item of wire.data) {
      expect(item.tags).toEqual([]);
    }
  });

  it('mirrors pagination fields exactly from the service result', () => {
    const wire = toTracesListResponseWire(
      makeServiceResult({ total: 123, limit: 10, offset: 40 }),
    );

    expect(wire.pagination).toEqual({ total: 123, limit: 10, offset: 40 });
  });

  it('returns an empty data array when the service has no traces', () => {
    const wire = toTracesListResponseWire({
      traces: [],
      total: 0,
      limit: 50,
      offset: 0,
    });

    expect(wire.data).toEqual([]);
    const parsed = TracesListResponseSchema.safeParse(wire);
    expect(parsed.success).toBe(true);
  });
});
