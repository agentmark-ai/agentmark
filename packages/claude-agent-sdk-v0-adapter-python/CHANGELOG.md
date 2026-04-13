## 0.1.3 (2026-04-13)

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

## 0.1.2 (2026-04-09)

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

## 0.1.1 (2026-04-08)

### 🩹 Fixes

- Rename Claude Agent SDK adapter to include upstream version in the name (`v0`), matching the existing convention used by `mastra-v0-adapter`, `ai-sdk-v4-adapter`, and `ai-sdk-v5-adapter`. The adapter now publishes as `@agentmark-ai/claude-agent-sdk-v0-adapter` (TypeScript) and `agentmark-claude-agent-sdk-v0` (Python). `create-agentmark` example templates updated to reference the new names. `agentmark-pydantic-ai-v0` bumped to 0.1.0 for its first PyPI release. ([#547](https://github.com/agentmark-ai/agentmark/pull/547))

## 0.0.1 (2026-02-19)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#495](https://github.com/agentmark-ai/agentmark/pull/495))