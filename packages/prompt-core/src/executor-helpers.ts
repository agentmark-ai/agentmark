/**
 * Cross-adapter executor primitives.
 *
 * These helpers codify invariants that every adapter needs but nothing in
 * here knows about any specific SDK's field names. SDK-specific field
 * mapping (`usage.promptTokens` vs `usage.inputTokens` vs `RunUsage`)
 * happens inside each adapter — the result of that mapping is the input
 * to these helpers.
 *
 * Parity contract: these helpers have byte-compatible counterparts in
 * `prompt-core-python/prompt_core/executor_helpers.py`. Both are exercised
 * by the shared `conformance-vectors` fixture set — see Phase 4.
 */

export interface CanonicalUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
}

export interface FinalizedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Fill in `totalTokens` from `inputTokens + outputTokens` when the provider
 * doesn't report it. Trust the provider when it does. The Mastra adapter
 * regression (bug_005) was exactly this fallback missing.
 */
export function finalizeUsage(raw: CanonicalUsage | null | undefined): FinalizedUsage | undefined {
  if (!raw) return undefined;
  const inputTokens = Number.isFinite(raw.inputTokens) ? raw.inputTokens : 0;
  const outputTokens = Number.isFinite(raw.outputTokens) ? raw.outputTokens : 0;
  const totalTokens =
    typeof raw.totalTokens === "number" && Number.isFinite(raw.totalTokens)
      ? raw.totalTokens
      : inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

/**
 * Canonicalize an arbitrary thrown/yielded error into a human-readable
 * string. Every adapter had a local copy of this; they've now converged
 * here so subtle differences (e.g. some adapters checking `.data.error`
 * and some not) no longer drift.
 */
export function normalizeError(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as Record<string, any>;
    return (
      e.message ||
      e.error?.message ||
      e.data?.error?.message ||
      JSON.stringify(error)
    );
  }
  return String(error);
}
