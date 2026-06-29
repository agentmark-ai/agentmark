/**
 * Trace preprocessor — Stage 1 of the Trace Topics pipeline.
 *
 * Pure function: trace tree → readable text. No model calls, no storage
 * writes, no I/O. Output is deterministic (same input → same bytes) and
 * bounded by a configurable token cap.
 *
 * Design decisions:
 * - Minimal local interfaces (not `@agentmark-ai/api-types`) so shared-utils
 *   stays dependency-light. A real `Span[]` satisfies them structurally.
 * - Tree built from `parentId` — root = `!parentId`, same rule as
 *   `deriveTraceIO`. Siblings sorted by `timestamp`, stable array-index
 *   tie-break. Depth-first walk with cycle + orphan guards.
 * - Attachments (`blobRefs`) and metrics are accepted on the type but never
 *   rendered; callers may pass full span objects without pre-stripping.
 * - Token cap is a char-budget estimate (`tokenLimit × CHARS_PER_TOKEN = 4`).
 *   A real tokenizer can swap in behind the same interface later; Stage 2's
 *   model (Gemini 2.5 Flash-Lite, 1M context) makes 128K a safe cost/safety
 *   bound in the interim.
 * - Truncation happens at a UTF-16 code-unit boundary with surrogate-pair
 *   awareness. The `…[truncated]` marker is always appended when trimmed.
 */

/** Approximate UTF-16 code units per token used for the char-budget estimate. */
const CHARS_PER_TOKEN = 4;

/** Marker appended when the rendered output is truncated to the char budget. */
const TRUNCATED_MARKER = "…[truncated]";

/** Default token limit for the rendered output. */
export const TRACE_PREPROCESSOR_DEFAULT_TOKEN_LIMIT = 128_000;

/**
 * Minimal span projection the preprocessor needs. Both the camelCase
 * service-layer `Span` and mapped wire spans satisfy it structurally.
 */
export interface TracePreprocessorSpan {
  /** Unique span identifier — used to locate children in the tree. */
  id?: string | null;
  /** null / undefined / '' parent marks a root span. */
  parentId?: string | null;
  /** Human-readable span label (e.g. prompt name, tool name). */
  name?: string | null;
  /** Span kind, e.g. 'GENERATION', 'TOOL', 'SPAN'. */
  type?: string | null;
  /** Sort key for sibling ordering — ISO strings and epoch numbers both
   * compare correctly under `<`. */
  timestamp?: string | number;
  /** Conversational input payload — rendered when present. */
  input?: unknown;
  /** Conversational output payload — rendered when present. */
  output?: unknown;
  /**
   * Attachment blob references — ALWAYS stripped; never rendered.
   * Accepted on the type so callers can pass full span objects.
   */
  blobRefs?: unknown;
  /**
   * Cost / duration / token metrics — ALWAYS stripped; never rendered.
   * Accepted on the type so callers can pass full span objects.
   */
  metrics?: unknown;
  /** Any additional fields are accepted and silently ignored. */
  [key: string]: unknown;
}

/** Options for {@link preprocessTraceToText}. */
export interface TracePreprocessorOptions {
  /**
   * Maximum number of tokens the output may contain. Converted to a char
   * budget via `tokenLimit × CHARS_PER_TOKEN`. Defaults to
   * {@link TRACE_PREPROCESSOR_DEFAULT_TOKEN_LIMIT} (128 000).
   */
  tokenLimit?: number;
}

/**
 * Render a trace's spans to a single bounded readable text string.
 *
 * - Builds a parent→child tree from `parentId`; root = `!parentId`.
 * - Walks depth-first; siblings sorted by `timestamp`, then insertion index.
 * - Strips `blobRefs` and `metrics` — neither ever appears in the output.
 * - Truncates at a UTF-16 code-unit boundary when the char budget is exceeded.
 *
 * The result is **deterministic**: identical inputs always produce identical
 * bytes. No timestamps, span IDs, or random values are injected.
 */
export function preprocessTraceToText(
  spans: readonly TracePreprocessorSpan[],
  options: TracePreprocessorOptions = {},
): string {
  const tokenLimit =
    options.tokenLimit ?? TRACE_PREPROCESSOR_DEFAULT_TOKEN_LIMIT;
  const charBudget = tokenLimit * CHARS_PER_TOKEN;

  // --- Build tree ---
  // childrenById: parentId → sorted child entries.
  // roots: spans where !parentId.
  const childrenById = new Map<
    string,
    { span: TracePreprocessorSpan; index: number }[]
  >();
  const roots: { span: TracePreprocessorSpan; index: number }[] = [];

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const parentId = span.parentId;
    if (!parentId) {
      roots.push({ span, index: i });
    } else {
      const list = childrenById.get(parentId);
      if (list) list.push({ span, index: i });
      else childrenById.set(parentId, [{ span, index: i }]);
    }
  }

  // Sort each sibling group: timestamp ascending, then stable insertion index.
  const sortSiblings = (
    arr: { span: TracePreprocessorSpan; index: number }[],
  ): void => {
    arr.sort((a, b) => {
      const ta = a.span.timestamp ?? 0;
      const tb = b.span.timestamp ?? 0;
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return a.index - b.index;
    });
  };

  sortSiblings(roots);
  for (const [, children] of childrenById) {
    sortSiblings(children);
  }

  // Fallback: when no true root exists, treat the first span as root.
  const rootEntries =
    roots.length > 0
      ? roots
      : spans.length > 0
        ? [{ span: spans[0], index: 0 }]
        : [];

  // --- Depth-first walk ---
  const lines: string[] = [];
  const visited = new Set<string>();

  const visit = (span: TracePreprocessorSpan, depth: number): void => {
    // Cycle guard: skip any span whose id we've already processed.
    const spanId = span.id;
    if (spanId != null && spanId !== "") {
      if (visited.has(spanId)) return;
      visited.add(spanId);
    }

    const indent = "  ".repeat(depth);

    // Header: "GENERATION — my-prompt" or just "Span" as fallback.
    const parts = [span.type, span.name].filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    );
    const label = parts.length > 0 ? parts.join(" — ") : "Span";
    lines.push(`${indent}[${label}]`);

    // Input: rendered only when present; blobRefs/metrics never rendered.
    if (isPresent(span.input)) {
      lines.push(`${indent}  Input: ${renderPayload(span.input)}`);
    }

    // Output: rendered only when present.
    if (isPresent(span.output)) {
      lines.push(`${indent}  Output: ${renderPayload(span.output)}`);
    }

    // Recurse into children (only possible when the span has a non-empty id).
    const children =
      spanId != null && spanId !== "" ? (childrenById.get(spanId) ?? []) : [];
    for (const { span: child } of children) {
      visit(child, depth + 1);
    }
  };

  for (const { span } of rootEntries) {
    visit(span, 0);
  }

  const raw = lines.join("\n");

  // --- Truncation ---
  return truncateToCharBudget(raw, charBudget);
}

/** True when a payload is non-null, non-undefined, and non-empty-string. */
function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.length > 0;
  return true;
}

/**
 * Serialize a payload to a readable string. Strings pass through; objects and
 * arrays are compact-JSON encoded; any `JSON.stringify` failure falls back to
 * `String()`.
 */
function renderPayload(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Truncate `text` to at most `budget` UTF-16 code units, backing up one unit
 * if the cut falls inside a surrogate pair. Appends {@link TRUNCATED_MARKER}
 * when the text was trimmed.
 */
function truncateToCharBudget(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const markerLen = TRUNCATED_MARKER.length;
  const cutAt = Math.max(0, budget - markerLen);
  // Back up if `cutAt` splits a surrogate pair (high surrogate at cutAt - 1).
  const code = cutAt > 0 ? text.charCodeAt(cutAt - 1) : NaN;
  const safeAt = code >= 0xd800 && code <= 0xdbff ? cutAt - 1 : cutAt;
  return text.slice(0, safeAt) + TRUNCATED_MARKER;
}
