---
'@agentmark-ai/shared-utils': minor
---

Add `preprocessTraceToText` — trace preprocessor for Trace Topics Stage 1.

A pure, deterministic function that renders a trace's span tree to bounded,
readable text for downstream facet summarisation. No model calls, no storage
writes, no I/O.

- **Tree from `parentId`**: root = `!parentId` (same rule as `deriveTraceIO`);
  siblings sorted by `timestamp` with stable insertion-index tie-break;
  depth-first walk with cycle and orphan guards.
- **Strips attachments and metrics**: `blobRefs` and `metrics` are accepted on
  `TracePreprocessorSpan` but never rendered — callers can pass full span
  objects without pre-stripping.
- **Token-aware truncation**: char-budget estimate (`tokenLimit × 4 chars`),
  default 128 K tokens; hard-truncated at a UTF-16 code-unit / surrogate-pair
  boundary with a `…[truncated]` marker.
- **Deterministic**: no timestamps, span IDs, or random values injected into
  the output — identical inputs always produce identical bytes.
- Exports `preprocessTraceToText`, `TRACE_PREPROCESSOR_DEFAULT_TOKEN_LIMIT`,
  and the `TracePreprocessorSpan` / `TracePreprocessorOptions` interfaces from
  the `@agentmark-ai/shared-utils` barrel.
