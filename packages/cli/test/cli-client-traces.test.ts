/**
 * Tests for the CLI React client wrapper (`cli/src/lib/api/traces.ts`),
 * specifically around the /v1/runs/{runId}/traces deprecation.
 *
 * The client is consumed by the CLI's Next.js UI (/traces page) and must:
 *   1. Pass `runId` through as the `dataset_run_id` query parameter on
 *      `/v1/traces` — NOT hit the deprecated /v1/runs/{runId}/traces path.
 *   2. Unwrap the canonical `{ data, pagination }` envelope the local
 *      server emits.
 *   3. Tolerate the legacy `{ traces, total }` shape for forward-compat.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the API_URL config before importing the module under test so the
// URL assertions below are stable regardless of env.
vi.mock('../src/config/api', () => ({
  API_URL: 'http://localhost:9418',
}));

// The UI-components type import is irrelevant to behavior here — stub it
// so the test doesn't need the full ui-components build.
vi.mock('@agentmark-ai/ui-components', () => ({}));

import { getTraces } from '../src/lib/api/traces';

describe('CLI React client: getTraces', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ data: [], pagination: { total: 0 } }),
    } as Response);
  });

  it('hits /v1/traces with dataset_run_id= when runId is provided (not the deprecated path)', async () => {
    await getTraces({ runId: 'run-42' });

    const calledUrl = String(fetchSpy.mock.calls[0]![0]);
    expect(calledUrl).toBe('http://localhost:9418/v1/traces?dataset_run_id=run-42');
    expect(calledUrl).not.toContain('/v1/runs/');
  });

  it('hits /v1/traces (no filter) when runId is omitted', async () => {
    await getTraces();

    const calledUrl = String(fetchSpy.mock.calls[0]![0]);
    expect(calledUrl).toBe('http://localhost:9418/v1/traces');
  });

  it('preserves limit and offset alongside the dataset_run_id filter', async () => {
    await getTraces({ runId: 'run-42', limit: 10, offset: 20 });

    const calledUrl = String(fetchSpy.mock.calls[0]![0]);
    // URLSearchParams keeps insertion order — runId first, then limit/offset.
    expect(calledUrl).toBe(
      'http://localhost:9418/v1/traces?dataset_run_id=run-42&limit=10&offset=20',
    );
  });

  it('passes the canonical wire Trace shape through directly (no remap)', async () => {
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({
        data: [
          {
            id: 't-1',
            name: 'Trace 1',
            status: 'OK',
            start: '2026-01-01T00:00:00Z',
            end: '2026-01-01T00:00:01Z',
            latency_ms: 1234,
            cost: 0.0042,
            tokens: 500,
            span_count: 3,
            tags: [],
          },
        ],
        pagination: { total: 42, limit: 50, offset: 0 },
      }),
    } as Response);

    const result = await getTraces();

    expect(result.total).toBe(42);
    expect(result.traces).toHaveLength(1);
    // The fetcher is a straight passthrough now — the wire shape IS the
    // `Trace` shape the UI renders from. If this fails, either the
    // `Trace` type drifted from the canonical wire or someone
    // reintroduced a remap.
    expect(result.traces[0]).toEqual({
      id: 't-1',
      name: 'Trace 1',
      status: 'OK',
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-01T00:00:01Z',
      latency_ms: 1234,
      cost: 0.0042,
      tokens: 500,
      span_count: 3,
      tags: [],
    });
  });

  it('reads total from pagination.total when the canonical envelope is used', async () => {
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({
        data: [],
        pagination: { total: 99, limit: 50, offset: 0 },
      }),
    } as Response);

    const result = await getTraces();

    expect(result.total).toBe(99);
    expect(result.traces).toEqual([]);
  });

  it('tolerates the legacy { traces, total } envelope shape', async () => {
    // A mock server that still emits the old envelope keeps working as
    // long as the inner items match the canonical `Trace` shape.
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({
        traces: [
          {
            id: 't-legacy',
            name: 'Legacy envelope',
            status: 'OK',
            start: '2026-01-01T00:00:00Z',
            end: '2026-01-01T00:00:01Z',
            latency_ms: 900,
            cost: 0.001,
            tokens: 50,
            span_count: 2,
            tags: [],
          },
        ],
        total: 1,
      }),
    } as Response);

    const result = await getTraces();

    expect(result.total).toBe(1);
    expect(result.traces[0]!.id).toBe('t-legacy');
    expect(result.traces[0]!.latency_ms).toBe(900);
  });

  it('returns an empty result when fetch rejects', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down'));

    const result = await getTraces({ runId: 'run-x' });

    expect(result).toEqual({ traces: [], total: 0 });
  });
});
