## 0.13.0 (2026-05-12)

### 🚀 Features

- Add POST /v1/scores/batch endpoint for bulk score ingestion (up to 1000 scores per request, 207-style per-item results). ([#583](https://github.com/agentmark-ai/agentmark/pull/583))
- **REST API for managed deployments (spec 053):** ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/api-schemas`: New `schemas/deployments.ts` module with Zod schemas for managed deployment resources (additive — no breaking changes to existing schemas).
  - `@agentmark-ai/api-types`: Regenerated to include the new deployment types.
  - `@agentmark-ai/cli`: Local dev server now serves the deployment endpoints (cloud-only behavior returns 501 stubs); `openapi-spec.json` extended with deployment routes for consumers of the spec.

- Add `?name=X` lookup to `/v1/prompts` (gateway + OSS): ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/api-schemas`: New `ListPromptsQuerySchema` accepting an optional `name` param, plus `ListPromptsBodySchema` (`{ paths: string[] }`) and `ListPromptsResponseSchema` envelope so consumers can resolve prompts by name without scanning a list.
  - `@agentmark-ai/api-types`: Regenerated to include the new query/response types.
  - `@agentmark-ai/cli`: Local dev server's `GET /v1/prompts` now accepts an optional `?name=X` query param and returns matching paths (single-element array on convention-match, possibly more on frontmatter scan).

- Add "Test prompt" button to the trace drawer, surfacing the originating prompt's name/variables directly from a span: ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/ui-components`: New `TestPromptDialog` component plus `buildRunPromptCommand` (and `singleQuoteShellEscape` helper) under `./sections/traces/components`. New `extractSpanPromptName` and `extractSpanTemplateProps` helpers in `./sections/traces/utils/extract-span-data`. All additive — existing exports unchanged.
  - `@agentmark-ai/cli`: Dashboard wires the new "Test prompt" button into the trace drawer; new `src/lib/api/prompts.ts` client + `src/lib/api/traces.ts` extensions for prompt resolution and wire-shape utilities used by the dialog.

- Implement `GET /v1/pricing` on the local dev server. Serves the bundled `@agentmark-ai/model-registry` pricing snapshot so SDK consumers pointing at `agentmark dev` see the same cost data shape they'd get from cloud. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))
- **BREAKING:** Remove `@agentmark-ai/connect` package and the CLI `--remote` flag. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - The `@agentmark-ai/connect` WebSocket client package is removed from the workspace. The package's last published version on npm (`0.2.1`) remains available for existing consumers but will not receive further updates.
  - `agentmark dev --remote` is removed; the local dev server no longer establishes a websocket back to the cloud platform. Use platform-managed deployments instead (see spec 053 / `/v1/deployments`).
  - The associated `JobHandler` and `WebSocketClient` imports in `cli-src/commands/dev.ts` are removed; the dev command no longer accepts `remote` in its options.

- **BREAKING:** Remove `agentmark export traces` command. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  The cloud gateway's `GET /v1/traces/export` endpoint has been deleted as part of the trace-API consolidation — the surface is now `GET /v1/traces` with filters, matching the industry convention (Langfuse, LangSmith, Arize). Client-side JSONL/CSV/OpenAI-format conversion is a three-line loop; see the `GET /v1/traces` docs for the replacement pattern.

- **REST API parity (spec 052):** ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/api-schemas`: New Zod schemas for `score-configs` and `api-keys`. Extended `spans` with `start_date`, `end_date`, `user_id`, `session_id`, `filter` (JSON DSL). Added `session_id` to `scores`. Added `assigned_to_me` to `annotation-queues`. New canonical `DatasetSchema` + `DatasetsListParamsSchema`/`DatasetsListResponseSchema` for `/v1/datasets`. **Breaking:** `/v1/datasets` now returns the canonical `{ data: [{ name, row_count, created_at }], pagination }` envelope and accepts `name`/`limit`/`offset` query params. The legacy flat-shape response (`{ datasets: string[] }`) and `LegacyDatasetsListResponseSchema` are removed.
  - `@agentmark-ai/api-types`: Regenerated to include the new schema-derived types.
  - `@agentmark-ai/cli`: Local dev server now serves `GET /v1/score-configs` and `GET /v1/score-configs/{name}` from the local `agentmark.json`. Added 501 stubs for `/v1/api-keys` (cloud-only). **Breaking:** local `GET /v1/datasets` upgraded to the canonical paginated envelope (matches the cloud change). The dashboard `getDatasets()` helper now calls the new endpoint and extracts `name` from each row.


### 🩹 Fixes

- Fix route-ordering bug where `GET /v1/scores/aggregations` was being caught by `GET /v1/scores/:scoreId` (returning a 404 score-not-found instead of the intended 501 cloud-only stub). ([#583](https://github.com/agentmark-ai/agentmark/pull/583))
- Build/lint fixes surfaced by the OSS Parity CI workflow (catches post-sync failures on PRs before they land): ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/ui-components`: Declare `@mui/system`, `@mui/x-data-grid`, and `@mui/x-date-pickers` as both peer- and dev-dependencies so TS `.d.ts` emission resolves these MUI internals at portable paths under the standalone install layout (yarn hoisting otherwise nests `@mui/system` under `@mui/material/node_modules/` and breaks TS2742 portability). Also add `@mui/utils@^7.3.11` as a direct devDep: `@mui/material@7.3.11` introduced internal subpath imports like `@mui/utils/useForcedRerendering` that only exist in `@mui/utils@7.3.11+`, but the root-hoisted `@mui/utils` would otherwise stay at 7.3.8 (constrained by `@mui/x-*`) and the nested `material/node_modules/@mui/utils@7.3.11` isn't visible to Vite/vitest's bare-specifier resolver — causing `Cannot find package '@mui/utils/useForcedRerendering'` failures in component tests that mount `Autocomplete`. Pinning utils at root keeps the subpath discoverable.
  - `@agentmark-ai/cli`: Apply the existing `apiRateLimiter` (renamed from `templatesRateLimiter`) to `/v1/prompts`, `/v1/config`, and `POST /v1/datasets/:datasetName/rows` to address `js/missing-rate-limiting` CodeQL alerts. Convert two `let` declarations that were never reassigned (`useForwarding`, `metadata`) to `const`. Add a targeted ESLint suppression for the same-package `openapi-spec.json` import, which `import/no-restricted-paths` misfires on.
  - `@agentmark-ai/loader-file`: Rename `vitest.config.ts` → `vitest.config.mts` so the test config loads as ESM in vitest 3.x without forcing the entire package to `type: module`.
  - `@agentmark-ai/mcp-server`: Normalize the span shape returned by `HttpDataSource.fetchSpans()` from the CLI server's flat snake_case (`trace_id`, `duration_ms`, `input_tokens`, …) to the canonical camelCase `SpanData` shape. Previously the snake_case fields fell through to consumers undefined, breaking the trace drawer and any tool reading `span.traceId`. Older mocks/tests using the nested-camelCase shape continue to work.

- Accumulated small fixes shipped through OSS: ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/ui-components`: stop rendering `[object Object]` in the experiments error alert (surface the actual error message); show the Input/Output tab on trace reopen and avoid the placeholder flash; add `traceId` to the auto-displayed synthetic root span so the lazy IO fetch fires on first render.
  - `@agentmark-ai/cli`: re-ships ui-components with the dashboard fixes above. Eval dispatch envelope handling normalized to accept both legacy and canonical shapes.
  - `@agentmark-ai/create-agentmark`: scaffolded eval handler template aligned with the canonical dispatch envelope (paired with the cli fix).
  - `@agentmark-ai/prompt-core`: internal rename `get-score-configs` → `get-evals` and removal of dead score-code paths. No exported API change.

- Harden error parser to read gateway's canonical nested error envelope ([#583](https://github.com/agentmark-ai/agentmark/pull/583))
  (`{ error: { code, message } }`). Previous flat-string shape is still
  accepted as a fallback.

- **License change: MIT → AGPL-3.0-or-later.** ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  The runtime code is byte-identical to the previous patch release — only the
  `LICENSE.md` file and the `license` field in each `package.json` change. Bumping
  as a patch (not a major) because no compile/runtime behavior is affected.

  **Downstream impact (please read before upgrading):** AGPL-3.0 has copyleft
  and network-use obligations that MIT does not. Consumers using these packages
  in proprietary or SaaS products may need to evaluate compatibility before
  upgrading. Users who need the MIT terms can pin to the last MIT-licensed
  release of each package.

- Bump `hono`, `next-intl`, and `ip-address` to satisfy Dependabot security advisories. No API or behavior changes. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))
- Periodic model-registry data sync — refreshes the bundled pricing/model snapshot served from the CLI's local `/v1/pricing` endpoint and consumed by SDKs that rely on the model-registry workspace dep. No API changes. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/model-registry to 0.2.4
- Updated @agentmark-ai/ui-components to 0.6.0
- Updated @agentmark-ai/shared-utils to 0.3.3
- Updated @agentmark-ai/api-schemas to 0.1.0
- Updated @agentmark-ai/prompt-core to 0.4.2
- Updated @agentmark-ai/templatedx to 0.3.1
- Updated @agentmark-ai/api-types to 0.1.0

## 0.12.2 (2026-04-14)

### 🩹 Fixes

- Unify scorer storage format across the eval runner and annotation UI, rename the client `scores` option back to `evals`, and refresh the model catalogue. ([#581](https://github.com/agentmark-ai/agentmark/pull/581))

  ### @agentmark-ai/prompt-core

  - `ScoreSchema.categorical.categories` is now `Array<{ label: string; value: number }>` instead of `string[]`. Each category carries its own numeric value used when posting scores. Consumers constructing categorical score configs must pass `{ label, value }` pairs.
  - New exported function `toStoredScore(schema, evalResult): StoredScore` — canonical conversion from an `EvalResult` to the ClickHouse storage shape. Used by both the UI (human annotations) and the runner (automated evals) so human and machine scores are byte-identical in storage.
  - New exported types: `CategoryValue`, `StoredScore`.
  - `DatasetStreamChunk` dropped the short-lived `scores: string[]` field; `evals: string[]` is the canonical name.

  ### @agentmark-ai/ai-sdk-v4-adapter, ai-sdk-v5-adapter, claude-agent-sdk-v0-adapter, mastra-v0-adapter

  - `createAgentMarkClient({ scores })` renamed back to `createAgentMarkClient({ evals })`. The `scores` option is removed; `evalRegistry` remains as a deprecated alias that still works.
  - Frontmatter `test_settings` no longer accepts `scores: string[]` — use `evals: string[]`.
  - Runner dataset iteration reads `item.evals` directly (previously `item.scores ?? item.evals`).

  ### @agentmark-ai/cli

  - `postExperimentScores` now threads a `dataType` field (`boolean` / `numeric` / `categorical`) through to the `/v1/score` POST body so CLI-posted experiment scores round-trip with the same shape as UI-annotated scores.
  - Dependabot bumps for 6 security advisories.
  - Added `deploy.test.ts` and `score-posting-client.test.ts` coverage.

  ### @agentmark-ai/ui-components

  - Annotation form now imports `toStoredScore` from `@agentmark-ai/prompt-core` and delegates eval-result → stored-score conversion — removes the duplicated switch/case that had silently drifted from the runner's format.
  - `AnnotationEntry` gains a required `dataType: "boolean" | "numeric" | "categorical"` field.
  - `AddAnnotationDialog.saveAnnotation` callback now receives `dataType` and forwards it.
  - `CategoricalControl` accepts `categories` as `Array<{ label: string; value: number }>` to match the new prompt-core schema.

  ### @agentmark-ai/model-registry

  - Regenerated `models.json` with the latest provider pricing and capability metadata from LiteLLM and OpenRouter.

  ### create-agentmark

  - Python template (`create-python-app.ts`, `user-client-config.ts`) updated to use the new `evals=` kwarg instead of `eval_registry=`.

  ### agentmark-prompt-core, agentmark-claude-agent-sdk-v0, agentmark-pydantic-ai-v0

  - New `evals` keyword argument on `AgentMark.__init__`, `create_agentmark()`, `create_claude_agent_client()`, and `create_pydantic_ai_client()`.
  - `eval_registry` kwarg kept as a deprecated alias — when `evals` is provided, `eval_registry` is ignored.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/model-registry to 0.2.3
- Updated @agentmark-ai/ui-components to 0.5.2
- Updated @agentmark-ai/prompt-core to 0.4.1
- Updated @agentmark-ai/connect to 0.2.1

## 0.12.1 (2026-04-13)

### 🩹 Fixes

- Restore experiment span instrumentation, score posting, and trace drawer I/O display across all adapters. Refs agentmark-ai/app#1860. ([#572](https://github.com/agentmark-ai/agentmark/pull/572))

  ### agentmark-sdk (minor)

  - New `JsonOtlpSpanExporter`: replaces the protobuf OTLP exporter (`opentelemetry-exporter-otlp-proto-http`) with a JSON exporter that sends `Content-Type: application/json` with hex trace IDs. The protobuf exporter was incompatible with the production gateway (which rejects protobuf) and caused the CLI to store trace IDs as base64 instead of hex. Wire format change — hence minor.
  - Added `py.typed` marker (PEP 561) so downstream consumers get proper mypy type checking.
  - Removed `opentelemetry-exporter-otlp-proto-http` dependency.

  ### agentmark-pydantic-ai-v0 (patch)

  - Restored `span_context(SpanOptions(...))` wrapping in `_stream_text_experiment` and `_stream_object_experiment` with all dataset attributes: `dataset_run_id`, `dataset_run_name`, `dataset_item_name` (md5 content hash), `dataset_input`, `dataset_expected_output`, `dataset_path`, `prompt_name`, `metadata={"commit_sha": commit_sha}`.
  - Dataset chunks now emit `traceId` (lowercase hex, matching OTLP JSON format).
  - Wrapper spans set `agentmark.props` (dataset input) and `agentmark.output` (model output) for trace drawer I/O display.
  - `agentmark-sdk` added as direct dependency; mypy overrides removed (SDK now ships `py.typed`).

  ### agentmark-claude-agent-sdk-v0 (patch)

  - Full span instrumentation added from scratch (was never implemented): `span_context(SpanOptions(...))` with dataset attributes, `traceId` emission, `agentmark.props`/`agentmark.output` on wrapper spans.
  - `commit_sha` parameter threading added to `run_experiment` call chain.
  - `server.py` now forwards `sampling` and `commitSha` to the handler (previously missing both).
  - `server.py` uses SDK's `JsonOtlpSpanExporter` for OTel trace export (replaces inline `_JsonOtlpExporter`).

  ### @agentmark-ai/ai-sdk-v4-adapter (patch)

  - `runExperiment` now emits `traceId` in dataset chunks (was the only TS adapter missing it).
  - Wrapper spans set `agentmark.props` and `agentmark.output` for trace drawer I/O display.

  ### @agentmark-ai/ai-sdk-v5-adapter, @agentmark-ai/mastra-v0-adapter, @agentmark-ai/claude-agent-sdk-v0-adapter (patch each)

  - Wrapper spans set `agentmark.props` and `agentmark.output` for trace drawer I/O display (traceId was already emitted by these adapters).

  ### @agentmark-ai/shared-utils (patch)

  - Removed `'commit_sha'` from `KNOWN_METADATA_FIELDS` so it flows into the custom metadata bucket. Required for the OSS CLI's SQLite experiments query (`json_extract(root.Metadata, '$.commit_sha')`) to find it. The typed `NormalizedSpan.commitSha` field is still populated via the explicit `parseMetadata` check.

  ### @agentmark-ai/cli (patch)

  - Score posting moved from server layer (core.ts `wrapStreamWithScorePosting` + Python server.py wraps) to `run-experiment.ts` client — one implementation for all adapters. Extracted `postExperimentScores` helper.
  - `getExperimentById` items SQL now returns `totalTokens` and `model` from child generation spans (was missing, page hardcoded zeros).
  - Removed `wrapStreamWithScorePosting`, `postScore`, `getApiServerUrl` from core.ts.

  ### @agentmark-ai/ui-components (patch)

  - Added `ChartErrorBoundary` around experiment charts to handle `react-apexcharts` CJS/ESM interop crashes gracefully (degrades to null instead of crashing the experiments page).
  - Normalized the lazy import to handle both `mod.default` (ESM) and `mod` (CJS) export shapes.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.5.1
- Updated @agentmark-ai/shared-utils to 0.3.2

## 0.12.0 (2026-04-09)

### 🚀 Features

- Document the `agentmark export traces` CLI feature that was previously missed for versioning. ([#559](https://github.com/agentmark-ai/agentmark/pull/559))

  Commit [`76a049ec`](https://github.com/agentmark-ai/app/commit/76a049ec) *"feat: add CLI `agentmark export traces` command and gateway test coverage"* (Phase 3 of #1819, merged to main on 2026-04-08) added a substantial new CLI command without an accompanying nx version plan, so nx release would not have picked up the change on its own.

  This plan retroactively pins a **minor** bump for `@agentmark-ai/cli` because the work is strictly additive feature surface — not a bug fix:

  - New command: `agentmark export traces` with flags `--format`, `--score`, `--since`, `--until`, `--limit`, `--dry-run`, `--output`, and filter flags
  - New score filter parsing (`correctness>=0.8` → `minScore` query param)
  - New dual-auth flow (API key from forwarding config **or** JWT from login)
  - New dry-run mode that fetches a 3-row sample and displays a summary
  - New file output handling with overwrite protection and stdout piping
  - New readable error messages for 400 / 401 / 403 / 429 responses

  Strict semver and the existing monorepo convention (see `b579c19f`) both put this at `minor` for new features.


### 🩹 Fixes

- Fix pydantic-ai-v0 webhook crash and eliminate __version__ drift across all Python packages. ([#559](https://github.com/agentmark-ai/agentmark/pull/559))

  **Pydantic webhook fix:** Restore `commit_sha` parameter threading across `run_experiment`, `_stream_experiment`, `_stream_text_experiment`, and `_stream_object_experiment` in `pydantic-ai-v0-adapter/webhook.py`. This un-breaks the `dataset-run` webhook path on main, which has been crashing with `TypeError: run_experiment() takes 5 positional arguments but 6 were given` since the server.py dispatcher was updated to forward `commitSha` without the matching handler update. The matching fix from Ryan's branch commit `3a1184cb` was silently reverted during a merge conflict resolution before PR #1754 merged.

  **Version drift fix:** Replace hardcoded `__version__ = "..."` strings in all Python package `__init__.py` files with dynamic lookups via `importlib.metadata.version(...)`. Previously, 4 of 5 packages had `__init__.py` versions that didn't match their `pyproject.toml`:

  | Package | pyproject | __init__ (before) |
  |---|---|---|
  | `agentmark-pydantic-ai-v0` | `0.1.1` | `0.1.0` |
  | `agentmark-claude-agent-sdk-v0` | `0.1.1` | `0.0.0` |
  | `agentmark-prompt-core` | `0.0.1` | `0.1.0` (ahead) |
  | `agentmark-sdk` | `0.0.1` | `0.1.0` (ahead) |
  | `agentmark-templatedx` | `0.0.1` | `0.1.0` (ahead) |

  The durable fix reads the version from installed dist metadata at import time via `importlib.metadata.version(...)`, so runtime `module.__version__` always exactly matches what `pip` / `uv pip show` reports. Drift becomes impossible at the source level. If the package isn't installed (e.g., running from source without `uv sync`), the import will raise `PackageNotFoundError` immediately — a loud failure is strictly preferable to a silent sentinel that masks install issues and misleads compatibility gates.

  **CLI OTLP decoder fix:** Declare `@opentelemetry/otlp-transformer` as a direct dependency of `@agentmark-ai/cli`. The CLI's `api-server.ts:446` calls `require("@opentelemetry/otlp-transformer/build/src/generated/root")` to decode incoming OTLP protobuf span batches at `POST /v1/traces`, but the package was never declared in `cli/package.json` — it only resolved in monorepo dev because `@mastra/core` transitively hoists it to root `node_modules/`. On `npx @agentmark-ai/cli` installs, that transitive chain doesn't exist, so every protobuf span batch crashed the `require()` at runtime and was silently returned as `HTTP 400: Failed to decode protobuf: Cannot find module ...`. This affected every span source using the OTLP protobuf protocol (experiments, dataset runs, any `init_tracing()`-enabled client) — spans were ingested by the request but dropped at the decoder. Adding the dep with `^0.203.0` (matching the version `@mastra/core` transitively resolves) fixes the crash without changing the decoder logic itself. A longer-term refactor to own the OTLP schema is possible but deferred — the current `require()` path has been stable across otlp-transformer versions and the minimal-change fix is the right call.

  **model-registry bump:** Patch bump to keep the model-registry release cadence aligned with the CLI, which transitively consumes it.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/model-registry to 0.2.2

## 0.11.0 (2026-04-08)

### 🚀 Features

- Add dataset sampling support: percentage-based sampling with seed reproducibility, ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))
  specific row selection via indices/ranges, and train/test split for experiments.
  New CLI flags: --sample, --rows, --split, --seed on run-experiment command.

  (claude-agent-sdk-v0-adapter was dropped from this plan when restoring it because its bump shipped in a later release.)


### 🩹 Fixes

- fix(cli): bump @agentmark-ai/templatedx pin to pick up resolveAstSchemaRefs ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

  The previously pinned templatedx@0.2.0 did not export `resolveAstSchemaRefs`. The CLI's `run-prompt` and `build` commands destructure that symbol from the package and call it, so they crashed with "resolveAstSchemaRefs is not a function" at runtime. Bumping the pin to the republished templatedx (which now ships the export from `schema-ref-resolver.ts`) restores `agentmark run` and `agentmark build`.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.5.0
- Updated @agentmark-ai/shared-utils to 0.3.1
- Updated @agentmark-ai/prompt-core to 0.4.0
- Updated @agentmark-ai/templatedx to 0.3.0
- Updated @agentmark-ai/connect to 0.2.0

## 0.10.3 (2026-04-08)

### 🧱 Updated Dependencies

- Updated `@agentmark-ai/model-registry` to `0.2.1`. The previously pinned `0.2.0` was a broken publish that shipped raw TypeScript source instead of compiled JS, which caused `npx @agentmark-ai/cli ui` to crash on Node ≥22.6 with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Bumping the pin picks up the republished `0.2.1` that ships `dist/index.js` and a correct `main` field.

## 0.10.2 (2026-04-08)

### 🩹 Fixes

- Convert `next.config.ts` to `next.config.mjs` to drop the runtime `typescript` dependency. Fixes the npx UI server crash where Next.js could not parse the `.ts` config because `typescript` was only listed in `devDependencies`. ([#547](https://github.com/agentmark-ai/agentmark/pull/547))

## 0.10.1 (2026-03-18)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.3.0
- Updated @agentmark-ai/prompt-core to 0.3.0

## 0.10.0 (2026-03-03)

### 🚀 Features

- feat: add experiments UI with list, detail, and comparison views ([#502](https://github.com/agentmark-ai/agentmark/pull/502))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.4.0

## 0.9.0 (2026-02-19)

### 🚀 Features

- Add seamless pull-models flow with provider/model format ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - prompt-core: validate model names against builtInModels allow-list at load time
  - ai-sdk-v4-adapter, ai-sdk-v5-adapter: add registerProviders() and getModelFunction() for seamless provider/model string resolution; add speech model support
  - claude-agent-sdk-adapter, mastra-v0-adapter: update model registry to use provider/model format
  - create-agentmark: scaffold new projects with builtInModels in provider/model format and registerProviders wiring
- Show remote trace URL when running `agentmark dev --remote` ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  When trace forwarding is active, `agentmark run` now prints both the local
  and remote trace URLs after each prompt execution, along with a warning that
  remote traces may take up to 1 minute to appear.
  - Add `org_name` to `DevKeyResponse` interface (returned by the updated platform API)
  - Add `orgName` to `ForwardingConfig` so the remote URL can be constructed from the persisted config
  - `run-prompt` conditionally shows the remote URL when forwarding is active; falls back to the plain local URL for unlinked sessions

### 🩹 Fixes

- Fix agentmark.json missing from initial git commit and duplicate dev-config.json locations ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - create-agentmark: move initGitRepo() to main() so it runs after agentmark.json is written, ensuring all files land in the initial commit
  - cli: add findProjectRoot() that walks up to find agentmark.json, anchoring .agentmark/dev-config.json there as a single source of truth regardless of which directory agentmark dev is run from
- Fix pull-models UX: require at least one model selection, show accurate success message, and remove prompt.schema.json auto-generation ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - Add `min: 1` to the models multiselect so users can't accidentally confirm with zero selections
  - Replace generic "Models pulled successfully." with "Added N model(s): ..." to accurately reflect what changed
  - Remove automatic `prompt.schema.json` regeneration from `pull-models` (schema generation was not reliably useful without additional IDE setup)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.2.0
- Updated @agentmark-ai/prompt-core to 0.2.0

## 0.8.2 (2026-02-19)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#495](https://github.com/agentmark-ai/agentmark/pull/495))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.1.2
- Updated @agentmark-ai/prompt-core to 0.1.2

## 0.8.1 (2026-02-17)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#492](https://github.com/agentmark-ai/agentmark/pull/492))

## 0.8.0 (2026-02-14)

### 🚀 Features

- Add --remote flag for one-step platform connection (login + tunnel + forwarding) ([#486](https://github.com/agentmark-ai/agentmark/pull/486))

### 🩹 Fixes

- Increase API server body limit to 10mb for OTLP trace payloads ([#486](https://github.com/agentmark-ai/agentmark/pull/486))
- Show webhook secret in --remote banner, simplify generated npm scripts to single `agentmark` command, and fix duplicate trace exporter in SDK. ([#479](https://github.com/agentmark-ai/agentmark/pull/479))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.6

## 0.7.0 (2026-02-14)

### 🚀 Features

- Add --remote flag for one-step platform connection (login + tunnel + forwarding) ([#482](https://github.com/agentmark-ai/agentmark/pull/482))

### 🩹 Fixes

- Increase API server body limit to 10mb for OTLP trace payloads ([#482](https://github.com/agentmark-ai/agentmark/pull/482))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.5

## 0.6.0 (2026-02-13)

### 🚀 Features

- Add --remote flag for one-step platform connection (login + tunnel + forwarding) ([#477](https://github.com/agentmark-ai/agentmark/pull/477))

### 🩹 Fixes

- Increase API server body limit to 10mb for OTLP trace payloads ([#477](https://github.com/agentmark-ai/agentmark/pull/477))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.4

## 0.5.3 (2026-02-13)

### 🩹 Fixes

- Increase API server body limit to 10mb for OTLP trace payloads ([#475](https://github.com/agentmark-ai/agentmark/pull/475))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.3

## 0.5.2 (2026-02-13)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.2

## 0.5.1 (2026-02-13)

### 🩹 Fixes

- Move model-registry to OSS as @agentmark-ai/model-registry, update CLI to use import syntax ([#471](https://github.com/agentmark-ai/agentmark/pull/471))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/model-registry to 0.2.0

## 0.5.0 (2026-02-04)

### 🚀 Features

- Use cloudflared instead of local tunnel ([#459](https://github.com/agentmark-ai/agentmark/pull/459))

## 0.4.1 (2026-01-28)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.1

## 0.4.0 (2026-01-21)

### 🚀 Features

- Fix: security issues ([#449](https://github.com/agentmark-ai/agentmark/pull/449))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.0
- Updated @agentmark-ai/shared-utils to 0.3.0
- Updated @agentmark-ai/shared-utils to 0.3.0
- Updated @agentmark-ai/templatedx to 0.2.0
- Updated @agentmark-ai/templatedx to 0.2.0

# Changelog

## 0.3.0

### Minor Changes

- 97abbdd: Add claude agent sdk adapter
- a4a1d95: Support mcp server

### Patch Changes

- Updated dependencies [97abbdd]
  - @agentmark-ai/shared-utils@0.2.0

## 0.2.0

### Minor Changes

- 03c4c2c: Feat: Timeline view

## 0.1.1

### Patch Changes

- 53c4b70: Fix: workspace refs
- Updated dependencies [53c4b70]
  - @agentmark-ai/prompt-core@0.1.1

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

### Patch Changes

- Updated dependencies [39bae0f]
  - @agentmark-ai/shared-utils@0.1.0
  - @agentmark-ai/prompt-core@0.1.0
  - @agentmark-ai/templatedx@0.1.0

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/cli`.
> See git history for prior changelog entries.
