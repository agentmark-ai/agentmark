## 0.13.2 (2026-06-23)

### 🩹 Fixes

- Add a Variables panel to the trace Input/Output tab. When a generation span carries template variables (frontmatter props, `agentmark.props`), they now render as their own labeled "Variables" panel (raw JSON) above the rendered messages — the input section reads Variables → Messages → Output, each a distinct labeled section. Messages keep their existing Raw/Markdown format toggle. This surfaces the structured props a prompt was rendered with (useful for debugging a dataset/experiment row) alongside the rendered messages, mirroring how prompt-centric tracing (e.g. Phoenix) shows template variables in the trace view. ([#825](https://github.com/agentmark-ai/agentmark/pull/825))

  Also fixes the Storybook scss highlighter import to use the `refractor/scss` package specifier (refractor v5's `./*` export) instead of a hardcoded `node_modules` path that failed to resolve under the monorepo's hoisting and blocked story rendering.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.2.1

## 0.13.1 (2026-06-22)

### 🩹 Fixes

- Polish offloaded-media rendering in the trace drawer (follow-up to the ([#813](https://github.com/agentmark-ai/agentmark/pull/813))
  size-driven blob offload).

  - **Label parity with the inline output bubble.** An offloaded field now uses
    the same header label as the non-offloaded case via the host `t()`: `Output`
    → "Assistant" (the generation's response), `OutputObject` → "Output",
    `ToolCalls` → "Tool", `Input` → "Input". Previously it showed the raw column
    name ("Output"), so the same text completion read as "Output" when offloaded
    but "Assistant" when inline.
  - **Zoom is gated on overflow.** Click-to-zoom (and the cursor) now appear only
    when the image is actually downscaled to fit the cap; a small image that
    already shows 1:1 is no longer "zoomable" (no misleading zoom cursor that did
    nothing). When zoomable, a discoverable "Expand" affordance is shown.
  - **Framed, captioned image.** The image renders in a bordered, checkerboard
    container (transparent PNGs are visible, small images no longer float in dead
    white space) with a caption: `mediaType · width×height · size`.

## 0.13.0 (2026-06-22)

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

- Render offloaded media as the span's output instead of a truncated base64 wall. ([#812](https://github.com/agentmark-ai/agentmark/pull/812))

  When an oversized span field (image/audio/large text) is offloaded to object
  storage, its inline column keeps only an 8KB preview. The trace drawer used to
  render that truncated preview in the output bubble — for media, an unreadable,
  clipped base64 string — AND the full value again below under a "Full output"
  heading. The duplicated, broken preview read as a bug.

  - **OutputDisplay / OutputAccordion**: accept the set of offloaded output fields
    and suppress their truncated inline preview (no base64 wall, no empty
    "No output" bubble). Non-offloaded fields on the same span still render.
  - **OffloadedFields**: render media (image/audio) inline with no overline label
    so it reads as the output itself; large text / JSON keep a plain field label
    (`Input` / `Output` / `Output object` / `Tool calls`, no more "Full …").
    Exposes `parseOffloadedFieldNames(blobRefs)` so the preview renderers and the
    offloaded renderer agree on which fields are offloaded.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.10.0
- Updated @agentmark-ai/prompt-core to 1.2.0

## 0.12.0 (2026-06-18)

### 🚀 Features

- Align the score `source` enum with `experiment | annotation | api`. `SCORE_SOURCE_TYPES` (api-schemas) now validates the public score-write API against those three values and defaults an omitted source to `"api"` (was `"eval"`); the legacy `"eval"` value is no longer accepted on write. `score()` (TS + Python SDK) sends `source`, defaulting to `"api"`. Both experiment score-writers stamp `source: "experiment"`: the SDK `runExperiment` eval loop and the CLI `agentmark run-experiment` score POST. ui-components `ScoreData.source` widened to match (`"eval"` kept only as a legacy display value for historical rows). ([#803](https://github.com/agentmark-ai/agentmark/pull/803))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.9.0
- Updated @agentmark-ai/prompt-core to 1.1.0

## 0.11.1 (2026-06-17)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.5

## 0.11.0 (2026-06-16)

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

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.8.0

## 0.10.0 (2026-06-16)

### 🚀 Features

- Render vector-database / retrieval spans richly instead of as an opaque text blob. The normalizer now extracts retrieved documents into a structured `outputObject.documents` shape (`{ id, content, score, distance, metadata }`) from both OpenInference (`retrieval.documents.{i}.document.*` attributes) and OpenLLMetry vector-store instrumentation (`db.query.result` / `db.search.result` span events), preserving per-document relevance scores and ranks that were previously discarded. The dispatching transformer and semantic-kind resolver now recognize vector-store query spans (a known vector-DB `db.system`, `db.vector.query.*` attributes, or result events) so they route to the vector extractor and classify as `retrieval` instead of falling through to the OTel-GenAI catch-all / `function`. A new ranked retrieved-documents panel in the trace drawer shows each match with its id, score/distance, content and metadata; the joined-content text output is retained for full-text search and legacy traces. No ClickHouse schema change — documents ride the existing `OutputObject` column and lazy-IO fetch. ([#784](https://github.com/agentmark-ai/agentmark/pull/784))

  Verified end-to-end against live instrumentation (real DB clients → gateway OTLP ingest → ClickHouse → UI): Chroma and OpenInference/LangChain extract fully; Milvus is supported including its `db.search.result.entity` payload (recovered into metadata). Coverage is bounded by what each upstream instrumentor actually emits — Qdrant and LanceDB instrumentors emit no per-match results, and Weaviate's does not fire on the v4 query path, so those spans classify as `retrieval` but carry no documents (nothing on the wire to extract).

## 0.9.5 (2026-06-15)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.7.0
- Updated @agentmark-ai/prompt-core to 1.0.4

## 0.9.4 (2026-06-12)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.3

## 0.9.3 (2026-06-12)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.2

## 0.9.2 (2026-06-12)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.1

## 0.9.1 (2026-06-11)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.6.0
- Updated @agentmark-ai/prompt-core to 1.0.0

## 0.9.0 (2026-06-11)

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


### 🩹 Fixes

- fix(ui-components): export useSelectedSpanIO so hosts can hydrate lazy span IO ([#746](https://github.com/agentmark-ai/agentmark/pull/746))

  Extracts the trace drawer's lazy span-IO hydration (host-provided
  fetchSpanIO, synthetic trace-root → real root-span resolution, per-span
  caching) out of useSpanPrompts into a reusable, exported
  useSelectedSpanIO hook. Hosts that load traces "lightweight" (IO columns
  stripped from the initial fetch) and read input/output off the selected
  span outside the IO tab — e.g. the dashboard's Add-to-Dataset capture —
  previously saw empty strings (agentmark-ai/app#2785). mergeSpanIO moved
  with it and is re-exported from its old module; behavior is unchanged.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.5.0
- Updated @agentmark-ai/prompt-core to 0.13.0

## 0.8.2 (2026-06-10)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.12.1

## 0.8.1 (2026-06-10)

### 🩹 Fixes

- fix(traces): session IO cards align with canonical deriveTraceIO — per-field GENERATION fallback when the root span records no I/O ([#733](https://github.com/agentmark-ai/agentmark/pull/733))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.12.0

## 0.8.0 (2026-06-09)

### 🚀 Features

- feat(traces): session IO overview — show every trace's top-level input/output together ([#720](https://github.com/agentmark-ai/agentmark/pull/720))

  In the session details drawer the right panel only ever showed ONE span's
  input/output — to read a multi-step session (e.g. a sale moving cal -> day-of ->
  prices, one trace per transition) you had to click each trace's root in turn.

  New `SessionIoOverview` stacks the top-level Input/Output of EVERY trace in the
  session into one scrollable view. Each card pulls its IO from the trace wrapper
  node in `spanTree` (root-span data already merged up by the provider) and renders
  it with the SAME extraction + display the single-span Input/Output tab uses, so a
  card is identical to selecting that trace's root span.

  The TraceTree and the overview cross-highlight via a shared `hoveredTraceId`,
  kept in a dedicated hover context so a hover re-renders only the rows/cards that
  read it — not every drawer consumer — and the highlight is a border/tint (no
  box-shadow or size change), so hovering stays smooth. Additive — nothing outside
  these views reads the hover state, so existing trace-detail views are unchanged.
  The host (tenant-dashboard) renders the overview as the Details content when
  viewing a session; drilling into a non-root span still shows that span's detail.

## 0.7.1 (2026-06-09)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.11.0

## 0.7.0 (2026-06-09)

### 🚀 Features

- feat(experiments): move comparison charts off the single-experiment detail view ([#714](https://github.com/agentmark-ai/agentmark/pull/714))

  `ExperimentCharts` is a cross-experiment comparison viz (x-axis = experiment
  names, plotted as a line per metric). On the single-experiment detail page it
  was fed a one-element array, so each chart rendered a single, lineless marker —
  a comparison chart with nothing to compare. The charts now belong on the
  multi-experiment comparison view instead.

  - `ExperimentComparison` gains an optional `chartsSlot` prop, rendered between
    the summary banner and the comparison table (same slot pattern as
    `ExperimentDetailView` and `ExperimentsList`). Additive and optional, so this
    is a minor bump.

## 0.6.9 (2026-06-09)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.10.0

## 0.6.8 (2026-06-09)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.9.0

## 0.6.7 (2026-06-07)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.8.2

## 0.6.6 (2026-06-06)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.8.1

## 0.6.5 (2026-06-06)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.8.0

## 0.6.4 (2026-06-05)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.7.0

## 0.6.3 (2026-06-05)

### 🩹 Fixes

- Trace-drawer and number-formatting fixes. ([#658](https://github.com/agentmark-ai/agentmark/pull/658))

  - **`use-span-prompts`**: a new `isGenerationSpan` predicate (matches `spanKind === "llm"` or the presence of a `model` field — a back-compat shim for older traces) now guards `isToolSpan` / `isAgentSpan`, fixing LLM generations being rendered as tool/agent nodes in the trace drawer.
  - **`fCurrency`**: sub-precision non-zero values (e.g. `$0.0000001`) no longer round to `"$0"` — they render with up to 2 significant digits; invalid inputs return `''` before any formatting.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.4.0
- Updated @agentmark-ai/prompt-core to 0.6.0

## 0.6.2 (2026-05-21)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.3.0
- Updated @agentmark-ai/prompt-core to 0.5.0

## 0.6.1 (2026-05-12)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.2.0

## 0.6.0 (2026-05-12)

### 🚀 Features

- Add "Test prompt" button to the trace drawer, surfacing the originating prompt's name/variables directly from a span: ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/ui-components`: New `TestPromptDialog` component plus `buildRunPromptCommand` (and `singleQuoteShellEscape` helper) under `./sections/traces/components`. New `extractSpanPromptName` and `extractSpanTemplateProps` helpers in `./sections/traces/utils/extract-span-data`. All additive — existing exports unchanged.
  - `@agentmark-ai/cli`: Dashboard wires the new "Test prompt" button into the trace drawer; new `src/lib/api/prompts.ts` client + `src/lib/api/traces.ts` extensions for prompt resolution and wire-shape utilities used by the dialog.


### 🩹 Fixes

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

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-schemas to 0.1.0
- Updated @agentmark-ai/prompt-core to 0.4.2

## 0.5.2 (2026-04-14)

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

## 0.5.1 (2026-04-13)

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

## 0.5.0 (2026-04-08)

### 🚀 Features

- Add unified score registry with typed schemas for human annotation. ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

  - `prompt-core`: New `ScoreSchema`, `ScoreDefinition`, `ScoreRegistry` types with Zod validation. `AgentMark` class accepts `scores` option. `evalRegistry` deprecated. `serializeScoreRegistry()` utility. `test_settings.evals` renamed to `scores` (backward compat).
  - `connect`: Handle `get-score-configs` job type to serve serialized schemas to dashboard.
  - Adapters (ai-sdk-v4, ai-sdk-v5, mastra): Accept `scores` option in `createAgentMarkClient`.
  - `ui-components`: Schema-driven annotation form with boolean/numeric/categorical controls. Falls back to free-form when no configs available.
  - `shared-utils`: `AgentmarkConfig.evals` made optional (superseded by score registry).

  (claude-agent-sdk-v0-adapter and create-agentmark were dropped from this plan when restoring it because their bumps already shipped via subsequent releases.)

- feat(traces): add metadata display to span tooltip, eval score chips in trace tree, and runtime type coercion for metadata values ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

### 🩹 Fixes

- Export RequestTable from requests section ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.0

## 0.4.0 (2026-03-03)

### 🚀 Features

- feat: add experiments UI with list, detail, and comparison views ([#502](https://github.com/agentmark-ai/agentmark/pull/502))

## 0.3.6 (2026-02-14)

### 🩹 Fixes

- Export RequestTable from requests section ([#486](https://github.com/agentmark-ai/agentmark/pull/486))

## 0.3.5 (2026-02-14)

### 🩹 Fixes

- Export RequestTable from requests section ([#482](https://github.com/agentmark-ai/agentmark/pull/482))

## 0.3.4 (2026-02-13)

### 🩹 Fixes

- Export RequestTable from requests section ([#477](https://github.com/agentmark-ai/agentmark/pull/477))

## 0.3.3 (2026-02-13)

### 🩹 Fixes

- Export RequestTable from requests section ([#475](https://github.com/agentmark-ai/agentmark/pull/475))

## 0.3.2 (2026-02-13)

### 🩹 Fixes

- Export RequestTable from requests section ([#473](https://github.com/agentmark-ai/agentmark/pull/473))

## 0.3.1 (2026-01-28)

### 🩹 Fixes

- fix: Datagrid filter panel flickers ([#456](https://github.com/agentmark-ai/agentmark/pull/456))

## 0.3.0 (2026-01-21)

### 🚀 Features

- Fix: security issues ([#449](https://github.com/agentmark-ai/agentmark/pull/449))

# Changelog

## 0.2.0

### Minor Changes

- 03c4c2c: Feat: Timeline view

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/ui-components`.
> See git history for prior changelog entries.
