---
'@agentmark-ai/shared-utils': minor
'@agentmark-ai/api-schemas': minor
'@agentmark-ai/cli': minor
'@agentmark-ai/ui-components': minor
---

Trace-list I/O preview parity for self-hosted / OSS.

The trace list now shows a truncated input/output snippet under each trace name
(the way the cloud dashboard already does, mirroring Langfuse/LangSmith), so you
can scan what a run sent and received without opening each trace. Previously this
lived only in the cloud dashboard; the public `/v1/traces` wire shape, the local
dev server, and the OSS `TracesList` had no preview.

- **shared-utils**: new canonical `attachTraceIOPreviews(traces, rows)` plus the
  `TRACE_IO_PREVIEW_MAX_CHARS` (160) cut — the ONE "rows → one preview per trace"
  step (root span wins, GENERATION fallback via `deriveTraceIO`). Shared by the
  cloud trace service and the local CLI server so the two can never derive a
  preview differently.
- **api-schemas**: `TraceResponseSchema` gains optional, nullable
  `input_preview` / `output_preview` on the `/v1/traces` list wire shape
  (additive — existing consumers are unaffected).
- **cli**: the local dev server derives the preview from each page's root +
  GENERATION spans (a bounded `TraceId IN (…)` SQLite read, truncated in SQL so a
  large chat history never lands in memory) and emits the two new wire fields.
  Best-effort — a preview-query failure degrades to "no preview", never fails the
  list.
- **ui-components**: `TracesList` renders the input/output preview lines under the
  trace name (input in `text.secondary`, output in the dimmer `text.disabled`,
  each clamped to a single line with the full text in the `title`).
