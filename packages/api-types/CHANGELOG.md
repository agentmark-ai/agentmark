## 0.10.0 (2026-06-18)

### 🚀 Features

- Add an optional `dataType` field to `ScoreAggregation` so the score analytics UI can render type-appropriate aggregation (proportion for boolean, mean for numeric/categorical) and label each score by its persisted data type. ([#803](https://github.com/agentmark-ai/agentmark/pull/803))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.9.0

## 0.9.1 (2026-06-16)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.8.0

## 0.9.0 (2026-06-16)

### 🚀 Features

- Add optional `inputPreview` / `outputPreview` fields to `TraceSummary` (the trace-list row shape) — truncated trace-level I/O (root span, GENERATION fallback) so list views can show an input/output snippet per row. Removes the short-lived `model` field (a trace spans many models; model is a per-span property surfaced in the trace detail, not the trace row). ([#782](https://github.com/agentmark-ai/agentmark/pull/782))

## 0.8.1 (2026-06-15)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.7.0

## 0.8.0 (2026-06-12)

### 🚀 Features

- feat(analytics): optional `env` scope on `AggregateRequestsParams` ([#764](https://github.com/agentmark-ai/agentmark/pull/764))

  `AggregateRequestsParams` gains an optional `env?: EnvironmentQueryScope`
  field so dimension-grouped request aggregations can be scoped to a single
  environment (with the default-env legacy-row rule) instead of silently
  summing every environment's traffic. Omitting the field preserves the
  previous unscoped behaviour, so existing callers are unaffected.

## 0.7.0 (2026-06-11)

### 🚀 Features

- feat(search): structured JSON filter schemas for the v2 search endpoints ([#753](https://github.com/agentmark-ai/agentmark/pull/753))

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

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.6.0

## 0.6.0 (2026-06-11)

### 🚀 Features

- feat(filters): one-level OR-groups in analytics filters ([#750](https://github.com/agentmark-ai/agentmark/pull/750))

  `AnalyticsFilterOrGroup` / `AnalyticsFilterNode` (plus the
  `isAnalyticsFilterOrGroup` guard) model a parenthesized disjunction of leaf
  predicates inside an otherwise AND-combined filter list (conjunctive normal
  form, one level deep). `TracesParams.filters` widens to
  `AnalyticsFilterNode[]` — plain `AnalyticsFilter[]` callers are unaffected.
  The `filter` query param on `GET /v1/traces` and `GET /v1/spans` gains the
  matching grammar: `(a = 1 or b = 2) and c = 3` (`or` only inside parens,
  `and` only outside; groups do not nest).

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.5.0

## 0.5.0 (2026-06-10)

### 🚀 Features

- Link prompt version (commit sha) to traces on regular prompt runs: the gateway/CLI dev server stamp the served-at commit into agentmark_meta.commit_sha, the runner threads it through PromptSpanParams, and the SDK span hooks emit it as metadata.commit_sha alongside the new agentmark.prompt_name attribute. ([#738](https://github.com/agentmark-ai/agentmark/pull/738))

## 0.4.0 (2026-06-05)

### 🚀 Features

- Environment-scoped types + alerts schema extension + regenerated CLI OpenAPI spec, accompanying features 054 (Environments & Promotion) and 055 (Environment-Centric Navigation). ([#631](https://github.com/agentmark-ai/agentmark/pull/631))

  - `api-types`: types updated to surface environment context on resources that gain env scoping (trace / score / session env-tagging; environment lifecycle; promotion history).
  - `api-schemas`: `alert` create/read schemas gain an optional, nullable `environment_id` so an alert can be scoped to a single environment of an app (NULL = app-wide, the existing behaviour). Backwards-compatible — every existing producer/consumer continues to round-trip without the field.
  - `cli`: bundled `openapi-spec.json` regenerated to include the new `/v1/environments/*` and promote/rollback routes shipping with 054; minor cleanup in `index.ts`.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.4.0

## 0.3.0 (2026-05-21)

### 🚀 Features

- **`/v1/requests` endpoint on the local dev server:** ([#606](https://github.com/agentmark-ai/agentmark/pull/606))

  - `@agentmark-ai/api-schemas`: New `schemas/requests.ts` module — `RequestsListParamsSchema` (pagination) plus `RequestResponseSchema` / `RequestsListResponseSchema` (`{ data, pagination }` envelope) describing the per-request (GENERATION-span) record. Additive — no changes to existing schemas.
  - `@agentmark-ai/api-types`: Regenerated to include the new request types derived from the schemas above.
  - `@agentmark-ai/cli`: Local dev server now serves `GET /v1/requests`, returning the canonical paginated envelope from the local trace store (the dashboard's "Requests" page is now backed by a real route instead of always 404-ing to an empty list). Internals: the former `local-prompt-logs-service` is renamed to `local-requests-service`, with matching `toRequestsListWire` wire mappers and an `openapi-spec.json` entry for `/v1/requests`.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.3.0

## 0.2.0 (2026-05-12)

### 🚀 Features

- **`/v1/requests` endpoint on the local dev server:** ([#591](https://github.com/agentmark-ai/agentmark/pull/591), [#587](https://github.com/agentmark-ai/agentmark/issues/587))

  - `@agentmark-ai/api-schemas`: New `schemas/requests.ts` module — `RequestsListParamsSchema` (pagination) plus `RequestResponseSchema` / `RequestsListResponseSchema` (`{ data, pagination }` envelope) describing the per-request (GENERATION-span) record. Additive — no changes to existing schemas.
  - `@agentmark-ai/api-types`: Regenerated to include the new request types derived from the schemas above.
  - `@agentmark-ai/cli`: Local dev server now serves `GET /v1/requests`, returning the canonical paginated envelope from the local trace store (the dashboard's "Requests" page is now backed by a real route instead of always 404-ing to an empty list). Internals: the former `local-prompt-logs-service` is renamed to `local-requests-service`, with matching `toRequestsListWire` wire mappers and an `openapi-spec.json` entry for `/v1/requests`.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.2.0

## 0.1.0 (2026-05-12)

### 🚀 Features

- **REST API for managed deployments (spec 053):** ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/api-schemas`: New `schemas/deployments.ts` module with Zod schemas for managed deployment resources (additive — no breaking changes to existing schemas).
  - `@agentmark-ai/api-types`: Regenerated to include the new deployment types.
  - `@agentmark-ai/cli`: Local dev server now serves the deployment endpoints (cloud-only behavior returns 501 stubs); `openapi-spec.json` extended with deployment routes for consumers of the spec.

- Add `?name=X` lookup to `/v1/prompts` (gateway + OSS): ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/api-schemas`: New `ListPromptsQuerySchema` accepting an optional `name` param, plus `ListPromptsBodySchema` (`{ paths: string[] }`) and `ListPromptsResponseSchema` envelope so consumers can resolve prompts by name without scanning a list.
  - `@agentmark-ai/api-types`: Regenerated to include the new query/response types.
  - `@agentmark-ai/cli`: Local dev server's `GET /v1/prompts` now accepts an optional `?name=X` query param and returns matching paths (single-element array on convention-match, possibly more on frontmatter scan).

- **REST API parity (spec 052):** ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/api-schemas`: New Zod schemas for `score-configs` and `api-keys`. Extended `spans` with `start_date`, `end_date`, `user_id`, `session_id`, `filter` (JSON DSL). Added `session_id` to `scores`. Added `assigned_to_me` to `annotation-queues`. New canonical `DatasetSchema` + `DatasetsListParamsSchema`/`DatasetsListResponseSchema` for `/v1/datasets`. **Breaking:** `/v1/datasets` now returns the canonical `{ data: [{ name, row_count, created_at }], pagination }` envelope and accepts `name`/`limit`/`offset` query params. The legacy flat-shape response (`{ datasets: string[] }`) and `LegacyDatasetsListResponseSchema` are removed.
  - `@agentmark-ai/api-types`: Regenerated to include the new schema-derived types.
  - `@agentmark-ai/cli`: Local dev server now serves `GET /v1/score-configs` and `GET /v1/score-configs/{name}` from the local `agentmark.json`. Added 501 stubs for `/v1/api-keys` (cloud-only). **Breaking:** local `GET /v1/datasets` upgraded to the canonical paginated envelope (matches the cloud change). The dashboard `getDatasets()` helper now calls the new endpoint and extracts `name` from each row.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.1.0