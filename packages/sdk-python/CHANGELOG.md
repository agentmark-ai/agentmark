## 0.7.0 (2026-06-22)

### 🚀 Features

- Add a framework-agnostic trace-grouping API to the Python SDK — the twin of `@agentmark-ai/otel` — so Python reaches parity with TypeScript for grouping traces by session, user, and metadata. `with_agentmark(session_id=..., user_id=..., tags=..., metadata=...)` is a context manager that stashes the grouping in the OpenTelemetry context (merging over any enclosing scope, inner fields winning); `AgentMarkGroupingProcessor` stamps those `agentmark.*` attributes onto every span started in the scope (sync or async, with concurrent scopes isolated via contextvars), and `init_tracing()` now registers it automatically. The pure mapping `to_agentmark_attributes(...)` is conformance-locked against `conformance-vectors/grouping-attributes.json`, producing byte-identical compact-JSON output to the TypeScript helper. ([#816](https://github.com/agentmark-ai/agentmark/pull/816))

## 0.6.0 (2026-06-18)

### 🚀 Features

- Align the score `source` enum with `experiment | annotation | api`. `SCORE_SOURCE_TYPES` (api-schemas) now validates the public score-write API against those three values and defaults an omitted source to `"api"` (was `"eval"`); the legacy `"eval"` value is no longer accepted on write. `score()` (TS + Python SDK) sends `source`, defaulting to `"api"`. Both experiment score-writers stamp `source: "experiment"`: the SDK `runExperiment` eval loop and the CLI `agentmark run-experiment` score POST. ui-components `ScoreData.source` widened to match (`"eval"` kept only as a legacy display value for historical rows). ([#803](https://github.com/agentmark-ai/agentmark/pull/803))

## 0.5.0 (2026-06-11)

### 🚀 Features

- Client-first webhook runner + API-surface major. sdk 2.0 / prompt-core 1.0 ([#755](https://github.com/agentmark-ai/agentmark/pull/755))
  (stabilized: the deprecated surface is gone; what remains is the supported API):

  **Breaking (TS):**
  - `createWebhookRunner({ client, executor, hooks? })` — `client` is REQUIRED;
    the `loader`/`evals` options are removed. Register both once, on
    `createAgentMark`; the runner sources them from the client. The factory's
    single implementation lives in prompt-core (main barrel + `/webhook-runner`
    subpath, no tracing default); `@agentmark-ai/sdk`'s export wraps it and
    defaults hooks to AgentMark tracing.
  - Removed: `createAgentMarkClient` (use `createAgentMark`), the `evalRegistry`
    option (use `evals`), the deprecated `RunExperimentOptions` alias in the
    webhook runner (use `WebhookExperimentOptions`), and the XML helpers from
    the main barrel (`escapeXmlAttribute`/`escapeXmlText`/`wrapCdata`/
    `stringifyForXml` → `@agentmark-ai/prompt-core/internal`, not semver-stable).
  - sdk's prompt-core peer floor is now `>=1.0.0`.

  **Breaking (Python, pre-1.0 minor):**
  - `create_webhook_runner(client, executor, *)` — the executor-first legacy
    signature and the `loader`/`evals` kwargs are removed; `eval_registry` is
    removed from `AgentMark`/`create_agentmark` (use `evals`).

  **Additive:**
  - `ApiLoader`/`FileLoader` at `@agentmark-ai/prompt-core/loader-api` +
    `/loader-file`; the standalone loader packages become re-export shims
    (patch) and `@agentmark-ai/fallback-adapter` is retired from publishing.
  - `WebhookExperimentOptions` (renamed from the colliding name).
  - `AgentMarkSDK.runExperiment` runs on prompt-core's shared `runDatasetPool`
    and accepts `signal?: AbortSignal`.
  - Python namespace aliases `agentmark.sdk` / `agentmark.templatedx`
    (explicit re-exports; flat names remain supported).

## 0.4.1 (2026-06-11)

### 🩹 Fixes

- Remove the SDK-specific adapter packages (ai-sdk-v4-adapter, ai-sdk-v5-adapter, ([#751](https://github.com/agentmark-ai/agentmark/pull/751))
  ai-sdk-shared, mastra-v0-adapter, pydantic-ai-v0-adapter). AgentMark integrates
  with any SDK through the neutral render / executor seam.

  `createAgentMark` is now the single client factory: its `adapter` argument is
  optional in both languages (TypeScript `createAgentMark({ loader })`, Python
  `create_agentmark(loader=loader)`) and defaults to the neutral
  `DefaultAdapter`. `createAgentMarkClient` is a deprecated alias in
  `@agentmark-ai/prompt-core`; `@agentmark-ai/fallback-adapter` is deprecated
  and re-exports both unchanged.

## 0.4.0 (2026-06-10)

### 🚀 Features

- feat(sdk-python): @observe supports generator and async-generator functions ([#731](https://github.com/agentmark-ai/agentmark/pull/731))

  Decorating a generator function with @observe previously took the plain
  sync path: the span ended when the generator OBJECT was created (before
  any item was produced), the output captured the generator's repr, and the
  actual streaming work ran outside the span. Generator and async-generator
  functions now get dedicated wrappers: the span stays open until the
  stream is exhausted, producer steps run under the span's context (model
  spans parent correctly) while consumer code between yields does not (no
  context leak), and the output is the aggregated yields — concatenated
  when all items are strings (the LLM text-delta shape), the item list
  otherwise. Errors mid-stream mark the span ERROR; abandoned streams
  (GeneratorExit) still end the span.

- feat(sdk): align with OTel GenAI semantic conventions (dual-emit + standard-shape ingest) ([#736](https://github.com/agentmark-ai/agentmark/pull/736))

  Emit side (additive, no breaking removals):
  - observe()/@observe and SpanContext setInput/setOutput now dual-emit
    vendor-namespaced `agentmark.request.input` / `agentmark.response.output`
    alongside the deprecated `gen_ai.request.input` / `gen_ai.response.output`
    (the gen_ai keys are not spec attributes and will be removed in a future
    release).
  - `sessionId`/`session_id` additionally emits the standard
    `gen_ai.conversation.id`.
  - Both masking processors treat the new vendor IO keys as sensitive.

  Ingest side (normalizer): accepts the standard OTel GenAI shapes as
  fallbacks when AgentMark keys are absent — `gen_ai.input.messages`,
  `gen_ai.output.messages`, `gen_ai.system_instructions` (folded into input
  as a leading system message), legacy `gen_ai.prompt`/`gen_ai.completion`,
  `gen_ai.provider.name` wherever `gen_ai.system` was read,
  `gen_ai.conversation.id` as a sessionId fallback, and legacy
  `gen_ai.usage.prompt_tokens`/`completion_tokens`. AgentMark keys always win.

- Link prompt version (commit sha) to traces on regular prompt runs: the gateway/CLI dev server stamp the served-at commit into agentmark_meta.commit_sha, the runner threads it through PromptSpanParams, and the SDK span hooks emit it as metadata.commit_sha alongside the new agentmark.prompt_name attribute. ([#738](https://github.com/agentmark-ai/agentmark/pull/738))

### 🩹 Fixes

- feat(runner): stamp model and usage on the prompt span ([#740](https://github.com/agentmark-ai/agentmark/pull/740))

  The runner now records `gen_ai.request.model` (from the prompt's
  frontmatter config, adapter-agnostic) on the prompt span at start, and
  `gen_ai.usage.input_tokens`/`gen_ai.usage.output_tokens` (integers, from
  the executor's finish-event usage) after drain — in both runners, on
  streaming and non-streaming paths.

  Executors built on raw SDKs with no OTEL GenAI instrumentation (boto3
  Bedrock, raw OpenAI/Anthropic clients) previously produced traces with
  no model on any span and no token counts, failing `doctor --smoke`'s
  traceShape check. With the runner stamping what it already knows, any
  raw-SDK executor is fully doctor-green with zero instrumentation. The
  prompt span stays type SPAN, so GENERATION-only rollups never
  double-count it when instrumented model spans also exist.

  `SpanLike.set_attribute`/`setAttribute` contracts widened to accept
  numeric values (the normalizer only parses numeric token attributes).
  Pinned by the extended span-io conformance vectors in both languages.

  Also fixes AgentmarkSampler (agentmark-sdk, Python): per the OTel spec
  the sampler result replaces a span's create-time attributes, and the
  sampler returned a bare RECORD_AND_SAMPLE decision — silently stripping
  every attribute passed at span creation (notably gen_ai.* attributes
  from instrumentation libraries such as botocore's Bedrock extension,
  which degraded to generic RPC spans with no model). The sampler now
  forwards the caller's attributes and parent trace_state.

- fix: mask Vercel AI SDK and OTel GenAI content attributes ([#728](https://github.com/agentmark-ai/agentmark/pull/728))

## 0.3.0 (2026-06-09)

### 🚀 Features

- feat(webhook): the runner owns dispatch; evals reach the cloud on every path ([#717](https://github.com/agentmark-ai/agentmark/pull/717))

  The New Experiment dialog showed *"No evals available"* for deployed apps even
  when they registered evals. Root cause: no single object owned "what the
  deployed app exposes," so the eval registry had to travel a hand-assembled chain
  (client → executor → runner → handler → dispatch → transport) that every entry
  path re-wired — and any path could drop it. The Python managed handler hand-rolled
  dispatch and 400'd on `get-evals`; the TS managed server forwarded the dispatch
  envelope raw; the BYO `createWebhookRunner` built a client with no `evals` input
  at all. This makes the chain non-assemblable.

  - **Dispatch lives on the runner.** `WebhookRunner.dispatch(event)` (TS + Python)
    routes prompt-run / dataset-run / get-evals, sourcing evals from its OWN
    client — no passable, omittable client argument. The canonical managed handler
    is `handler = runner.dispatch` (or `adapterHandler.dispatch`). `runner.client`
    / `getEvalNames()` are public so a runner satisfies the control-plane contract.

  - **`evals` is threaded through every builder.** TS `createWebhookRunner({ evals })`
    and the new Python `create_webhook_runner(executor, evals=…)` register evals
    once → they both run in experiments and list in the dialog. Adapter factories
    already threaded evals; now the BYO path does too.

  - **Adapters delegate, don't reimplement.** Pydantic / claude / ai-sdk-v4 / v5
    webhook handlers expose `.dispatch` + `.client` by delegating to the shared
    runner (both span hooks bundled at construction); no per-adapter dispatch code.

  - **Anti-drift.** `conformance-vectors/protocol-catalog.json` gains a normative
    `webhookJobs` section; both languages assert their REAL dispatch's job-type set
    (`WEBHOOK_JOB_TYPES` / `WebhookRequest['type']`) is exhaustive over it, and the
    get-evals payload stays pinned to `control-plane.json` on the dev AND managed
    surfaces. Adding a job to one language without the other fails the other's CI.

  New public API (minor) across prompt-core (TS + Python), the SDK
  (`createWebhookRunner` `evals` option), and the adapters (`dispatch`/`client`).
  Back-compat: `handleWebhookRequest(event, handler, client?)` still works; the
  managed servers still accept legacy flat results. The managed Node server now
  unwraps the dispatch envelope (the TS half of the empty dialog) — see
  `apps/builder` machine-execute-contract test (monorepo, not released here).

## 0.2.1 (2026-04-16)

### 🩹 Fixes

- fix: set explicit User-Agent on OTLP span exports to bypass Cloudflare BIC ([#584](https://github.com/agentmark-ai/agentmark/pull/584))

  Cloudflare's Browser Integrity Check rejects requests bearing the default
  `Python-urllib/*` User-Agent with HTTP 403 (error code 1010). `JsonOtlpSpanExporter`
  uses `urllib.request.urlopen` without setting a UA, so every trace export through
  a Cloudflare-proxied zone (api.agentmark.co, api-stg.agentmark.co) was silently
  rejected before reaching the gateway. Combined with the exporter's bare
  `except Exception: return FAILURE`, the failure produced no logs, no metrics,
  and no ClickHouse rows — just a complete absence of traces.

  The `ApiLoader` path (`/v1/templates` etc.) wasn't affected because it uses
  `httpx`, whose default UA `python-httpx/<version>` isn't on the BIC block list.

  Set `User-Agent: agentmark-sdk-python/<version>` on every outbound POST. The
  version is resolved at import time via `importlib.metadata.version("agentmark-sdk")`
  so it stays in lockstep with the installed distribution.

## 0.2.0 (2026-04-13)

### 🚀 Features

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

## 0.1.1 (2026-04-09)

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