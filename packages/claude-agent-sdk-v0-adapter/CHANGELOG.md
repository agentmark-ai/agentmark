## 0.3.3 (2026-04-13)

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

## 0.3.2 (2026-04-08)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.0
- Updated @agentmark-ai/templatedx to 0.3.0
- Updated @agentmark-ai/sdk to 1.1.0

## 0.3.1 (2026-04-08)

### 🩹 Fixes

- Rename Claude Agent SDK adapter to include upstream version in the name (`v0`), matching the existing convention used by `mastra-v0-adapter`, `ai-sdk-v4-adapter`, and `ai-sdk-v5-adapter`. The adapter now publishes as `@agentmark-ai/claude-agent-sdk-v0-adapter` (TypeScript) and `agentmark-claude-agent-sdk-v0` (Python). `create-agentmark` example templates updated to reference the new names. `agentmark-pydantic-ai-v0` bumped to 0.1.0 for its first PyPI release. ([#547](https://github.com/agentmark-ai/agentmark/pull/547))

## 0.3.0 (2026-03-18)

### 🚀 Features

- Breaking change: removed tool registries from all adapters. Adapters now accept native SDK tools directly. MDX tools field changed from record to string array. MCP bridge utilities removed from Claude adapter. ([#522](https://github.com/agentmark-ai/agentmark/pull/522))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.3.0
- Updated @agentmark-ai/sdk to 1.0.7

## 0.2.0 (2026-02-19)

### 🚀 Features

- Add seamless pull-models flow with provider/model format ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - prompt-core: validate model names against builtInModels allow-list at load time
  - ai-sdk-v4-adapter, ai-sdk-v5-adapter: add registerProviders() and getModelFunction() for seamless provider/model string resolution; add speech model support
  - claude-agent-sdk-adapter, mastra-v0-adapter: update model registry to use provider/model format
  - create-agentmark: scaffold new projects with builtInModels in provider/model format and registerProviders wiring

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.2.0
- Updated @agentmark-ai/sdk to 1.0.6

## 0.1.2 (2026-02-19)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#495](https://github.com/agentmark-ai/agentmark/pull/495))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.1.2
- Updated @agentmark-ai/sdk to 1.0.5

## 0.1.1 (2026-01-21)

This was a version bump only for @agentmark-ai/claude-agent-sdk-adapter to align it with other projects, there were no code changes.

# @agentmark-ai/claude-agent-sdk-adapter

## 0.1.0

### Minor Changes

- 97abbdd: Add claude agent sdk adapter
