---
'@agentmark-ai/sdk': minor
---

Rename trace API to span/observe semantics. **Breaking** for consumers of the previous tracing surface.

- Renamed `trace` → `span`
- Renamed `TraceContext` → `SpanContext`, `TraceOptions` → (folded into `SpanOptions`), `TraceResult` → `SpanResult`
- Added `observe` higher-order helper, `SpanKind` enum, and `serializeValue` utility
- New internal modules `trace/traced.ts` and `trace/serialize.ts`

This change landed in source via sync #535 (2026-04-03) but was missed by the upstream-sync release pipeline — no version plan was generated alongside the source change, so the bump never made it onto npm. Consumers on `@agentmark-ai/sdk@1.0.7` should migrate `trace`/`TraceContext` imports to `span`/`SpanContext` when upgrading to this release.
