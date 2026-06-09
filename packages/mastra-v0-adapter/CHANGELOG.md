## 1.6.5 (2026-06-09)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.5.1
- Updated @agentmark-ai/prompt-core to 0.9.0
- Updated @agentmark-ai/sdk to 1.2.6

## 1.6.4 (2026-06-07)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/sdk to 1.2.5

## 1.6.3 (2026-06-07)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.8.2
- Updated @agentmark-ai/templatedx to 0.4.1
- Updated @agentmark-ai/sdk to 1.2.4

## 1.6.2 (2026-06-06)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.8.1
- Updated @agentmark-ai/templatedx to 0.4.0
- Updated @agentmark-ai/sdk to 1.2.3

## 1.6.1 (2026-06-06)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.8.0
- Updated @agentmark-ai/sdk to 1.2.2

## 1.6.0 (2026-06-05)

### 🚀 Features

- Adapter-architecture hardening: enforce the Executor protocol everywhere it ([#670](https://github.com/agentmark-ai/agentmark/pull/670))
  was only documented, and machine-check the TS↔Python wire contract.

  **prompt-core (minor — additive exports):**

  - `wire.ts` now exports the pure event→chunk mappers `textEventToWire` /
    `objectEventToWire` (plus `usageToWire`). The WebhookRunner's streaming
    loops route through them; behavior-identical, but the mapping is now a
    testable unit pinned by the new cross-language wire vectors.
  - `BaseAdapter` docstring corrected: it claimed Mastra was absorbed; the
    honest adoption map (v4/v5 extend it, Mastra shares the helpers but keeps
    URI-keyed MCP resolution, claude-agent implements `Adapter` directly) is
    now documented.
  - **`Adapter` interface cleanup:** the four adapt methods drop their phantom
    `<_K>` type parameters (the input config is key-independent, so the
    generic was decorative on the interface; concrete adapters may still
    declare real `<K>` generics — generic methods remain assignable). The
    never-implemented, never-called optional `getDevServerFactory` member is
    removed. Both only break callers that explicitly instantiated the phantom
    generic or typed against the dead member — none exist in the repo.
  - **Non-streaming envelopes are pure builders** (`textResponseToWire` /
    `objectResponseToWire`, exported with their `WireTextResponse` /
    `WireObjectResponse` types). One wire-visible change rides along: a
    runner with NULL span hooks no longer emits `"traceId": ""` on
    non-streaming responses — the key is omitted (consumers probe by key;
    hook-equipped runners are unaffected since their trace ids are non-empty).
  - **Executor conformance meta-gate** (`test/executor-conformance-gate.test.ts`):
    scans packages/*/src for Executor implementations and fails CI unless
    that package's tests invoke the conformance suite — adapter N+1 can no
    longer skip it. Includes a scanner self-check pinned to the known
    implementation inventory so the gate can't rot into passing vacuously.

  **ai-sdk-shared (minor — new export + protocol fixes):**

  - `VercelAIModelRegistry` moved here (generic over `TModel`); both adapters
    re-export concretely-typed subclasses — removes ~160 LOC of verbatim
    duplication.
  - Executor protocol fixes in the shared factory (ship in the v4/v5 patch
    bumps): `streamText`/`streamObject` calls moved inside the try so a
    synchronous SDK throw becomes a terminal `error` event instead of an
    exception; streaming text now captures + suppresses native finish chunks
    and emits exactly ONE terminal `finish` (synthesized when the SDK stream
    omits it, zero-default usage) per the documented single-usage-channel
    contract.
  - New executor-conformance suite (30 tests) runs the shared factory through
    `assertTextStream`/`assertObjectStream`/`assertErrorStream`/
    `runExecutorConformance` across BOTH chunk adapters — previously only the
    Mastra adapter ran conformance.
  - **Mutation-tested** (the package previously had no suite at all): seeded
    at 0%/54% file scores, now 97.84% overall (registry 100%, factory 99.2%;
    remaining survivors are documented equivalents — redundant-defense guards
    re-covered by `finalizeUsage`). Survivor analysis drove real additions:
    the registry suite (the dedup had moved code but left its tests in
    v4/v5), per-branch object error paths, SDK param-contract pins
    (`Output.object({schema})`, spread pass-through), image/speech execution,
    unknown-chunk robustness, and v5 `input`/`output`-keyed tool fields.
    Enrolled in the nightly Stryker matrix with the floor seeded at 95.
  - **`VercelSDK` is no longer `any`-typed**: structural view types
    (`VercelStreamChunk`, `VercelGenerateTextResult`, …) catalog exactly the
    fields the factory reads; the factory body is fully typed against them
    (zero `as any`). Views are deliberately permissive supersets — rename
    detection lives in the per-adapter `sdk-contract-assertions.ts` files
    (see v4/v5 notes), which also prove view satisfaction by the real `ai`
    types per major.

  **conformance-vectors (minor — new vectors):**

  - `wire-chunks.json`: 15 golden cases pinning the AgentEvent→NDJSON-chunk
    mapping in both languages (tool-call field renames, usage alias families,
    usage-less finish semantics, reasoning-delta not wired, isError dropped).
    TS (`prompt-core/test/wire-vectors.test.ts`) and Python
    (`tests/test_wire_vectors.py`) read the same file.
  - `dataset-rows.json`: 9 golden cases pinning the experiment-row chunk
    assembly (`datasetRowToWire` in TS / `_dataset_row_to_wire` in Python,
    both newly extracted as pure builders). Canonical absence semantics:
    `expectedOutput`/`actualOutput`/`tokens` OMITTED when unknown (never
    null), `traceId` omitted when empty, `evals` always present, falsy-vs-
    absent pinned (`tokens: 0` and `actualOutput: ""` are real values).
    **Caught + fixed a live divergence:** the Python runner emitted
    `"expectedOutput": null` for rows without one where TS omitted the key —
    Python now matches the TS wire.
  - `response-envelopes.json`: 8 golden cases pinning the non-streaming
    text/object response envelopes (`textResponseToWire`/`objectResponseToWire`
    in TS, `_text_response_to_wire`/`_object_response_to_wire` in Python —
    all newly extracted). **Caught + fixed two more live divergences:** Python
    emitted `"usage": null` where TS omitted the key, and TS emitted
    `"traceId": ""` under null span hooks where Python omitted it. Canonical:
    omit-when-unknown everywhere; tool arrays always present; the WireUsage
    alias expansion is pinned from canonical AgentUsage args.
  - `wire-chunks.json` grew a defensive-default case (wrong-kind event in the
    object mapper emits nothing), surfaced by mutation testing.
  - **`protocol-catalog.json`**: the normative variant catalog for AgentEvent
    and WireChunk — required/optional fields and kinds per variant. Each
    language asserts against it FROM ITS REAL TYPES: TS via a sample record
    mapped over the AgentEvent union (new variant = compile error until
    cataloged), Python via `typing.get_args(AgentEvent)` reflection (its
    inventory can't drift from its implementation), plus Python validates its
    actual wire builders' output against the chunk specs. Adding a variant in
    one language fails the other's suite until both implement — the
    schema-pinned replacement for comment-mirrored type definitions.
    (Catalog-over-JSON-Schema deliberately: dependency-free in both languages;
    ajv exists only as a phantom transitive dep and the Python venv has no
    jsonschema.)

  **ai-sdk-v4-adapter / ai-sdk-v5-adapter (patch):**

  - Model registry is now a typed re-export of the shared implementation
    (public API unchanged; runner snapshot tests confirm byte-stable wire).
  - Pick up the shared-factory protocol fixes above.
  - New chunk-binding conformance tests pin each adapter to ITS chunk shape
    (`textDelta`+`usage` vs `text`+`totalUsage`).
  - **SDK contract assertions** (`src/sdk-contract-assertions.ts`): the
    shared factory's typed views are permissive supersets and cannot catch
    upstream renames by construction — these function-anchored compile-time
    pins (real `ai` types → the exact fields the factory reads) are the
    rename tripwires for the next `ai` major, with `@ts-expect-error`
    negatives proving the mechanism fires.
  - **Vitest typecheck mode enabled** (`tsconfig.vitest.json` — the package
    tsconfig only includes src/, which made the existing type tests pass
    VACUOUSLY; verified hollow via sabotage, then fixed). New
    `prompt-types.test-d.ts` pins the prompt-object flow end to end: dict →
    kind-gated loaders → per-key `format()` input typing → SDK-native output
    params (object OUTPUT types landing in `Schema<T[K]["output"]>`) →
    assignability to the real `ai` function params. Giving the old type tests
    teeth surfaced + fixed real rot: hand-rolled `Tool<{...}>` aliases that
    never satisfied `ToolParameters`, a non-generic `FileLoader` used
    generically, and explicit `adaptText<K>` instantiations of the removed
    phantom generic.

  **mastra-v0-adapter (minor — `format()` return shape changed):**

  - **`_runnable` smuggling removed.** `adaptText`/`adaptObject` now return the
    honest runnable bundle `{ agent, messages, generateOptions }` (new exported
    types `MastraTextParams` / `MastraObjectParams`) consumed by
    `MastraExecutor` — no more underscore-private key, no strip-dance, no
    runtime "expected `_runnable`" coupling. `prompt.format()` returns this
    bundle (the minor-worthy shape change: the resolved model now lives at
    `formatted.agent.model`, not top-level).
  - **`formatAgent` / `formatMessages` are unchanged** — the user-facing
    two-stage API now composes the adapter's (newly public) building blocks
    `adaptTextAgent` / `adaptTextMessages` (+ object twins) directly. One
    incidental fix: object-kind `formatAgent` no longer leaks the internal
    `adaptMessages` closure into its returned AgentConfig spread.
  - **Vitest typecheck mode + `prompt-types.test-d.ts`** (see the v4/v5 note):
    pins `format()` → `MastraTextParams` bundle (generateOptions satisfying
    the REAL `Agent.generate` param), `formatAgent` tuple typing, and the
    object OUTPUT type landing in `z.ZodType<T[K]["output"]>`. Giving the old
    type tests teeth surfaced + fixed: tool aliases that never satisfied
    `ToolsInput`, a rotted two-generic `createAgentMarkClient` usage, and a
    DEAD `src/mcp/mcp-server-registry.ts` importing a non-existent `ai`
    export (deleted). Documents a known DX gap: `format()` props are not
    per-key typed for Mastra (the optional-dict generic erases them); the
    typed path is `formatAgent`.
  - Adapter migrated onto the shared `applyParamMap` + `buildTelemetryMetadata`
    helpers (declarative param maps replace ~90 LOC of spread-conditionals;
    identical output, existing tests unchanged). Mastra-specific MCP tool
    resolution kept deliberately — documented why (URI-keyed tool names).
  - `instructions!` non-null assertion replaced with a documented cast
    (prompts without `<System>` pass `undefined` through at runtime; Mastra
    tolerates it — now explicit instead of hidden).
  - Executor conformance fixes: streaming text synthesizes the terminal
    `finish` when the SDK stream omits it; every `finish` now carries usage
    (zero-default), matching `createExecutor`'s builder semantics.
  - **Mutation-tested** executor+adapter: 89.6% → 97.0%. Survivor analysis
    added: provider shape variance (`content`-keyed text, bare object
    results, `text`/`totalUsage` v5-style chunks), per-branch error paths,
    the no-fullStream fallbacks, a non-thenable usage side channel, the
    param-map contract pin (emptying MASTRA_TEXT_PARAM_MAP previously
    survived), and instructions extraction. Also fixed scripted-mock state
    bleed that made mutation results order-dependent.

  **claude-agent-sdk-v0-adapter (minor — ported to the Executor protocol):**

  - **New `ClaudeAgentExecutor`** (exported) translates SDK `query()` messages
    into the canonical AgentEvent stream — the TS mirror of the Python
    adapter's executor, with the same semantics (streaming surfaces
    AssistantMessage deltas; one-shot uses ResultMessage's final text; error
    subtypes are terminal error events; usage rides one zero-defaulted
    terminal finish). Full executor-conformance suite included.
  - **`ClaudeAgentWebhookHandler` is now a thin shim** over the shared
    WebhookRunner + executor (replacing ~617 LOC of bespoke runner). Wire
    changes this implies (now matching v5/Mastra/Python-claude):
    - Streaming emits canonical WireChunks — `{type:"text", result}` deltas
      and a finish chunk with full `WireUsage` — replacing the bespoke
      `{type, delta}` chunks and combined result+usage final chunk.
    - Non-streaming failures (SDK error subtypes, thrown SDK errors) REJECT
      instead of returning an error-shaped result payload.
    - Experiments resolve format-time failures (e.g. missing dataset) as
      rejections instead of error chunks; rows/evals/runId semantics now come
      from the shared runner (eval `input` stays `formatted.messages`).
    - Experiment wrapper spans are emitted via `createAgentmarkSpanHooks` —
      verified identical (names, `agentmark.props`/`agentmark.output`,
      shared `dataset_run_id`) by the real-OTel integration tests.
    - Preserved historical behavior: non-streaming default
      (`shouldStream ?? false`) and the legacy text-shaped error payloads for
      image/speech prompts (+ legacy experiment error chunk).
  - `withTracing` GenAI telemetry is unchanged — the executor calls it around
    the SDK query exactly as the old runner did.
  - Runner tests rewritten in the mastra real-fixture style (real client +
    prompts, only the SDK mocked) instead of hand-mocked client/templatedx/
    prompt-core wiring.
  - Dropped the decorative `<_K>` phantom type parameters from the adapt
    methods (interface no longer declares them; see prompt-core).
  - **Mutation-tested** the new executor: 90.9% → 97.0%. Survivor analysis
    added message-shape robustness (system/user messages must not clobber
    results, contentless/null/empty-text blocks skip cleanly) and the
    `Error: <subtype>` fallback for error results without an errors array.
  - Compile-time prompt-type pins (`src/prompt-type-assertions.ts`, pulled
    into the build graph via an index type-export — the vitest config is
    skip-worktree-managed, so typecheck mode isn't available here).

  **cli (patch):**

  - `pull-models` no longer reads the undocumented `agentmark.json#adapter`
    field (the schema's `additionalProperties: false` rejected it anyway, and
    nothing else in the ecosystem reads or writes it). The provider-setup hint
    is now the unconditional default output — correct for the ai-sdk adapters
    and Mastra alike, since both consume `@ai-sdk/*` providers.

  **agentmark-prompt-core / Python (patch):**

  - Wire mapping extracted to module-level `_text_event_to_wire` /
    `_object_event_to_wire` (behavior-identical refactor of the NDJSON
    generators) and pinned against the shared wire-chunks vectors.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.7.0
- Updated @agentmark-ai/sdk to 1.2.1

## 1.5.0 (2026-06-05)

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

- Streaming-span observability + experiment-run metadata in the dataset runners. ([#658](https://github.com/agentmark-ai/agentmark/pull/658))

  - **Streaming spans now record input and output.** The streaming paths (object / text / tool-call) were refactored onto the new `streamWithSpan()` helper from `@agentmark-ai/sdk`: the span input is set to just the assembled `messages` (not the full SDK call payload) and the final model output (accumulated text / last partial object) is captured via `ctx.setOutput()`. Previously streaming spans recorded neither. _(ai-sdk-v4, ai-sdk-v5, mastra)_
  - **Provider stream errors now fail the span.** In-stream `error` chunks from `streamText` / `streamObject` are re-thrown so the wrapping span is marked ERROR, instead of being caught and emitted as a JSON error line while the span stayed green. _(ai-sdk-v4, ai-sdk-v5, mastra)_
  - **`runDataset` accepts `experimentKey` and `sourceTreeHash`** (optional trailing parameters), forwarded into per-item span metadata for experiment grouping and source-tree correlation (regression-gate baseline join). _(all four adapters)_
  - **Dataset-row parse errors are surfaced** rather than silently dropped — a row with `type === "error"` now emits an `experimentErrorChunk` instead of being skipped, so a fully-invalid dataset produces visible failures rather than a silent zero-output pass. _(ai-sdk-v5)_

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.5.0
- Updated @agentmark-ai/prompt-core to 0.6.0
- Updated @agentmark-ai/sdk to 1.2.0

## 1.4.0 (2026-05-21)

### 🚀 Features

- Parallel experiment runner — dataset rows now execute concurrently through a bounded worker pool instead of one after another. ([#614](https://github.com/agentmark-ai/agentmark/pull/614))

  - `prompt-core` / `prompt-core-python`: new bounded-concurrency helper — `runDatasetPool` / `run_dataset_pool` — and a `DEFAULT_EXPERIMENT_CONCURRENCY` (20) constant. A run processes 20 dataset rows at a time by default.
  - adapters (`ai-sdk-v4`, `ai-sdk-v5`, `mastra-v0`, `claude-agent-sdk-v0`, and the Python `pydantic-ai-v0` / `claude-agent-sdk-v0`): `runExperiment` / `run_experiment` dispatch dataset rows through the pool, so a run is bounded by the slowest row rather than the sum of all rows.
  - `cli`: `agentmark run-experiment` accepts a `--concurrency <n>` flag to override the default per run (any positive integer — the CLI runs on the user's own machine). The flag travels to the runner via the `dataset-run` webhook request.

  Behavior changes worth noting for consumers:
  - A single row failure no longer aborts the whole run — the failed row emits an error chunk and the run continues with the remaining rows.
  - Result chunks stream in completion order, not dataset order. Each row still carries its own `traceId` / dataset item identity, so order-independent consumers are unaffected.

  See: https://github.com/agentmark-ai/app/issues/2326


### 🩹 Fixes

- Stable, content-hashed dataset item names for cross-runtime regression-vs-baseline comparison. ([#599](https://github.com/agentmark-ai/agentmark/pull/599))

  - New shared utility `computeDatasetItemName(input, fallbackIndex)` in `@agentmark-ai/shared-utils` — first 12 hex chars of MD5 of canonical JSON, matching the pydantic-ai adapter's byte-for-byte format.
  - Mastra and Claude Agent SDK adapters now use the new utility instead of `String(index)`. Item names survive dataset row reordering and produce identical identifiers across TypeScript and Python runtimes — a precondition for baseline lookup keying on `(prompt × scorer × row)`.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.4.0
- Updated @agentmark-ai/prompt-core to 0.5.0
- Updated @agentmark-ai/sdk to 1.1.3

## 1.3.3 (2026-05-12)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/loader-file to 0.1.1
- Updated @agentmark-ai/prompt-core to 0.4.2
- Updated @agentmark-ai/templatedx to 0.3.1
- Updated @agentmark-ai/sdk to 1.1.2

## 1.3.2 (2026-04-14)

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

## 1.3.1 (2026-04-13)

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

## 1.3.0 (2026-04-08)

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

## 1.2.0 (2026-03-18)

### 🚀 Features

- Breaking change: removed tool registries from all adapters. Adapters now accept native SDK tools directly. MDX tools field changed from record to string array. MCP bridge utilities removed from Claude adapter. ([#522](https://github.com/agentmark-ai/agentmark/pull/522))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.3.0
- Updated @agentmark-ai/sdk to 1.0.7

## 1.1.0 (2026-02-19)

### 🚀 Features

- Add seamless pull-models flow with provider/model format ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - prompt-core: validate model names against builtInModels allow-list at load time
  - ai-sdk-v4-adapter, ai-sdk-v5-adapter: add registerProviders() and getModelFunction() for seamless provider/model string resolution; add speech model support
  - claude-agent-sdk-adapter, mastra-v0-adapter: update model registry to use provider/model format
  - create-agentmark: scaffold new projects with builtInModels in provider/model format and registerProviders wiring

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.2.0
- Updated @agentmark-ai/sdk to 1.0.6

## 1.0.4 (2026-02-19)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#495](https://github.com/agentmark-ai/agentmark/pull/495))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.1.2
- Updated @agentmark-ai/sdk to 1.0.5

## 1.0.3 (2026-01-21)

This was a version bump only for @agentmark-ai/mastra-v0-adapter to align it with other projects, there were no code changes.

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

> **Note:** This package was previously published as `@agentmark/mastra-v0-adapter`.
> See git history for prior changelog entries.
