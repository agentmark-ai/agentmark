---
'agentmark-sdk': minor
---

Add a framework-agnostic trace-grouping API to the Python SDK — the twin of `@agentmark-ai/otel` — so Python reaches parity with TypeScript for grouping traces by session, user, and metadata. `with_agentmark(session_id=..., user_id=..., tags=..., metadata=...)` is a context manager that stashes the grouping in the OpenTelemetry context (merging over any enclosing scope, inner fields winning); `AgentMarkGroupingProcessor` stamps those `agentmark.*` attributes onto every span started in the scope (sync or async, with concurrent scopes isolated via contextvars), and `init_tracing()` now registers it automatically. The pure mapping `to_agentmark_attributes(...)` is conformance-locked against `conformance-vectors/grouping-attributes.json`, producing byte-identical compact-JSON output to the TypeScript helper.
