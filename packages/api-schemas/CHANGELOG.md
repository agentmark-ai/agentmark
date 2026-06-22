## 0.10.0 (2026-06-22)

### 🚀 Features

- Size-driven blob offload for trace I/O (multimodal output support). ([#809](https://github.com/agentmark-ai/agentmark/pull/809))

  Oversized span fields (image/audio/large text output, large inputs, tool calls)
  are lifted to object storage at ingest; ClickHouse keeps an 8KB inline preview
  plus a `BlobRefs` pointer, so the 128KB queue-message limit never truncates a
  generation. Full-fidelity consumers fetch the full value back on demand.

  - **api-types**: `Span` / `SpanIO` gain an optional `blobRefs` (JSON array of
    offloaded-field pointers); `ExperimentItemSummary` gains an optional
    `blobRefs` so the experiment-detail path can rehydrate offloaded item I/O.
    All additive — existing consumers are unaffected.
  - **api-schemas**: `ExperimentItemSummarySchema` gains an optional `blobRefs`
    (the gateway rehydrates the full value into `input`/`output` before
    responding, so consumers may ignore it).
  - **prompt-core**: the webhook runner records image/speech generation output via
    `setSpanOutput` (the `agentmark.output` attribute) so generated media is
    captured on the span and offloaded like any other oversized field.
  - **ui-components**: the trace drawer's Input/Output tab renders every offloaded
    field — image/audio inline (data URIs), full text/JSON otherwise — fetched on
    demand via the host-provided `fetchBlob`; `OutputObject` is deduped when
    `Output` is also offloaded.

## 0.9.0 (2026-06-18)

### 🚀 Features

- Align the score `source` enum with `experiment | annotation | api`. `SCORE_SOURCE_TYPES` (api-schemas) now validates the public score-write API against those three values and defaults an omitted source to `"api"` (was `"eval"`); the legacy `"eval"` value is no longer accepted on write. `score()` (TS + Python SDK) sends `source`, defaulting to `"api"`. Both experiment score-writers stamp `source: "experiment"`: the SDK `runExperiment` eval loop and the CLI `agentmark run-experiment` score POST. ui-components `ScoreData.source` widened to match (`"eval"` kept only as a legacy display value for historical rows). ([#803](https://github.com/agentmark-ai/agentmark/pull/803))

## 0.8.0 (2026-06-16)

### 🚀 Features

- Trace-list I/O preview parity for self-hosted / OSS. ([#787](https://github.com/agentmark-ai/agentmark/pull/787))

  The trace list now shows a truncated input/output snippet under each trace name
  (the way the cloud dashboard already does, mirroring Langfuse/LangSmith), so you
  can scan what a run sent and received without opening each trace. Previously this
  lived only in the cloud dashboard; the public `/v1/traces` wire shape, the local
  dev server, and the OSS `TracesList` had no preview.

  - **shared-utils**: new canonical `attachTraceIOPreviews(traces, rows)` plus the
    `TRACE_IO_PREVIEW_MAX_CHARS` (160) cut — the ONE "rows → one preview per trace"
    step (root span wins, GENERATION fallback via `deriveTraceIO`). Shared by the
    cloud trace service and the local CLI server so the two can never derive a
    preview differently.
  - **api-schemas**: `TraceResponseSchema` gains optional, nullable
    `input_preview` / `output_preview` on the `/v1/traces` list wire shape
    (additive — existing consumers are unaffected).
  - **cli**: the local dev server derives the preview from each page's root +
    GENERATION spans (a bounded `TraceId IN (…)` SQLite read, truncated in SQL so a
    large chat history never lands in memory) and emits the two new wire fields.
    Best-effort — a preview-query failure degrades to "no preview", never fails the
    list.
  - **ui-components**: `TracesList` renders the input/output preview lines under the
    trace name (input in `text.secondary`, output in the dimmer `text.disabled`,
    each clamped to a single line with the full text in the `title`).

## 0.7.0 (2026-06-15)

### 🚀 Features

- Add optional `environment_name` to the create-API-key request schema and surface `environment_id` on the API-key read schema. Lets a caller mint a key for a specific environment by name (resolved + validated server-side by the gateway) and see which environment a key is bound to. The MCP `create_api_key` tool picks up the new field automatically from the OpenAPI schema. ([#779](https://github.com/agentmark-ai/agentmark/pull/779))

## 0.6.0 (2026-06-11)

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

## 0.5.0 (2026-06-11)

### 🚀 Features

- feat(experiments): placeholder states (`running` / `stalled`) on experiment summaries ([#749](https://github.com/agentmark-ai/agentmark/pull/749))

  `ExperimentSummarySchema` gains an optional `status` field so a backend can
  surface a dispatched run whose spans haven't landed in analytics storage yet:
  `"running"` while data is expected, `"stalled"` when none arrived (telemetry
  likely not configured). The experiments list renders both as placeholders —
  a status label next to the name, no stats, not clickable, excluded from
  selection/compare and charts. Stalled rows render a warning label with an
  explanatory tooltip and, when the new optional `onDismissExperiment` prop is
  provided, a dismiss button. Rows without `status` render exactly as before,
  so existing consumers are unaffected.

- feat(filters): one-level OR-groups in analytics filters ([#750](https://github.com/agentmark-ai/agentmark/pull/750))

  `AnalyticsFilterOrGroup` / `AnalyticsFilterNode` (plus the
  `isAnalyticsFilterOrGroup` guard) model a parenthesized disjunction of leaf
  predicates inside an otherwise AND-combined filter list (conjunctive normal
  form, one level deep). `TracesParams.filters` widens to
  `AnalyticsFilterNode[]` — plain `AnalyticsFilter[]` callers are unaffected.
  The `filter` query param on `GET /v1/traces` and `GET /v1/spans` gains the
  matching grammar: `(a = 1 or b = 2) and c = 3` (`or` only inside parens,
  `and` only outside; groups do not nest).

## 0.4.0 (2026-06-05)

### 🚀 Features

- Environment-scoped types + alerts schema extension + regenerated CLI OpenAPI spec, accompanying features 054 (Environments & Promotion) and 055 (Environment-Centric Navigation). ([#631](https://github.com/agentmark-ai/agentmark/pull/631))

  - `api-types`: types updated to surface environment context on resources that gain env scoping (trace / score / session env-tagging; environment lifecycle; promotion history).
  - `api-schemas`: `alert` create/read schemas gain an optional, nullable `environment_id` so an alert can be scoped to a single environment of an app (NULL = app-wide, the existing behaviour). Backwards-compatible — every existing producer/consumer continues to round-trip without the field.
  - `cli`: bundled `openapi-spec.json` regenerated to include the new `/v1/environments/*` and promote/rollback routes shipping with 054; minor cleanup in `index.ts`.

## 0.3.0 (2026-05-21)

### 🚀 Features

- **`/v1/requests` endpoint on the local dev server:** ([#606](https://github.com/agentmark-ai/agentmark/pull/606))

  - `@agentmark-ai/api-schemas`: New `schemas/requests.ts` module — `RequestsListParamsSchema` (pagination) plus `RequestResponseSchema` / `RequestsListResponseSchema` (`{ data, pagination }` envelope) describing the per-request (GENERATION-span) record. Additive — no changes to existing schemas.
  - `@agentmark-ai/api-types`: Regenerated to include the new request types derived from the schemas above.
  - `@agentmark-ai/cli`: Local dev server now serves `GET /v1/requests`, returning the canonical paginated envelope from the local trace store (the dashboard's "Requests" page is now backed by a real route instead of always 404-ing to an empty list). Internals: the former `local-prompt-logs-service` is renamed to `local-requests-service`, with matching `toRequestsListWire` wire mappers and an `openapi-spec.json` entry for `/v1/requests`.

## 0.2.0 (2026-05-12)

### 🚀 Features

- **`/v1/requests` endpoint on the local dev server:** ([#591](https://github.com/agentmark-ai/agentmark/pull/591), [#587](https://github.com/agentmark-ai/agentmark/issues/587))

  - `@agentmark-ai/api-schemas`: New `schemas/requests.ts` module — `RequestsListParamsSchema` (pagination) plus `RequestResponseSchema` / `RequestsListResponseSchema` (`{ data, pagination }` envelope) describing the per-request (GENERATION-span) record. Additive — no changes to existing schemas.
  - `@agentmark-ai/api-types`: Regenerated to include the new request types derived from the schemas above.
  - `@agentmark-ai/cli`: Local dev server now serves `GET /v1/requests`, returning the canonical paginated envelope from the local trace store (the dashboard's "Requests" page is now backed by a real route instead of always 404-ing to an empty list). Internals: the former `local-prompt-logs-service` is renamed to `local-requests-service`, with matching `toRequestsListWire` wire mappers and an `openapi-spec.json` entry for `/v1/requests`.

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


### 🩹 Fixes

- **License change: MIT → AGPL-3.0-or-later.** ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  The runtime code is byte-identical to the previous patch release — only the
  `LICENSE.md` file and the `license` field in each `package.json` change. Bumping
  as a patch (not a major) because no compile/runtime behavior is affected.

  **Downstream impact (please read before upgrading):** AGPL-3.0 has copyleft
  and network-use obligations that MIT does not. Consumers using these packages
  in proprietary or SaaS products may need to evaluate compatibility before
  upgrading. Users who need the MIT terms can pin to the last MIT-licensed
  release of each package.

- Initial release of @agentmark-ai/api-schemas: shared Zod schemas + canonical error envelope for the AgentMark public API. Consumed by apps/gateway, apps/tenant-dashboard, and @agentmark-ai/cli. Replaces the former @repo/api-contract workspace package. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))