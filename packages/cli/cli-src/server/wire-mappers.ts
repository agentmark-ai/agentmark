/**
 * Wire-shape mappers for the local dev server.
 *
 * LocalTracesService + LocalObservabilityService return shapes rooted
 * in camelCase TypeScript conventions (`latencyMs`, `spanCount`, …).
 * The public `/v1/*` HTTP surface uses snake_case (`latency_ms`,
 * `span_count`, …) so external SDK consumers see a stable contract.
 * These helpers remap at the route boundary of the Express server.
 *
 * Covered by `test/wire-mappers.test.ts`.
 */
import type { TracesResponse } from "./services/types";

/**
 * `/v1/traces` list-response wire shape. snake_case fields, ISO
 * datetime `start` / `end`, `latency_ms` in milliseconds. The
 * wire-mappers test asserts this interface against a Zod schema —
 * keep them in sync.
 */
export interface TraceListItemWire {
  id: string;
  name: string;
  status: string;
  start: string;
  end: string;
  latency_ms: number;
  cost: number;
  tokens: number;
  span_count: number;
  tags: string[];
}

export interface TracesListResponseWire {
  data: TraceListItemWire[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

/**
 * Map the service-layer TracesResponse (camelCase, internal) to the
 * `/v1/traces` list-response wire shape (snake_case, public).
 *
 * Tags pass through from LocalTracesService — extracted from the
 * `agentmark.tags` span attribute on ingest and aggregated across a
 * trace's spans at query time.
 */
export function toTracesListResponseWire(
  result: TracesResponse,
): TracesListResponseWire {
  return {
    data: result.traces.map((t) => ({
      id: t.id,
      name: t.name ?? "",
      status: t.status,
      start: t.start,
      end: t.end,
      latency_ms: t.latencyMs,
      cost: t.cost,
      tokens: t.tokens,
      span_count: t.spanCount,
      tags: t.tags ?? [],
    })),
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  };
}
