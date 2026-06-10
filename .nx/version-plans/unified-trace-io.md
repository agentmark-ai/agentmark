---
'@agentmark-ai/shared-utils': minor
'@agentmark-ai/cli': patch
---

feat(observability): one canonical trace-level I/O derivation, shared by every read path

Adds `deriveTraceIO` to shared-utils — the single definition of "what is a
trace's input/output": the root prompt-run span's
`agentmark.input`/`agentmark.output` (written by the WebhookRunner) wins,
falling back per-field to the first GENERATION span's input / last
GENERATION span's output in timestamp order. Previously three call sites
each had their own semantics (cloud: first/last GENERATION only; CLI trace
detail: first/last GENERATION only; CLI dataset import-from-traces: root
span only), so the same trace answered differently per endpoint.

Consumers updated: cloud gateway `transformTraceDetail`, CLI
`mapRawTraceToDetail` (`GET /v1/traces/:id`), and the CLI's
`normalizeLocalTraceSource` (dataset import). The AgentMark OTel
transformer now also parses `agentmark.input` JSON messages arrays (the
runner's format) instead of wrapping them as a single user message.

Doctor's traceShape fix text now points at instrumentation/the runner
instead of telling users to fix their executor (which cannot set trace
I/O). Docs (observe/tracing-setup) and the skill document the derivation.
