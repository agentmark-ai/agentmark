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
import type {
  Score,
  Span,
  SpanIO,
  TraceDetail,
  TracesResponse,
  SessionsResponse,
  ScoresResponse,
} from "./services/types";

/** Map an OTEL numeric status code (string) to the canonical name. */
function statusCodeToName(code: unknown): "UNSET" | "OK" | "ERROR" {
  const s = String(code ?? "0");
  if (s === "1" || s === "1.0" || s === "OK") return "OK";
  if (s === "2" || s === "2.0" || s === "ERROR") return "ERROR";
  return "UNSET";
}

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

// ---------------------------------------------------------------------------
// Span wire shape — used by /v1/spans, /v1/traces/:id/spans
//
// The schema (`TraceSpanResponseSchema`) is flat snake_case. Service
// layer returns the legacy nested `{ id, name, duration, parentId,
// timestamp(ms), traceId, status('0'|'1'|'2'), data: {...} }` shape
// (rooted in the SQLite query mapper). Mapping happens here so route
// handlers stay thin and the contract is the same as the cloud
// gateway's wire output.
// ---------------------------------------------------------------------------

export interface SpanWire {
  id: string;
  trace_id: string;
  parent_id: string | null;
  name: string;
  status: "UNSET" | "OK" | "ERROR";
  status_message: string;
  duration_ms: number;
  timestamp: string; // ISO datetime
  type: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  tokens: number;
  cost: number;
  span_kind: string;
  service_name: string;
  prompt_name: string | null;
  metadata: Record<string, string>;
}

/**
 * Map a service-layer span (the nested-`data` shape returned by
 * `getSpans` / `searchSpans` in routes/traces) to the snake_case wire
 * shape expected by `TraceSpanResponseSchema`.
 */
export function toSpanWire(raw: Record<string, unknown>): SpanWire {
  const data = (raw.data ?? {}) as Record<string, unknown>;
  const tsRaw = raw.timestamp;
  // The service returns timestamp as ms-since-epoch (already
  // converted from the OTEL nanos by mapRowToSpan). Coerce defensively.
  let timestampIso = "1970-01-01T00:00:00.000Z";
  if (typeof tsRaw === "number" && Number.isFinite(tsRaw)) {
    timestampIso = new Date(tsRaw).toISOString();
  } else if (typeof tsRaw === "string") {
    const ms = Number(tsRaw);
    timestampIso = Number.isFinite(ms) ? new Date(ms).toISOString() : tsRaw;
  }

  const inputTokens = (data.inputTokens as number) ?? 0;
  const outputTokens = (data.outputTokens as number) ?? 0;
  const totalTokens = (data.totalTokens as number) ?? inputTokens + outputTokens;

  // Metadata column may arrive as `{}`, a JSON string, or a parsed object.
  // Schema requires `Record<string, string>` — coerce to string values.
  const metadata: Record<string, string> = {};
  const rawMeta = data.metadata;
  if (rawMeta && typeof rawMeta === "object") {
    for (const [k, v] of Object.entries(rawMeta as Record<string, unknown>)) {
      metadata[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }

  return {
    id: raw.id as string,
    trace_id: (raw.traceId as string) ?? "",
    parent_id: (raw.parentId as string) || null,
    name: (raw.name as string) ?? "",
    status: statusCodeToName(raw.status ?? data.status),
    status_message: (data.statusMessage as string) ?? "",
    duration_ms: (raw.duration as number) ?? (data.duration as number) ?? 0,
    timestamp: timestampIso,
    type: (data.type as string) ?? "SPAN",
    model: (data.model as string) || null,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    tokens: totalTokens,
    cost: (data.cost as number) ?? 0,
    span_kind: (data.spanKind as string) ?? "",
    service_name: (data.serviceName as string) ?? "",
    prompt_name: (data.promptName as string) || null,
    metadata,
  };
}

export function toSpansListWire(spans: Array<Record<string, unknown>>): SpanWire[] {
  return spans.map(toSpanWire);
}

// ---------------------------------------------------------------------------
// Trace detail wire shape — used by /v1/traces/:id (and ?fields=graph)
// ---------------------------------------------------------------------------

// Faithful projection of the service-layer Span. See SpanInTraceSchema
// in @agentmark-ai/api-schemas for the contract + rationale (don't hand-
// curate subsets — that's how the trace-drawer's button gating broke).
export interface SpanInTraceWire {
  id: string;
  trace_id: string;
  parent_id: string | null;
  name: string;
  status: "UNSET" | "OK" | "ERROR";
  status_message?: string | null;
  duration_ms: number;
  timestamp: string;
  type: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  tokens: number;
  reasoning_tokens?: number;
  cost: number;
  input?: string | null;
  output?: string | null;
  output_object?: string | null;
  tool_calls?: string | null;
  prompt_name?: string | null;
  props?: string | null;
  finish_reason?: string | null;
  settings?: string | null;
  metadata?: Record<string, string>;
  span_kind?: string;
  service_name?: string;
}

export interface TraceDetailWire {
  id: string;
  name: string;
  status: "UNSET" | "OK" | "ERROR";
  start: string;
  end: string;
  latency_ms: number;
  cost: number;
  tokens: number;
  input?: string;
  output?: string;
  spans: SpanInTraceWire[];
  graph?: unknown;
  scores?: unknown;
}

/**
 * Faithful projection of a service-layer `Span` into the wire shape
 * embedded in `TraceDetailWire`. Returns a builder closed over the
 * trace id so the per-span `trace_id` falls back to the parent when
 * the row's own value is missing (older SQLite rows).
 *
 * Principle: this is the inverse of "hand-curate a subset". Every field
 * on the service `Span` gets a wire counterpart; new fields are added
 * here exactly once. Heavy fields (`input`, `output`, `output_object`,
 * `tool_calls`) are emitted only when the service object has them, so
 * a hosted gateway can null them out at the service layer to force the
 * lazy `/v1/traces/:id/spans/:id` path. The CLI's local SQLite path
 * has them in memory already, so it ships them.
 */
function toSpanInTraceWire(parentTraceId: string) {
  return (s: Span): SpanInTraceWire => ({
    id: s.id,
    trace_id: s.traceId ?? parentTraceId,
    parent_id: s.parentId ?? null,
    name: s.name,
    status: statusCodeToName(s.status),
    status_message: s.statusMessage || undefined,
    duration_ms: s.durationMs,
    timestamp: s.timestamp,
    type: s.type,
    model: s.model,
    input_tokens: s.inputTokens,
    output_tokens: s.outputTokens,
    tokens: s.tokens,
    reasoning_tokens: s.reasoningTokens || undefined,
    cost: s.cost,
    // Heavy fields: emit only when present so consumers can distinguish
    // "we didn't ship this" from "this is empty". A `null` value here
    // means "fetched, was empty"; an absent key means "use lazy fetch".
    ...(s.input ? { input: s.input } : {}),
    ...(s.output ? { output: s.output } : {}),
    ...(s.outputObject != null ? { output_object: s.outputObject } : {}),
    ...(s.toolCalls != null ? { tool_calls: s.toolCalls } : {}),
    // Small but high-value: trace-drawer button gating reads these.
    prompt_name: s.promptName,
    props: s.props,
    finish_reason: s.finishReason,
    settings: s.settings,
    metadata: s.metadata && Object.keys(s.metadata).length > 0 ? s.metadata : undefined,
    span_kind: s.spanKind || undefined,
    service_name: s.serviceName || undefined,
  });
}

/**
 * Map service-layer `TraceDetail` (camelCase) into the snake_case wire
 * shape expected by `TraceDetailSchema`. Spans are projected via
 * `toSpanInTraceWire` — see its docstring for the projection contract.
 */
export function toTraceDetailWire(
  detail: TraceDetail,
  extras: { graph?: unknown; scores?: unknown } = {},
): TraceDetailWire {
  return {
    id: detail.id,
    name: detail.name ?? "",
    status: statusCodeToName(detail.status),
    start: detail.start,
    end: detail.end,
    latency_ms: detail.latencyMs,
    cost: detail.cost,
    tokens: detail.tokens,
    ...(detail.input !== undefined ? { input: detail.input } : {}),
    ...(detail.output !== undefined ? { output: detail.output } : {}),
    spans: (detail.spans ?? []).map(toSpanInTraceWire(detail.id)),
    ...(extras.graph !== undefined ? { graph: extras.graph } : {}),
    ...(extras.scores !== undefined ? { scores: extras.scores } : {}),
  };
}

// ---------------------------------------------------------------------------
// Span I/O wire shape — used by /v1/traces/:id/spans/:id
// ---------------------------------------------------------------------------

export interface SpanIOWire {
  input: string;
  output: string;
  output_object: string | null;
  tool_calls: string | null;
}

export function toSpanIOWire(io: SpanIO): SpanIOWire {
  return {
    input: io.input ?? "",
    output: io.output ?? "",
    output_object: io.outputObject ?? null,
    tool_calls: io.toolCalls ?? null,
  };
}

// ---------------------------------------------------------------------------
// Sessions list wire shape — used by /v1/sessions
// ---------------------------------------------------------------------------

export interface SessionWire {
  id: string;
  name: string;
  start: string;
  end: string;
  trace_count: number;
  total_cost: number;
  total_tokens: number;
  latency_ms: number;
  tags?: string[];
}

export function toSessionsListWire(result: SessionsResponse): {
  data: SessionWire[];
  pagination: { total: number; limit: number; offset: number };
} {
  return {
    data: result.sessions.map((s) => ({
      id: s.id,
      name: s.name ?? "",
      start: s.start,
      end: s.end,
      trace_count: s.traceCount,
      total_cost: s.totalCost,
      total_tokens: s.totalTokens,
      latency_ms: s.latencyMs,
      ...(s.tags && s.tags.length > 0 ? { tags: s.tags } : {}),
    })),
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  };
}

// ---------------------------------------------------------------------------
// Scores list wire shape — used by /v1/scores
//
// The detail handler (/v1/scores/:id) already maps explicitly to
// snake_case; this brings the list handler to parity so the contract
// is identical for list vs detail.
// ---------------------------------------------------------------------------

export interface ScoreWire {
  id: string;
  resource_id: string;
  name: string;
  score: number;
  label: string;
  reason: string;
  source: string;
  user_id?: string;
  created_at: string;
}

export function toScoreWire(s: Score): ScoreWire {
  return {
    id: s.id,
    resource_id: s.resourceId,
    name: s.name,
    score: s.score,
    label: s.label ?? "",
    reason: s.reason ?? "",
    source: s.source,
    ...(s.userId !== undefined ? { user_id: s.userId } : {}),
    created_at: s.createdAt,
  };
}

export function toScoresListWire(result: ScoresResponse): {
  data: ScoreWire[];
  pagination: { total: number; limit: number; offset: number };
} {
  return {
    data: result.scores.map(toScoreWire),
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  };
}
