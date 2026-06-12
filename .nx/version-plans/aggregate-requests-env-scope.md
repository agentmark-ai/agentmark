---
'@agentmark-ai/api-types': minor
---

feat(analytics): optional `env` scope on `AggregateRequestsParams`

`AggregateRequestsParams` gains an optional `env?: EnvironmentQueryScope`
field so dimension-grouped request aggregations can be scoped to a single
environment (with the default-env legacy-row rule) instead of silently
summing every environment's traffic. Omitting the field preserves the
previous unscoped behaviour, so existing callers are unaffected.
