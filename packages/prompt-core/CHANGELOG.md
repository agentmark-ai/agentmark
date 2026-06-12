## 1.0.1 (2026-06-12)

### 🩹 Fixes

- Python + Bedrock onboarding fixes (friction report from a real first-contact setup): ([#758](https://github.com/agentmark-ai/agentmark/pull/758))

  - `agentmark-prompt-core` (Python): new `serve_webhook_runner(runner)` — a stdlib HTTP
    server for the `.agentmark/dev_server.py` entry point, the Python counterpart of the
    TS `createWebhookServer`. Parses the `--webhook-port` flag `agentmark dev` passes,
    serves `runner.dispatch` (POST `{type, data}` → JSON or `AgentMark-Streaming` NDJSON
    with a trailing `done`/`traceId` event), and runs all user async code on one
    persistent event loop. Previously the documented Python entry point built a runner
    and exited — there was no way to serve it without hand-rolling the wire contract.
  - `@agentmark-ai/cli`: `pull-models --provider X --models <leaf>` now accepts leaf
    model names (the provider prefix is redundant when `--provider` is explicit);
    already-added models are skipped instead of erroring (idempotent for CI); the
    unknown-model error explains the provider-prefixed ID form. The post-add provider
    hint is language-aware — Python projects get executor guidance instead of
    TypeScript `@ai-sdk/*` imports. Project-language detection now recognizes
    `requirements.txt`, `setup.py`, and a root `dev_server.py` (with explicit AgentMark
    client files taking precedence), so requirements.txt-only projects get Python
    guidance from `doctor`/`dev` on first contact instead of "agentmark.client.ts
    missing". All user-facing command hints use the universally runnable
    `npx @agentmark-ai/cli <cmd>` form (`npx agentmark` only resolved when the CLI
    happened to be a local dependency).
  - `@agentmark-ai/prompt-core` (TS): the local dev server's streaming responses now
    always carry `Content-Type: application/x-ndjson` alongside `AgentMark-Streaming`
    (the managed deploy servers already sent both; the dispatch's header fallback
    didn't). The HTTP layer of both local dev servers is now pinned to the shared
    `conformance-vectors/webhook-http.json` so TS and Python can't drift.
  - `@agentmark-ai/model-registry`: current Claude Bedrock model IDs in overrides —
    Opus 4.6 (`anthropic.claude-opus-4-6-v1`), Sonnet 4.6, Sonnet 4.5, Opus 4.5, and
    Haiku 4.5 ARN-versioned IDs with their `global.`/`us.`/`eu.`/`jp.`/`apac.`
    cross-region inference profiles (regional entries carry the 10% CRIS premium), plus
    the Messages-API Bedrock IDs `anthropic.claude-opus-4-8` / `anthropic.claude-opus-4-7`
    (which have no ARN-versioned form).

### 🧱 Updated Dependencies

- Updated @agentmark-ai/loader-file to 0.1.5

# 1.0.0 (2026-06-11)

### ⚠️  Breaking Changes

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

### 🧱 Updated Dependencies

- Updated @agentmark-ai/loader-file to 0.1.4

## 0.13.0 (2026-06-11)

### 🚀 Features

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

- Updated @agentmark-ai/loader-file to 0.1.3

## 0.12.1 (2026-06-10)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/fallback-adapter to 1.1.9
- Updated @agentmark-ai/loader-file to 0.1.2

## 0.12.0 (2026-06-10)

### 🚀 Features

- fix(runner): keep the prompt span open until streams drain; record span I/O in both runners ([#730](https://github.com/agentmark-ai/agentmark/pull/730))

  The WebhookRunner's prompt span ended as soon as the executor's lazy
  iterable was created — before the model call ran — in the streaming path
  of both runners and the non-streaming path of the TS runner. Model spans
  were created outside the prompt span (orphaned into a separate trace,
  patched over only by the local server's SessionId-based virtual
  hierarchy), the wrapper span's duration was meaningless (~5ms), and
  streamed runs never recorded `agentmark.output`.

  Both runners now end the prompt span when the event stream drains: the
  Python NDJSON generators take ownership of the span context manager, and
  the TS streaming path resolves the span-hook callback only after the
  wire-stream pump completes (TS non-streaming now drains inside the hook,
  so failed runs also mark the span ERROR).

  The runner — never executors — now records `agentmark.input` (the
  formatted {role, content} messages, JSON) on the prompt span right after
  format(), and `agentmark.output` after drain, in BOTH streaming and
  non-streaming modes. This is what trace-level I/O derivation reads first.

  Cross-language contract pinned by new shared conformance vectors
  (`conformance-vectors/vectors/span-io.json`) run by both suites — all six
  cases fail against the previous runner behavior.

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

- Link prompt version (commit sha) to traces on regular prompt runs: the gateway/CLI dev server stamp the served-at commit into agentmark_meta.commit_sha, the runner threads it through PromptSpanParams, and the SDK span hooks emit it as metadata.commit_sha alongside the new agentmark.prompt_name attribute. ([#738](https://github.com/agentmark-ai/agentmark/pull/738))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/fallback-adapter to 1.1.8

## 0.11.0 (2026-06-09)

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

- Updated @agentmark-ai/conformance-vectors to 0.2.1
- Updated @agentmark-ai/fallback-adapter to 1.1.7

## 0.10.0 (2026-06-09)

### 🚀 Features

- refactor(prompt-core,cli): move webhook dispatch into prompt-core/webhook-runner ([#710](https://github.com/agentmark-ai/agentmark/pull/710))

  `handleWebhookRequest` and its types (`WebhookHandler`, `WebhookRequest`,
  `WebhookResponse`, `TelemetryOptions`, and the `ControlPlaneClient` re-export)
  now live in `@agentmark-ai/prompt-core/webhook-runner`, alongside the
  `WebhookRunner` they pair with.

  Why: a deployed handler's only need from the CLI was this dispatch function, but
  importing `@agentmark-ai/cli/runner-server` drags the CLI's entire dependency
  tree — an embedded Next.js dashboard (`next`, `react`, `@mui/*`, `apexcharts`,
  `better-sqlite3`, ~400 packages) — into the deployed app. The managed-deploy
  build then has to `npm install` all of it just to bundle a handler, which is
  slow and was timing out. The dispatch is generic over the handler and already
  spoke only prompt-core types, so it belongs in prompt-core. A deployed handler
  now depends on `prompt-core` + its adapter only; the CLI stays a dev dependency.

  prompt-core (minor): new public exports at the `webhook-runner` subpath.
  cli (patch): `@agentmark-ai/cli/runner-server` keeps exporting the same symbols
  via thin re-export shims, so existing deployed handlers importing from it keep
  working unchanged. No behavior change — the dispatch logic is byte-identical,
  pinned by the same `conformance-vectors/control-plane.json` golden cases (the
  behavior suite moved to prompt-core's `webhook-dispatch.test.ts`; the CLI keeps
  a back-compat guard asserting the shim still forwards to the implementation).

  Docs updated: the managed `handler.ts` examples now import the dispatch from
  `@agentmark-ai/prompt-core/webhook-runner`; `createWebhookServer` (local dev)
  stays on `@agentmark-ai/cli/runner-server`.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/fallback-adapter to 1.1.6

## 0.9.0 (2026-06-09)

### 🚀 Features

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

- Updated @agentmark-ai/fallback-adapter to 1.1.5

## 0.8.2 (2026-06-07)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/fallback-adapter to 1.1.4
- Updated @agentmark-ai/templatedx to 0.4.1

## 0.8.1 (2026-06-06)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/fallback-adapter to 1.1.3
- Updated @agentmark-ai/templatedx to 0.4.0

## 0.8.0 (2026-06-06)

### 🚀 Features

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

### 🧱 Updated Dependencies

- Updated @agentmark-ai/fallback-adapter to 1.1.2

## 0.7.0 (2026-06-05)

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

- Updated @agentmark-ai/conformance-vectors to 0.2.0
- Updated @agentmark-ai/fallback-adapter to 1.1.1

## 0.6.0 (2026-06-05)

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

- Experiment regression gate, JUnit reporter, baseline protocol, and stable row hashing — all additive. ([#658](https://github.com/agentmark-ai/agentmark/pull/658))

  - **Regression gate** (`gate.ts`): `evaluateExperimentGate()` / `isRegression()` compare per-`(row × scorer)` scores against a stored baseline with a configurable fractional-drop tolerance, and enforce run-level mean thresholds declared via `score_thresholds`.
  - **JUnit reporter** (`junit.ts`): `buildJUnitReport()` / `buildJUnitXml()` produce GitHub-Actions-compatible JUnit XML, surfacing absolute scorer failures and regression-gate failures as `<testcase>` / `<failure>` elements, plus run-level threshold testcases.
  - **Baseline wire protocol** (`baseline.ts`): `baselineRequestQuery()`, `parseBaselineResponse()`, `baselineKey()` single-source the `GET /v1/experiments/baseline` request/response shape so the CLI and SDK can't drift on how baseline scores are fetched and joined.
  - **Stable row hashing** (`hash-input.ts`): `hashRowInput()` — FNV-1a 64-bit over a canonical, key-order-independent JSON form of a row's input; synchronous and runtime-agnostic (no `node:crypto`), so Node, Cloudflare Workers, and browsers produce the same join key.
  - **`TestSettings` schema**: new optional `experiment_key` and `score_thresholds` fields.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/conformance-vectors to 0.1.0
- Updated @agentmark-ai/fallback-adapter to 1.1.0

## 0.5.0 (2026-05-21)

### 🚀 Features

- Parallel experiment runner — dataset rows now execute concurrently through a bounded worker pool instead of one after another. ([#614](https://github.com/agentmark-ai/agentmark/pull/614))

  - `prompt-core` / `prompt-core-python`: new bounded-concurrency helper — `runDatasetPool` / `run_dataset_pool` — and a `DEFAULT_EXPERIMENT_CONCURRENCY` (20) constant. A run processes 20 dataset rows at a time by default.
  - adapters (`ai-sdk-v4`, `ai-sdk-v5`, `mastra-v0`, `claude-agent-sdk-v0`, and the Python `pydantic-ai-v0` / `claude-agent-sdk-v0`): `runExperiment` / `run_experiment` dispatch dataset rows through the pool, so a run is bounded by the slowest row rather than the sum of all rows.
  - `cli`: `agentmark run-experiment` accepts a `--concurrency <n>` flag to override the default per run (any positive integer — the CLI runs on the user's own machine). The flag travels to the runner via the `dataset-run` webhook request.

  Behavior changes worth noting for consumers:
  - A single row failure no longer aborts the whole run — the failed row emits an error chunk and the run continues with the remaining rows.
  - Result chunks stream in completion order, not dataset order. Each row still carries its own `traceId` / dataset item identity, so order-independent consumers are unaffected.

  See: https://github.com/agentmark-ai/app/issues/2326

- Regression-vs-baseline gate predicate, opt-in via `test_settings.regression_tolerance`. ([#599](https://github.com/agentmark-ai/agentmark/pull/599))

  - `prompt-core`: new optional `regression_tolerance` field on `TestSettingsSchema`; `TestSettingsSchema` now publicly exported for downstream validation.
  - `cli`: JUnit formatter applies a second gate predicate when an eval's `baselineScore` is present and the run's score drops more than `regression_tolerance` below it. Failing cases emit a regression-aware `<failure>` message and embed `baseline_score` / `regression_tolerance` / `baseline_commit_sha` in `<properties>`.
  - The predicate is fully opt-in: with no `regression_tolerance` set, or no baseline scores supplied, behaviour is identical to today. The CLI flag that fetches baseline scores from AgentMark Cloud (`--baseline-commit`) and the backend endpoint that serves them ship in a follow-up.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/fallback-adapter to 1.0.6

## 0.4.2 (2026-05-12)

### 🩹 Fixes

- Accumulated small fixes shipped through OSS: ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/ui-components`: stop rendering `[object Object]` in the experiments error alert (surface the actual error message); show the Input/Output tab on trace reopen and avoid the placeholder flash; add `traceId` to the auto-displayed synthetic root span so the lazy IO fetch fires on first render.
  - `@agentmark-ai/cli`: re-ships ui-components with the dashboard fixes above. Eval dispatch envelope handling normalized to accept both legacy and canonical shapes.
  - `@agentmark-ai/create-agentmark`: scaffolded eval handler template aligned with the canonical dispatch envelope (paired with the cli fix).
  - `@agentmark-ai/prompt-core`: internal rename `get-score-configs` → `get-evals` and removal of dead score-code paths. No exported API change.

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

- Updated @agentmark-ai/fallback-adapter to 1.0.5
- Updated @agentmark-ai/loader-file to 0.1.1
- Updated @agentmark-ai/templatedx to 0.3.1

## 0.4.1 (2026-04-14)

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

- Updated @agentmark-ai/fallback-adapter to 1.0.4

## 0.4.0 (2026-04-08)

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

- Updated @agentmark-ai/fallback-adapter to 1.0.3
- Updated @agentmark-ai/templatedx to 0.3.0

## 0.3.0 (2026-03-18)

### 🚀 Features

- Breaking change: removed tool registries from all adapters. Adapters now accept native SDK tools directly. MDX tools field changed from record to string array. MCP bridge utilities removed from Claude adapter. ([#522](https://github.com/agentmark-ai/agentmark/pull/522))

## 0.2.0 (2026-02-19)

### 🚀 Features

- Add seamless pull-models flow with provider/model format ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - prompt-core: validate model names against builtInModels allow-list at load time
  - ai-sdk-v4-adapter, ai-sdk-v5-adapter: add registerProviders() and getModelFunction() for seamless provider/model string resolution; add speech model support
  - claude-agent-sdk-adapter, mastra-v0-adapter: update model registry to use provider/model format
  - create-agentmark: scaffold new projects with builtInModels in provider/model format and registerProviders wiring

## 0.1.2 (2026-02-19)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#495](https://github.com/agentmark-ai/agentmark/pull/495))

# Changelog

## 0.1.1

### Patch Changes

- 53c4b70: Fix: workspace refs

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

### Patch Changes

- Updated dependencies [39bae0f]
  - @agentmark-ai/templatedx@0.1.0

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/prompt-core`.
> See git history for prior changelog entries.
