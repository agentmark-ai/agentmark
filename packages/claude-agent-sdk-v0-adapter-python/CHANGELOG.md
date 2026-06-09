## 0.3.2 (2026-06-09)

### 🩹 Fixes

- refactor(webhook): shared cross-language get-evals control-plane contract ([#706](https://github.com/agentmark-ai/agentmark/pull/706))

  The dashboard's New Experiment dialog showed "No evals available" because the
  `get-evals` webhook job had no dispatch. This makes `get-evals` a contract the
  TS and Python clients share and every adapter inherits:

  - `ControlPlaneClient` (TS interface / Python Protocol): the AgentMark client
    owns `getEvalNames()` / `get_eval_names()`.
  - `buildEvalsResponse()` / `build_evals_response()`: one shared wire helper per
    language, emitting a byte-identical `{type:'evals', result, traceId}` envelope
    (names sorted for a deterministic cross-language order; serialized compact and
    raw-UTF-8 so the bytes match across languages).
  - The shared dispatch sources names from the client. The CLI's
    `handleWebhookRequest` falls back to the handler's surfaced client, so the
    Vercel adapters answer `get-evals` with zero extra wiring; the per-adapter
    eval logic is removed.

  prompt-core (TS + Python) gain new public API → minor. The CLI, the Vercel
  v4/v5 adapters (surface their client), and the pydantic / claude-agent-sdk
  Python adapters (wire the dispatch) → patch. A shared
  `conformance-vectors/control-plane.json` keeps both languages and all adapters
  from drifting.

### 🧱 Updated Dependencies

- Updated agentmark-prompt-core to 0.5.0

## 0.3.1 (2026-06-06)

### 🩹 Fixes

- Adapter-architecture fixes: close the `AdaptOptions` type hole, deduplicate ([#676](https://github.com/agentmark-ai/agentmark/pull/676))
  the v4/v5 adapter bodies, and rewrite the adapter authoring guide around the
  Executor + conformance flow.

  **prompt-core (minor — BREAKING type narrowing):**

  - **`AdaptOptions` is now closed** — the `[key: string]: any` index signature
    is removed; the type is exactly `BaseAdaptOptions` (`telemetry`, `apiKey`,
    `baseURL`, `toolContext`). Nothing in the ecosystem passed or read
    undeclared keys (verified across every package and consumer in the repo),
    and the open bag disabled typo-checking on the most-passed parameter in
    the system while every field access degraded to `any`. Python's
    `AdaptOptions` has always been a closed `TypedDict(total=False)` — the two
    language contracts now agree. **BREAKING for TS consumers that passed
    arbitrary extra keys to `format()` / the adapt methods**: declare your
    options explicitly via intersection (`AdaptOptions & YourOptions`) — the
    pattern the Mastra adapter already uses, and spread-bearing literals
    (e.g. `formatWithDataset`'s `{ props, ...options }`) are unaffected by
    excess-property checking.

  **ai-sdk-shared (minor — new public exports):**

  - New `VercelAIAdapterCore` + `VercelAdapterSpec`: the version-agnostic
    adapter core for Vercel-AI-SDK-shaped frameworks. The four adapt-method
    bodies (param mapping, telemetry, tool/MCP resolution, the tool-bearing
    object `max_calls` default of 10) live here once; version deltas inject
    via the spec (`maxCallsEntry`, `convertMessages`, `mcpClientFactory`,
    `jsonSchema`) — the same injection pattern `createVercelExecutor` uses
    with `ChunkAdapter`. A param-map or telemetry fix now lands in both `ai`
    majors at once.
  - New abort-path conformance coverage for the shared executor factory:
    `ctx.signal` is proven to reach the SDK call as `abortSignal`, with no
    events emitted past the abort boundary (one chunk of read-ahead
    tolerated), under both chunk adapters.
  - Added the standard `eslint.config.mjs` (the package was created without
    one, so `eslint .` could not run even in the standalone repo).

  **ai-sdk-v4-adapter / ai-sdk-v5-adapter (patch — behavior preserved):**

  - Both adapters are now thin version-pinned shells over
    `VercelAIAdapterCore`: each keeps its concrete param types
    (`maxSteps` vs `stopWhen: stepCountIs(n)`; `RichChatMessage[]` passthrough
    vs `ModelMessage[]` conversion) via type-only `declare` narrowing — zero
    runtime wrapper code, public API unchanged. Behavioral parity with the
    previous implementations verified field-by-field (return key/spread
    order, conditional vs unconditional `tools`, `max_calls` default,
    telemetry block, MCP factories, `jsonSchema` wrapping).
  - New tests pin the previously-untested MCP **stdio** boot path per major:
    the transport is constructed from the server config verbatim
    (`command`/`args`/`cwd`/`env`) over each major's own entrypoint
    (`ai/mcp-stdio` vs `@ai-sdk/mcp/mcp-stdio`), and v5's `convertMessages`
    unknown-role fall-through (untyped callers' roles forward verbatim).
    Both packages sit at 100% statement/branch/function/line coverage.

  **claude-agent-sdk-v0-adapter (minor — abort support):**

  - The executor now bridges `ExecCtx.signal` into the SDK's
    `abortController` query option (reusing a caller-provided controller when
    present, so both abort paths converge) — mid-stream cancellation reaches
    the SDK subprocess. `ClaudeAgentQueryOptions` gains the
    `abortController?: AbortController` field.
  - `withTracing`'s manual iteration loop now closes the SDK iterator on
    early exit (its `next()` loop bypasses `for await`'s auto-close, so the
    SDK generator's cleanup previously waited for GC on abort/break).
  - Abort conformance tests: signal reaches the SDK, no events past the
    abort boundary, caller-controller convergence.

  **agentmark-prompt-core / Python (minor — new public export):**

  - New `assert_abort_stream` in the executor-conformance suite: drives a
    mid-stream `aclose()` (Python's cancellation channel for async
    generators) and verifies the executor unwinds cleanly without swallowing
    `GeneratorExit`. Exported from `agentmark.prompt_core`. Both Python
    adapters now run it.

  **agentmark-claude-agent-sdk-v0 / Python (patch — cancellation bug fix):**

  - **Found by the new abort assertion:** closing the executor's stream
    mid-flight did NOT propagate into the SDK query generator — a bare
    `async for` abandons its iterator without closing, so the SDK's cleanup
    (subprocess/connection teardown) only ran at GC. The executor now wraps
    the SDK stream in `contextlib.aclosing`, making cancellation cleanup
    deterministic.

  **Tooling (no package bump): `scripts/create-adapter.mjs`** — adapter
  scaffold generator. One command produces a complete adapter package
  (Adapter + createExecutor-based executor + model registry + client factory
  + conformance tests incl. abort) whose suite is green before any SDK code
  is written; the SDK integration is isolated behind a single `src/sdk.ts`
  seam. `ADAPTER_REQUIREMENTS.md` now leads with it.

## 0.3.0 (2026-06-05)

### 🚀 Features

- Consolidate the per-adapter runners behind a shared `Executor` protocol + a ([#665](https://github.com/agentmark-ai/agentmark/pull/665))
  single `WebhookRunner` (TS + Python), and tighten the resulting interface.

  **Minor, not major:** these packages are pre-1.0 (0.x) and explicitly unstable,
  so breaking changes ride the minor slot for now.

  Breaking / behavior changes in this release:

  - **Executor protocol** is the new SDK-integration contract. Each adapter is now
    a thin `Executor` + paramMap over the shared `WebhookRunner` instead of a
    per-SDK runner. `AgentEvent` is kind-split (`TextStreamEvent` /
    `ObjectStreamEvent`); usage rides on a single terminal `finish` event (the
    standalone `usage` event variant is gone).
  - **`WebhookRunner.runExperiment` signature** changed from trailing positional
    args (`datasetPath`, `sampling`, `concurrency`, `experimentKey`,
    `sourceTreeHash`) to a `RunExperimentOptions` bag, with `signal` added for
    cancellation. The per-adapter `*WebhookHandler.runExperiment` shims and the
    CLI runner-server dispatch follow suit.
  - **`Adapter.adaptText/adaptObject/adaptImage/adaptSpeech`** return `unknown`
    instead of `any`. Concrete adapters override with their real return type, so
    the typed BYO/Default path is unaffected; generic-`Adapter` holders must
    narrow.
  - **Experiment NDJSON wire unified**: the claude-agent (TS + Python) adapters
    drop the `experiment_start` / `experiment_item_error` / `experiment_end`
    envelope in favor of the shared `{type:"dataset"}` / `{type:"error"}` shape
    every other adapter already emits. Verified: no consumer (gateway, builder
    auto-score, dashboard) parses the old envelope.
  - **`datasetItemName`** for the AI-SDK adapters is now `md5(input)[:12]` (parity
    with the Python adapters) instead of the raw row index.

  Additive:

  - BYO bootstrapping primitives: `createExecutor` / `create_executor`,
    `createWebhookRunner`, `runExecutorConformance`.
  - `WireChunk` — the now-typed NDJSON stream contract, exported from prompt-core.
  - New packages `@agentmark-ai/ai-sdk-shared` (shared Vercel executor factory)
    and `@agentmark-ai/conformance-vectors` (cross-language test fixtures).

## 0.2.0 (2026-05-21)

### 🚀 Features

- Parallel experiment runner — dataset rows now execute concurrently through a bounded worker pool instead of one after another. ([#614](https://github.com/agentmark-ai/agentmark/pull/614))

  - `prompt-core` / `prompt-core-python`: new bounded-concurrency helper — `runDatasetPool` / `run_dataset_pool` — and a `DEFAULT_EXPERIMENT_CONCURRENCY` (20) constant. A run processes 20 dataset rows at a time by default.
  - adapters (`ai-sdk-v4`, `ai-sdk-v5`, `mastra-v0`, `claude-agent-sdk-v0`, and the Python `pydantic-ai-v0` / `claude-agent-sdk-v0`): `runExperiment` / `run_experiment` dispatch dataset rows through the pool, so a run is bounded by the slowest row rather than the sum of all rows.
  - `cli`: `agentmark run-experiment` accepts a `--concurrency <n>` flag to override the default per run (any positive integer — the CLI runs on the user's own machine). The flag travels to the runner via the `dataset-run` webhook request.

  Behavior changes worth noting for consumers:
  - A single row failure no longer aborts the whole run — the failed row emits an error chunk and the run continues with the remaining rows.
  - Result chunks stream in completion order, not dataset order. Each row still carries its own `traceId` / dataset item identity, so order-independent consumers are unaffected.

  See: https://github.com/agentmark-ai/app/issues/2326

## 0.1.5 (2026-05-12)

### 🩹 Fixes

- Accumulated fixes across the Python packages since the last release: ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `agentmark-prompt-core`: Implement `FileLoader.load()` for Python (mirrors the
    TS FileLoader contract — `oss/agentmark/packages/prompt-core-python/src/agentmark/prompt_core/loaders.py`).
    Dataset paths resolve the same way from `FileLoader` and `ApiLoader` frontmatter,
    using the configurable `basePath`.
  - `agentmark-pydantic-ai-v0`: Wrapper spans record the experiment iteration's
    template variables on the wrapper span as `agentmark.props`, matching the
    TS adapter behavior. This populates `result.props` in the normalizer output,
    which the trace drawer's Test Prompt button reads to repopulate variables.
    `instrument-all` is invoked at the adapter boundary instead of per call site.
  - `agentmark-claude-agent-sdk-v0`: Correct the AgentMark import path so the
    adapter works when imported from a venv-installed package (previously only
    worked in-tree). Wrapper-span attribute handling matches the pydantic-ai
    adapter (`agentmark.props` for template variables).

## 0.1.4 (2026-04-14)

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