---
'@agentmark-ai/shared-utils': patch
---

Remove `preprocessTraceToText` and its types (`TracePreprocessorSpan`,
`TracePreprocessorOptions`, `TRACE_PREPROCESSOR_DEFAULT_TOKEN_LIMIT`) from
`@agentmark-ai/shared-utils`. The trace preprocessor (Trace Topics Stage 1)
has moved to `@repo/trace-topics`. No consumer imported it, so dropping the
export is non-breaking.
