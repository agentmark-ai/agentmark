import type { TraceData } from "../types";

export interface TraceSummary {
  cost: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  models: string[];
  userId?: string;
  sessionId?: string;
}

/**
 * Compute trace-level aggregates from a TraceData object.
 * Falls back to summing across spans when the trace-level field is absent.
 */
export function summarizeTrace(trace: TraceData): TraceSummary {
  const spans = trace.spans ?? [];
  const generationSpans = spans.filter(
    (s) => s.data?.type === "GENERATION" || s.data?.spanKind === "llm" || s.data?.model
  );

  // Token split: sum across generation-like spans only
  const promptTokens = generationSpans.reduce(
    (sum, s) => sum + (Number(s.data?.inputTokens) || 0),
    0
  );
  const completionTokens = generationSpans.reduce(
    (sum, s) => sum + (Number(s.data?.outputTokens) || 0),
    0
  );

  // Total cost: use trace.data.cost when available, else sum spans
  const cost =
    trace.data?.cost != null
      ? Number(trace.data.cost)
      : spans.reduce((sum, s) => sum + (Number(s.data?.cost) || 0), 0);

  // Total tokens: use trace.data.tokens when available, else sum spans
  const totalTokens =
    trace.data?.tokens != null
      ? Number(trace.data.tokens)
      : spans.reduce((sum, s) => sum + (Number(s.data?.totalTokens) || 0), 0);

  // Latency from trace.data.latency (stored as ms)
  const latencyMs = Number(trace.data?.latency) || 0;

  // De-duplicated list of models, stable insertion order, nulls excluded
  const seen = new Set<string>();
  const models: string[] = [];
  for (const s of spans) {
    const m = s.data?.model;
    if (m && !seen.has(m)) {
      seen.add(m);
      models.push(m);
    }
  }

  // userId / sessionId — from trace.data (merged from root span), undefined when absent
  const userId =
    trace.data?.userId != null ? String(trace.data.userId) : undefined;
  const sessionId =
    trace.data?.sessionId != null ? String(trace.data.sessionId) : undefined;

  return {
    cost,
    totalTokens,
    promptTokens,
    completionTokens,
    latencyMs,
    models,
    userId,
    sessionId,
  };
}
