---
"@agentmark-ai/api-schemas": minor
"@agentmark-ai/api-types": minor
"@agentmark-ai/cli": minor
---

**`/v1/requests` endpoint on the local dev server:**

- `@agentmark-ai/api-schemas`: New `schemas/requests.ts` module — `RequestsListParamsSchema` (pagination) plus `RequestResponseSchema` / `RequestsListResponseSchema` (`{ data, pagination }` envelope) describing the per-request (GENERATION-span) record. Additive — no changes to existing schemas.
- `@agentmark-ai/api-types`: Regenerated to include the new request types derived from the schemas above.
- `@agentmark-ai/cli`: Local dev server now serves `GET /v1/requests`, returning the canonical paginated envelope from the local trace store (the dashboard's "Requests" page is now backed by a real route instead of always 404-ing to an empty list). Internals: the former `local-prompt-logs-service` is renamed to `local-requests-service`, with matching `toRequestsListWire` wire mappers and an `openapi-spec.json` entry for `/v1/requests`.
