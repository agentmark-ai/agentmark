## 1.4.2 (2026-04-14)

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

- Updated @agentmark-ai/prompt-core to 0.4.1
- Updated @agentmark-ai/sdk to 1.1.1

## 1.4.1 (2026-04-13)

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

## 1.4.0 (2026-04-08)

### 🚀 Features

- Breaking change: removed tool registries from all adapters. Adapters now accept native SDK tools directly. MDX tools field changed from record to string array. MCP bridge utilities removed from Claude adapter. ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

  (claude-agent-sdk-v0-adapter, create-agentmark, and the pydantic-ai adapter were dropped from this plan when restoring it because their bumps were already shipped via subsequent releases or namespace renames.)

- Add dataset sampling support: percentage-based sampling with seed reproducibility, ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))
  specific row selection via indices/ranges, and train/test split for experiments.
  New CLI flags: --sample, --rows, --split, --seed on run-experiment command.

  (claude-agent-sdk-v0-adapter was dropped from this plan when restoring it because its bump shipped in a later release.)

- Add unified score registry with typed schemas for human annotation. ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

  - `prompt-core`: New `ScoreSchema`, `ScoreDefinition`, `ScoreRegistry` types with Zod validation. `AgentMark` class accepts `scores` option. `evalRegistry` deprecated. `serializeScoreRegistry()` utility. `test_settings.evals` renamed to `scores` (backward compat).
  - `connect`: Handle `get-score-configs` job type to serve serialized schemas to dashboard.
  - Adapters (ai-sdk-v4, ai-sdk-v5, mastra): Accept `scores` option in `createAgentMarkClient`.
  - `ui-components`: Schema-driven annotation form with boolean/numeric/categorical controls. Falls back to free-form when no configs available.
  - `shared-utils`: `AgentmarkConfig.evals` made optional (superseded by score registry).

  (claude-agent-sdk-v0-adapter and create-agentmark were dropped from this plan when restoring it because their bumps already shipped via subsequent releases.)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.0
- Updated @agentmark-ai/templatedx to 0.3.0
- Updated @agentmark-ai/sdk to 1.1.0

## 1.3.0 (2026-03-18)

### 🚀 Features

- Breaking change: removed tool registries from all adapters. Adapters now accept native SDK tools directly. MDX tools field changed from record to string array. MCP bridge utilities removed from Claude adapter. ([#522](https://github.com/agentmark-ai/agentmark/pull/522))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.3.0
- Updated @agentmark-ai/sdk to 1.0.7

## 1.2.0 (2026-02-19)

### 🚀 Features

- Add seamless pull-models flow with provider/model format ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - prompt-core: validate model names against builtInModels allow-list at load time
  - ai-sdk-v4-adapter, ai-sdk-v5-adapter: add registerProviders() and getModelFunction() for seamless provider/model string resolution; add speech model support
  - claude-agent-sdk-adapter, mastra-v0-adapter: update model registry to use provider/model format
  - create-agentmark: scaffold new projects with builtInModels in provider/model format and registerProviders wiring

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.2.0
- Updated @agentmark-ai/sdk to 1.0.6

## 1.1.2 (2026-02-19)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#495](https://github.com/agentmark-ai/agentmark/pull/495))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.1.2
- Updated @agentmark-ai/sdk to 1.0.5

## 1.1.1 (2026-01-21)

### 🚀 Features

- Fix: security issues ([#449](https://github.com/agentmark-ai/agentmark/pull/449))

# Changelog

## 1.0.2

### Patch Changes

- 00fd34d: fix: missing dataset path in metadata
- Updated dependencies [00fd34d]
  - @agentmark-ai/sdk@1.0.2

## 1.0.1

### Patch Changes

- 53c4b70: Fix: workspace refs
- Updated dependencies [53c4b70]
  - @agentmark-ai/prompt-core@0.1.1
  - @agentmark-ai/sdk@1.0.1

## 1.0.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

### Patch Changes

- Updated dependencies [39bae0f]
  - @agentmark-ai/prompt-core@0.1.0
  - @agentmark-ai/sdk@1.0.0

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/ai-sdk-v5-adapter`.
> See git history for prior changelog entries.
