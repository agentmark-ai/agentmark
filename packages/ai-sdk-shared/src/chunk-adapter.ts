import {
  finalizeUsage,
  type CanonicalUsage,
  type FinalizedUsage,
} from "@agentmark-ai/prompt-core";

/**
 * Captures the chunk-shape + usage-field differences between AI SDK v4 and
 * v5. The executor factory is parameterized by one of these so the shared
 * core stays free of version conditionals.
 *
 * The deltas between v4 and v5 at the chunk level are small:
 *   - v4 stream chunks use `textDelta` for incremental text, v5 uses `text`.
 *   - v4 finish chunks carry usage as `c.usage`; v5 uses `c.totalUsage`
 *     (with legacy `c.usage` fallback).
 *   - Top-level result usage objects use the same field-name permutations
 *     (inputTokens / promptTokens / input_tokens), but v5 introduced
 *     `totalUsage` alongside `usage` on the result object for aggregate
 *     step usage.
 *
 * Everything else (tool-call/tool-result/object-delta/object-final, error
 * shape, abort signal threading) is identical between v4 and v5 and lives
 * in the shared executor, not here.
 */
export interface ChunkAdapter {
  readonly name: string;

  /** Read an incremental-text chunk's payload. v4: `textDelta ?? text`. v5: `text`. */
  readTextChunk(chunk: any): string | undefined;

  /** Read usage from a stream `finish` chunk. v4: `c.usage`. v5: `c.totalUsage ?? c.usage`. */
  readFinishUsage(chunk: any): any;

  /**
   * Normalize a raw usage object (from either a finish chunk's usage field,
   * or a top-level `generateText` / `streamText` result's `usage` /
   * `totalUsage`) into the canonical `FinalizedUsage` shape. Handles field-
   * name aliasing + defers the totalTokens fallback to `prompt-core`'s
   * `finalizeUsage`.
   */
  normalizeUsage(raw: any): FinalizedUsage | undefined;
}

/** Shared usage-normalization logic — identical between v4 and v5. */
function normalizeCommonUsage(u: any): FinalizedUsage | undefined {
  if (!u || typeof u !== "object") return undefined;
  const canonical: CanonicalUsage = {
    inputTokens: u.inputTokens ?? u.promptTokens ?? u.input_tokens ?? 0,
    outputTokens: u.outputTokens ?? u.completionTokens ?? u.output_tokens ?? 0,
    totalTokens:
      typeof u.totalTokens === "number" ? u.totalTokens : undefined,
  };
  return finalizeUsage(canonical);
}

export const v4Chunks: ChunkAdapter = {
  name: "vercel-ai-v4",
  readTextChunk: (c) => c.textDelta ?? c.text,
  readFinishUsage: (c) => c.usage,
  normalizeUsage: (raw) => {
    if (!raw) return undefined;
    // v4: finish chunks and results expose usage under `.usage`; handle the
    // case where a caller passes the result object directly.
    const u = raw.usage ?? raw;
    return normalizeCommonUsage(u);
  },
};

export const v5Chunks: ChunkAdapter = {
  name: "vercel-ai-v5",
  readTextChunk: (c) => c.text,
  readFinishUsage: (c) => c.totalUsage ?? c.usage,
  normalizeUsage: (raw) => {
    if (!raw) return undefined;
    // v5: `totalUsage` preferred for aggregate across steps; fall back to
    // `usage` for single-step shapes.
    const u = raw.totalUsage ?? raw.usage ?? raw;
    return normalizeCommonUsage(u);
  },
};
