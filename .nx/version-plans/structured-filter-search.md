---
'@agentmark-ai/api-schemas': minor
'@agentmark-ai/api-types': minor
'@agentmark-ai/cli': minor
---

feat(search): structured JSON filter schemas for the v2 search endpoints

New `filters` schemas (`FilterLeafSchema`, `FilterOrGroupSchema`,
`FilterNodeSchema`) and search body schemas (`TracesSearchBodySchema`,
`SpansSearchBodySchema`, `ScoresSearchBodySchema`) backing
`POST /v1/{traces|spans|scores}/search`, plus
`FilterSchemaResponseSchema` for the `GET /v1/filter-schema` discovery
endpoint. Operators reuse the canonical `AnalyticsFilter` vocabulary and
add JSON-only `in` / `notIn` / `between`. `ScoresParams` gains an optional
`filters?: AnalyticsFilterNode[]` (api-types) — existing callers are
unaffected.

The local dev server (`agentmark dev`) serves `GET /v1/filter-schema` from
the same shared tables (identical contract to cloud by construction) and
answers the `POST /search` endpoints with a structured
`501 not_available_locally` until the local SQLite filter compiler lands.
