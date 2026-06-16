---
'@agentmark-ai/api-types': minor
---

Add optional `inputPreview` / `outputPreview` fields to `TraceSummary` (the trace-list row shape) — truncated trace-level I/O (root span, GENERATION fallback) so list views can show an input/output snippet per row. Removes the short-lived `model` field (a trace spans many models; model is a per-span property surfaced in the trace detail, not the trace row).
