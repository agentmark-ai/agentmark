---
"agentmark-pydantic-ai-v0": patch
"agentmark-claude-agent-sdk-v0": patch
"agentmark-sdk": minor
"@agentmark-ai/ai-sdk-v4-adapter": patch
"@agentmark-ai/ai-sdk-v5-adapter": patch
"@agentmark-ai/mastra-v0-adapter": patch
"@agentmark-ai/claude-agent-sdk-v0-adapter": patch
"@agentmark-ai/shared-utils": patch
"@agentmark-ai/cli": patch
"@agentmark-ai/ui-components": patch
---

Restore experiment span instrumentation, score posting, and trace drawer I/O display across all adapters. Refs agentmark-ai/app#1860.

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
