import type { SpanData } from "../../types";

/**
 * Formats a duration in milliseconds into a human-readable string.
 * e.g. 1234 → "1.23s", 456 → "456ms", 0 → "0ms"
 */
export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) {
    console.warn("[formatDuration] Received invalid duration:", ms);
    return "N/A";
  }
  if (ms >= 60_000) {
    const mins = Math.floor(ms / 60_000);
    const secs = ((ms % 60_000) / 1000).toFixed(1);
    return `${mins}m ${secs}s`;
  }
  if (ms >= 1_000) {
    return `${(ms / 1_000).toFixed(2)}s`;
  }
  return `${Math.round(ms)}ms`;
}

/**
 * Formats a cost value in USD.
 * Returns null when cost is undefined or zero.
 */
export function formatCost(cost?: number): string | null {
  if (cost == null || cost === 0) return null;
  if (cost < 0.0001) return `$${cost.toExponential(2)}`;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(4)}`;
}

/**
 * Formats a token count, returning null when absent or zero.
 */
export function formatTokens(tokens?: number): string | null {
  if (tokens == null || tokens === 0) return null;
  return tokens.toLocaleString();
}

/**
 * Truncates a string to maxLength characters, appending "…" if cut.
 * Returns null when text is empty or undefined.
 */
export function truncateText(text?: string, maxLength = 200): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

/**
 * Derives a display status string from span data.
 * Returns null when no status is available.
 */
export function getSpanStatus(data: SpanData["data"]): string | null {
  if (data.status) return data.status;
  if (data.statusMessage) return data.statusMessage;
  if (data.finishReason) return data.finishReason;
  return null;
}

export interface SpanSummary {
  name: string;
  duration: string;
  model: string | null;
  inputTokens: string | null;
  outputTokens: string | null;
  totalTokens: string | null;
  cost: string | null;
  status: string | null;
  input: string | null;
  output: string | null;
}

/**
 * Extracts a display-ready summary from a SpanData object.
 * All fields are pre-formatted; null means "not available".
 */
export function extractSpanSummary(span: SpanData): SpanSummary {
  const d = span.data ?? {};
  return {
    name: span.name ?? "Unknown",
    duration: formatDuration(span.duration ?? 0),
    model: d.model ?? d.model_name ?? null,
    inputTokens: formatTokens(d.inputTokens),
    outputTokens: formatTokens(d.outputTokens),
    totalTokens: formatTokens(d.totalTokens),
    cost: formatCost(d.cost),
    status: getSpanStatus(d),
    input: truncateText(d.input),
    output: truncateText(d.output),
  };
}
