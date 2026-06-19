---
'@agentmark-ai/api-types': minor
'@agentmark-ai/api-schemas': minor
'@agentmark-ai/prompt-core': minor
'@agentmark-ai/ui-components': minor
---

Size-driven blob offload for trace I/O (multimodal output support).

Oversized span fields (image/audio/large text output, large inputs, tool calls)
are lifted to object storage at ingest; ClickHouse keeps an 8KB inline preview
plus a `BlobRefs` pointer, so the 128KB queue-message limit never truncates a
generation. Full-fidelity consumers fetch the full value back on demand.

- **api-types**: `Span` / `SpanIO` gain an optional `blobRefs` (JSON array of
  offloaded-field pointers); `ExperimentItemSummary` gains an optional
  `blobRefs` so the experiment-detail path can rehydrate offloaded item I/O.
  All additive — existing consumers are unaffected.
- **api-schemas**: `ExperimentItemSummarySchema` gains an optional `blobRefs`
  (the gateway rehydrates the full value into `input`/`output` before
  responding, so consumers may ignore it).
- **prompt-core**: the webhook runner records image/speech generation output via
  `setSpanOutput` (the `agentmark.output` attribute) so generated media is
  captured on the span and offloaded like any other oversized field.
- **ui-components**: the trace drawer's Input/Output tab renders every offloaded
  field — image/audio inline (data URIs), full text/JSON otherwise — fetched on
  demand via the host-provided `fetchBlob`; `OutputObject` is deduped when
  `Output` is also offloaded.
