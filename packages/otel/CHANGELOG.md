## 0.2.0 (2026-06-22)

### 🚀 Features

- Add `@agentmark-ai/otel`: a framework-agnostic OpenTelemetry helper that groups AgentMark traces by session, user, tags, and custom metadata. `withAgentMark(grouping, fn)` propagates the grouping through the OpenTelemetry context; `AgentMarkSpanProcessor` stamps it onto every span in that scope (using `agentmark.*` keys the normalizer promotes universally, for any span scope) and batches them to AgentMark's OTLP endpoint. Restores session/user/metadata grouping for Vercel AI SDK v7 users — where `telemetry.metadata` no longer reaches spans — and works for any OpenTelemetry-instrumented spans, not just AI SDK calls. ([#816](https://github.com/agentmark-ai/agentmark/pull/816))