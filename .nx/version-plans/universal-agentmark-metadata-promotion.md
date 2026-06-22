---
'@agentmark-ai/shared-utils': patch
---

Universally promote custom metadata from `agentmark.metadata.*` to the trace's metadata on any span scope, joining the existing universal promotion of `agentmark.session_id` / `user_id` / `session_name` / `trace_name` (and the `gen_ai.conversation.id` session fallback). This lets context-propagated grouping from `@agentmark-ai/otel` and the AgentMark Python SDK carry custom metadata regardless of the instrumentation that created the span (OpenInference, raw OpenTelemetry, …), not just spans whose scope transformer happens to parse metadata.
