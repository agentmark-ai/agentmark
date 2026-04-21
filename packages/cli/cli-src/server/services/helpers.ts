import type { Span, TraceDetail } from './types';

/** Map OTEL numeric status code to human-readable name. */
export function mapStatusCodeToName(code: string): string {
  const map: Record<string, string> = { '0': 'UNSET', '1': 'OK', '2': 'ERROR' };
  return map[code] ?? code;
}

/** Map human-readable status name back to numeric code. */
export function mapStatusNameToCode(name: string): string | undefined {
  const map: Record<string, string> = { 'OK': '1', 'ERROR': '2', 'UNSET': '0' };
  return map[name];
}

/** Convert milliseconds (number) to ISO string. */
export function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Safely parse JSON or return fallback. */
export function safeParse<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

/**
 * Map a raw span object from getTraceById / getSpans into the Span interface.
 * The raw span has `{ id, name, duration, parentId, timestamp (ms), traceId, status, data: {...} }`.
 */
export function mapRawSpanToInterface(raw: Record<string, unknown>): Span {
  const data = (raw.data ?? {}) as Record<string, unknown>;
  return {
    id: raw.id as string,
    traceId: raw.traceId as string,
    parentId: (raw.parentId as string) || null,
    name: raw.name as string,
    status: mapStatusCodeToName(String(data.status ?? raw.status ?? '0')),
    statusMessage: (data.statusMessage as string) || '',
    durationMs: (data.duration as number) ?? (raw.duration as number) ?? 0,
    timestamp: msToIso((raw.timestamp as number) || 0),
    type: ((data.type as string) || 'SPAN') as 'SPAN' | 'GENERATION' | 'EVENT',
    model: (data.model as string) || null,
    inputTokens: (data.inputTokens as number) || 0,
    outputTokens: (data.outputTokens as number) || 0,
    tokens: (data.totalTokens as number) || ((data.inputTokens as number) || 0) + ((data.outputTokens as number) || 0),
    cost: (data.cost as number) || 0,
    input: (data.input as string) || '',
    output: (data.output as string) || '',
    outputObject: (data.outputObject as string) || null,
    toolCalls: (data.toolCalls as string) || null,
    finishReason: (data.finishReason as string) || null,
    settings: (data.settings as string) || null,
    reasoningTokens: (data.reasoningTokens as number) || 0,
    metadata: (data.metadata as Record<string, string>) || {},
    props: (data.props as string) || null,
    spanKind: (data.spanKind as string) || '',
    serviceName: (data.serviceName as string) || '',
    promptName: (data.promptName as string) || null,
  };
}

/**
 * Transform the raw trace object from getTraceById into a TraceDetail.
 */
export function mapRawTraceToDetail(raw: Record<string, unknown>): TraceDetail {
  const data = (raw.data ?? {}) as Record<string, unknown>;
  const rawSpans = (raw.spans ?? []) as Array<Record<string, unknown>>;
  const spans = rawSpans.map(mapRawSpanToInterface);

  const startMs = (data.start as number) || 0;
  const endMs = (data.end as number) || 0;

  return {
    id: raw.id as string,
    name: (data.name as string) || (raw.name as string) || '',
    status: mapStatusCodeToName(String(data.status ?? '0')),
    start: msToIso(startMs),
    end: msToIso(endMs),
    latencyMs: (data.latency as number) || 0,
    cost: (data.cost as number) || 0,
    tokens: (data.tokens as number) || 0,
    spans,
  };
}

/** Wrap a synchronous SQLite operation with structured error logging. */
export function safeQuery<T>(fn: () => T, context: string): T {
  try {
    return fn();
  } catch (error) {
    console.error(`[LocalObservabilityService] ${context} failed:`, error);
    throw error;
  }
}
