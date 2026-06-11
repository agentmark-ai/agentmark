## 1.4.2 (2026-06-11)

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

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.13.0

## 1.4.1 (2026-06-10)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.12.1

## 1.4.0 (2026-06-10)

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

- Link prompt version (commit sha) to traces on regular prompt runs: the gateway/CLI dev server stamp the served-at commit into agentmark_meta.commit_sha, the runner threads it through PromptSpanParams, and the SDK span hooks emit it as metadata.commit_sha alongside the new agentmark.prompt_name attribute. ([#738](https://github.com/agentmark-ai/agentmark/pull/738))

### 🩹 Fixes

- fix: mask Vercel AI SDK and OTel GenAI content attributes ([#728](https://github.com/agentmark-ai/agentmark/pull/728))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.12.0

## 1.3.0 (2026-06-09)

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

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.11.0

## 1.2.7 (2026-06-09)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.10.0

## 1.2.6 (2026-06-09)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.9.0

## 1.2.5 (2026-06-07)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/loader-api to 0.1.2

## 1.2.4 (2026-06-07)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.8.2

## 1.2.3 (2026-06-06)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.8.1

## 1.2.2 (2026-06-06)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.8.0

## 1.2.1 (2026-06-05)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.7.0

## 1.2.0 (2026-06-05)

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

- Experiment runner, baseline fetch, JUnit output, and streaming-span tracing. ([#658](https://github.com/agentmark-ai/agentmark/pull/658))

  - **`AgentMarkSDK.runExperiment()`** — runs any callable (agent / workflow / multi-step pipeline) over a dataset inside instrumented spans, applies per-scorer evaluators, posts scores to the gateway, and returns a structured `RunExperimentResult` with per-row regression detail and score-threshold gate results. Supports configurable concurrency, optional JUnit XML, and an optional baseline regression gate.
  - **`AgentMarkSDK.getBaselineScores()`** — fetches a prior run's per-`(row × scorer)` baseline scores from the gateway, keyed by `experimentKey` + `sourceTreeHash` (the shared baseline protocol used by the CLI).
  - **`experimentResultToJUnit()`** — renders a `RunExperimentResult` as CLI-compatible JUnit XML for CI pipelines.
  - **`streamWithSpan()`** — wraps a streaming producer in a span so failures during stream *consumption* (after the producer callback returns) correctly mark the span ERROR instead of leaving it green.
  - **`trace`** — alias for `span`, for parity with the Python SDK.
  - New `SpanOptions` fields `experimentKey`, `sourceTreeHash`, `datasetInput`; the masking processor now redacts `agentmark.dataset_input`. New exported types: `RunExperimentOptions` / `RunExperimentResult`, `ExperimentEvaluator`, `BaselineResolved`, `ScoreThresholdResult`, `StreamWithSpanOptions` / `StreamWithSpanResult`.

  All additive — no existing API changed.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.6.0

## 1.1.3 (2026-05-21)

### 🩹 Fixes

- fix(sdk): filter Mastra internal getter/converter spans at sampler ([#608](https://github.com/agentmark-ai/agentmark/pull/608))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.5.0

## 1.1.2 (2026-05-12)

### 🩹 Fixes

- Isolate the AgentMark tracer so it coexists with Sentry / other OpenTelemetry SDKs in the same process. Previously, registering AgentMark could clobber an existing global tracer provider (or vice-versa), causing both instrumentations to drop spans. The SDK now scopes its tracer to its own provider and only writes to the global as a fallback when none is set. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))
- **License change: MIT → AGPL-3.0-or-later.** ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  The runtime code is byte-identical to the previous patch release — only the
  `LICENSE.md` file and the `license` field in each `package.json` change. Bumping
  as a patch (not a major) because no compile/runtime behavior is affected.

  **Downstream impact (please read before upgrading):** AGPL-3.0 has copyleft
  and network-use obligations that MIT does not. Consumers using these packages
  in proprietary or SaaS products may need to evaluate compatibility before
  upgrading. Users who need the MIT terms can pin to the last MIT-licensed
  release of each package.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.2
- Updated @agentmark-ai/loader-api to 0.1.1

## 1.1.1 (2026-04-14)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.1

## 1.1.0 (2026-04-08)

### 🚀 Features

- Rename trace API to span/observe semantics. **Breaking** for consumers of the previous tracing surface. ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

  - Renamed `trace` → `span`
  - Renamed `TraceContext` → `SpanContext`, `TraceOptions` → (folded into `SpanOptions`), `TraceResult` → `SpanResult`
  - Added `observe` higher-order helper, `SpanKind` enum, and `serializeValue` utility
  - New internal modules `trace/traced.ts` and `trace/serialize.ts`

  This change landed in source via sync #535 (2026-04-03) but was missed by the upstream-sync release pipeline — no version plan was generated alongside the source change, so the bump never made it onto npm. Consumers on `@agentmark-ai/sdk@1.0.7` should migrate `trace`/`TraceContext` imports to `span`/`SpanContext` when upgrading to this release.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.0

## 1.0.7 (2026-03-18)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.3.0

## 1.0.6 (2026-02-19)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.2.0

## 1.0.5 (2026-02-19)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.1.2

## 1.0.4 (2026-02-14)

### 🩹 Fixes

- Show webhook secret in --remote banner, simplify generated npm scripts to single `agentmark` command, and fix duplicate trace exporter in SDK. ([#479](https://github.com/agentmark-ai/agentmark/pull/479))

# Changelog

## 1.0.2

### Patch Changes

- 00fd34d: fix: missing dataset path in metadata

## 1.0.1

### Patch Changes

- 53c4b70: Fix: workspace refs

## 1.0.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

### Patch Changes

- Updated dependencies [39bae0f]
  - @agentmark-ai/loader-api@0.1.0

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/sdk`.
> See git history for prior changelog entries.
