/**
 * Contract test for the `/v1/traces` list-response wire shape.
 *
 * Pins the output of `toTracesListResponseWire` against a locally-
 * declared Zod schema. Any drift between the mapper and the schema
 * breaks this test — keep them in sync.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  RequestsListResponseSchema,
  TracesListResponseSchema as PublishedTracesListResponseSchema,
} from '@agentmark-ai/api-schemas';
import {
  toTracesListResponseWire,
  toRequestsListWire,
} from '../cli-src/server/wire-mappers';
import type {
  TracesResponse,
  RequestsResponse,
} from '../cli-src/server/services/types';

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
  input_preview: z.string().nullable().optional(),
  output_preview: z.string().nullable().optional(),
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

  it('maps inputPreview/outputPreview to snake_case, only when present, and stays valid against the published schema', () => {
    const wire = toTracesListResponseWire(
      makeServiceResult({
        traces: [
          {
            id: 'trace-preview',
            name: 'Has preview',
            status: 'OK',
            start: '2026-01-01T00:00:00.000Z',
            end: '2026-01-01T00:00:01.500Z',
            latencyMs: 1500,
            cost: 0,
            tokens: 0,
            spanCount: 2,
            inputPreview: 'What is the capital of France?',
            outputPreview: 'Paris.',
          },
          {
            id: 'trace-no-preview',
            name: 'No preview',
            status: 'OK',
            start: '2026-01-01T00:00:00.000Z',
            end: '2026-01-01T00:00:01.500Z',
            latencyMs: 1500,
            cost: 0,
            tokens: 0,
            spanCount: 1,
          },
        ] as TracesResponse['traces'],
      }),
    );

    // Present → snake_case wire names, exact values.
    expect(wire.data[0].input_preview).toBe('What is the capital of France?');
    expect(wire.data[0].output_preview).toBe('Paris.');
    // The camelCase service field names must never leak onto the wire.
    expect(wire.data[0]).not.toHaveProperty('inputPreview');
    expect(wire.data[0]).not.toHaveProperty('outputPreview');
    // Absent → keys omitted entirely (lean wire; "not computed" ≠ null ≠ '').
    expect(wire.data[1]).not.toHaveProperty('input_preview');
    expect(wire.data[1]).not.toHaveProperty('output_preview');
    // The mapper output still satisfies the PUBLISHED api-schemas contract.
    expect(PublishedTracesListResponseSchema.safeParse(wire).success).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// /v1/requests — list of LLM-call records ("requests"). camelCase service
// shape → snake_case wire, pinned against the published `RequestsListResponse`
// schema in `@agentmark-ai/api-schemas`.
// -----------------------------------------------------------------------------

function makeRequestsResult(
  overrides: Partial<RequestsResponse> = {},
): RequestsResponse {
  return {
    requests: [
      {
        id: 'span-1',
        tenantId: 'tenant-1',
        appId: 'app-1',
        cost: 0.0042,
        promptTokens: 156,
        completionTokens: 89,
        latencyMs: 1234,
        modelUsed: 'gpt-4o',
        status: 'OK',
        input: 'What is the capital of France?',
        output: 'Paris.',
        ts: '2026-01-15T10:30:00.000Z',
        userId: 'user-1',
        promptName: 'geography-qa',
        traceId: 'trace-abc',
        statusMessage: '',
        props: '{"lang":"en"}',
      },
      {
        id: 'span-2',
        tenantId: 'tenant-1',
        appId: 'app-1',
        cost: 0,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 0,
        modelUsed: '',
        status: 'ERROR',
        input: 'translate this',
        output: null,
        ts: '2026-01-15T11:00:00.000Z',
        userId: '',
        promptName: '',
        traceId: 'trace-def',
        statusMessage: 'Rate limit exceeded',
        props: '',
      },
    ],
    total: 2,
    limit: 50,
    offset: 0,
    ...overrides,
  };
}

describe('toRequestsListWire', () => {
  it('produces a body that parses cleanly against the published schema', () => {
    const wire = toRequestsListWire(makeRequestsResult());
    const parsed = RequestsListResponseSchema.safeParse(wire);
    if (!parsed.success) {
      throw new Error(`wire body failed schema validation:\n${parsed.error.toString()}`);
    }
    expect(parsed.success).toBe(true);
  });

  it('renames camelCase service fields to snake_case wire names', () => {
    const wire = toRequestsListWire(makeRequestsResult());
    const [first] = wire.data;

    expect(first).toMatchObject({
      tenant_id: 'tenant-1',
      app_id: 'app-1',
      prompt_tokens: 156,
      completion_tokens: 89,
      latency_ms: 1234,
      model_used: 'gpt-4o',
      user_id: 'user-1',
      prompt_name: 'geography-qa',
      trace_id: 'trace-abc',
      status_message: '',
    });
    expect(first).not.toHaveProperty('promptTokens');
    expect(first).not.toHaveProperty('modelUsed');
    expect(first).not.toHaveProperty('traceId');
  });

  it('preserves a null output rather than coercing it to a string', () => {
    const wire = toRequestsListWire(makeRequestsResult());
    expect(wire.data[1].output).toBeNull();
  });

  it('mirrors pagination fields exactly from the service result', () => {
    const wire = toRequestsListWire(makeRequestsResult({ total: 99, limit: 10, offset: 20 }));
    expect(wire.pagination).toEqual({ total: 99, limit: 10, offset: 20 });
  });

  it('returns an empty data array when the service has no requests', () => {
    const wire = toRequestsListWire({ requests: [], total: 0, limit: 50, offset: 0 });
    expect(wire.data).toEqual([]);
    expect(RequestsListResponseSchema.safeParse(wire).success).toBe(true);
  });
});
