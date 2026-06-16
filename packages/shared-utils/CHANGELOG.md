## 0.9.0 (2026-06-16)

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

## 0.8.0 (2026-06-16)

### 🚀 Features

- Render vector-database / retrieval spans richly instead of as an opaque text blob. The normalizer now extracts retrieved documents into a structured `outputObject.documents` shape (`{ id, content, score, distance, metadata }`) from both OpenInference (`retrieval.documents.{i}.document.*` attributes) and OpenLLMetry vector-store instrumentation (`db.query.result` / `db.search.result` span events), preserving per-document relevance scores and ranks that were previously discarded. The dispatching transformer and semantic-kind resolver now recognize vector-store query spans (a known vector-DB `db.system`, `db.vector.query.*` attributes, or result events) so they route to the vector extractor and classify as `retrieval` instead of falling through to the OTel-GenAI catch-all / `function`. A new ranked retrieved-documents panel in the trace drawer shows each match with its id, score/distance, content and metadata; the joined-content text output is retained for full-text search and legacy traces. No ClickHouse schema change — documents ride the existing `OutputObject` column and lazy-IO fetch. ([#784](https://github.com/agentmark-ai/agentmark/pull/784))

  Verified end-to-end against live instrumentation (real DB clients → gateway OTLP ingest → ClickHouse → UI): Chroma and OpenInference/LangChain extract fully; Milvus is supported including its `db.search.result.entity` payload (recovered into metadata). Coverage is bounded by what each upstream instrumentor actually emits — Qdrant and LanceDB instrumentors emit no per-match results, and Weaviate's does not fire on the v4 query path, so those spans classify as `retrieval` but carry no documents (nothing on the wire to extract).

## 0.7.0 (2026-06-14)

### 🚀 Features

- Extract IO, model, tokens, settings, tool calls and trace context from OpenInference- and OpenLLMetry/Traceloop-instrumented spans. A new signature-dispatching default transformer routes spans by attribute shape (these ecosystems each emit dozens of distinct OTel scope names, so they can't be scope-registered), falling back to the OTel GenAI semantic conventions when neither matches. Unlocks trace ingestion for the OpenInference (LangChain, LlamaIndex, OpenAI Agents SDK, CrewAI, DSPy, Haystack, …) and OpenLLMetry/OpenLIT (AutoGen, Semantic Kernel, Agno, …) instrumentor catalogs without per-framework work. ([#776](https://github.com/agentmark-ai/agentmark/pull/776))

## 0.6.1 (2026-06-11)

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

## 0.6.0 (2026-06-10)

### 🚀 Features

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

- feat(observability): one canonical trace-level I/O derivation, shared by every read path ([#731](https://github.com/agentmark-ai/agentmark/pull/731))

  Adds `deriveTraceIO` to shared-utils — the single definition of "what is a
  trace's input/output": the root prompt-run span's
  `agentmark.input`/`agentmark.output` (written by the WebhookRunner) wins,
  falling back per-field to the first GENERATION span's input / last
  GENERATION span's output in timestamp order. Previously three call sites
  each had their own semantics (cloud: first/last GENERATION only; CLI trace
  detail: first/last GENERATION only; CLI dataset import-from-traces: root
  span only), so the same trace answered differently per endpoint.

  Consumers updated: cloud gateway `transformTraceDetail`, CLI
  `mapRawTraceToDetail` (`GET /v1/traces/:id`), and the CLI's
  `normalizeLocalTraceSource` (dataset import). The AgentMark OTel
  transformer now also parses `agentmark.input` JSON messages arrays (the
  runner's format) instead of wrapping them as a single user message.

  Doctor's traceShape fix text now points at instrumentation/the runner
  instead of telling users to fix their executor (which cannot set trace
  I/O). Docs (observe/tracing-setup) and the skill document the derivation.


### 🩹 Fixes

- Canonicalize OTLP status codes to numeric strings in the span normalizer; CLI read mappers accept legacy enum-name variants from older local DBs ([#735](https://github.com/agentmark-ai/agentmark/pull/735))

## 0.5.1 (2026-06-09)

### 🩹 Fixes

- fix(shared-utils): toFrontMatter emits valid YAML for values needing escaping ([#703](https://github.com/agentmark-ai/agentmark/pull/703))

  `toFrontMatter` built the prompt frontmatter by interpolating each value
  directly into `key: value` lines, with no quoting or escaping. When a
  `test_settings.props` value came from a trace input that was page markdown, the
  emitted YAML was invalid: a value starting with `![](...)` was read as a YAML
  tag, embedded double quotes became a second scalar, and newlines broke the block
  mapping. Reopening such a prompt in the editor failed with
  `YAMLException: expected <block end>, but found '<scalar>'`. The function now
  serializes with `js-yaml`'s `dump`, the same library templatedx uses to read the
  frontmatter back, so every value round-trips: special-character scalars are
  quoted and multi-line strings use block scalars. Empty input still renders as
  bare `---` fences.

## 0.5.0 (2026-06-05)

### 🚀 Features

- Normalizer: robust AI-SDK input extraction, model-based span-kind resolution, and experiment span attributes — all additive. ([#658](https://github.com/agentmark-ai/agentmark/pull/658))

  - **AI-SDK v4/v5 input extraction** (`strategies/v4.ts`, `strategies/v5.ts`): `extractInput` now handles every `ai.prompt` shape — message array, `{messages, system?}`, `{prompt, system?}`, and bare strings — via a new `coerceToMessages` helper, so wrapper spans and string-prompt generation calls no longer render blank input.
  - **Semantic-kind resolver** (`semantic-kind-resolver.ts`): a new rule resolves spans carrying `gen_ai.request.model` to `"llm"` (catching vendor-neutral model calls that name maps miss), and `ai.generateText` / `ai.streamText` / `ai.generateObject` / `ai.streamObject` were added to the Vercel AI-SDK operation map.
  - **AgentMark parser + types**: extract the `experiment_key` and `source_tree_hash` span attributes into `NormalizedSpan` (new optional `experimentKey` / `sourceTreeHash` fields).

## 0.4.0 (2026-05-21)

### 🚀 Features

- Stable, content-hashed dataset item names for cross-runtime regression-vs-baseline comparison. ([#599](https://github.com/agentmark-ai/agentmark/pull/599))

  - New shared utility `computeDatasetItemName(input, fallbackIndex)` in `@agentmark-ai/shared-utils` — first 12 hex chars of MD5 of canonical JSON, matching the pydantic-ai adapter's byte-for-byte format.
  - Mastra and Claude Agent SDK adapters now use the new utility instead of `String(index)`. Item names survive dataset row reordering and produce identical identifiers across TypeScript and Python runtimes — a precondition for baseline lookup keying on `(prompt × scorer × row)`.

## 0.3.3 (2026-05-12)

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

## 0.3.2 (2026-04-13)

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

## 0.3.1 (2026-04-08)

### 🩹 Fixes

- Add unified score registry with typed schemas for human annotation. ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

  - `prompt-core`: New `ScoreSchema`, `ScoreDefinition`, `ScoreRegistry` types with Zod validation. `AgentMark` class accepts `scores` option. `evalRegistry` deprecated. `serializeScoreRegistry()` utility. `test_settings.evals` renamed to `scores` (backward compat).
  - `connect`: Handle `get-score-configs` job type to serve serialized schemas to dashboard.
  - Adapters (ai-sdk-v4, ai-sdk-v5, mastra): Accept `scores` option in `createAgentMarkClient`.
  - `ui-components`: Schema-driven annotation form with boolean/numeric/categorical controls. Falls back to free-form when no configs available.
  - `shared-utils`: `AgentmarkConfig.evals` made optional (superseded by score registry).

  (claude-agent-sdk-v0-adapter and create-agentmark were dropped from this plan when restoring it because their bumps already shipped via subsequent releases.)

## 0.3.0 (2026-01-21)

### 🚀 Features

- Fix: security issues ([#449](https://github.com/agentmark-ai/agentmark/pull/449))

# Changelog

## 0.2.0

### Minor Changes

- 97abbdd: Add claude agent sdk adapter

## 0.1.1

### Patch Changes

- 00fd34d: fix: missing dataset path in metadata

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/shared-utils`.
> See git history for prior changelog entries.
