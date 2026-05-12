---
"@agentmark-ai/sdk": patch
---

Isolate the AgentMark tracer so it coexists with Sentry / other OpenTelemetry SDKs in the same process. Previously, registering AgentMark could clobber an existing global tracer provider (or vice-versa), causing both instrumentations to drop spans. The SDK now scopes its tracer to its own provider and only writes to the global as a fallback when none is set.
