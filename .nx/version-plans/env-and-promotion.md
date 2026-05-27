---
"@agentmark-ai/api-types": minor
"@agentmark-ai/api-schemas": minor
"@agentmark-ai/cli": minor
---

Environment-scoped types + alerts schema extension + regenerated CLI OpenAPI spec, accompanying features 054 (Environments & Promotion) and 055 (Environment-Centric Navigation).

- `api-types`: types updated to surface environment context on resources that gain env scoping (trace / score / session env-tagging; environment lifecycle; promotion history).
- `api-schemas`: `alert` create/read schemas gain an optional, nullable `environment_id` so an alert can be scoped to a single environment of an app (NULL = app-wide, the existing behaviour). Backwards-compatible — every existing producer/consumer continues to round-trip without the field.
- `cli`: bundled `openapi-spec.json` regenerated to include the new `/v1/environments/*` and promote/rollback routes shipping with 054; minor cleanup in `index.ts`.
