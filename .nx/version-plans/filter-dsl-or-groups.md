---
'@agentmark-ai/api-types': minor
'@agentmark-ai/api-schemas': minor
---

feat(filters): one-level OR-groups in analytics filters

`AnalyticsFilterOrGroup` / `AnalyticsFilterNode` (plus the
`isAnalyticsFilterOrGroup` guard) model a parenthesized disjunction of leaf
predicates inside an otherwise AND-combined filter list (conjunctive normal
form, one level deep). `TracesParams.filters` widens to
`AnalyticsFilterNode[]` — plain `AnalyticsFilter[]` callers are unaffected.
The `filter` query param on `GET /v1/traces` and `GET /v1/spans` gains the
matching grammar: `(a = 1 or b = 2) and c = 3` (`or` only inside parens,
`and` only outside; groups do not nest).
