## 0.8.0 (2026-06-11)

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

## 0.7.0 (2026-06-10)

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

## 0.6.0 (2026-06-09)

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

## 0.5.0 (2026-06-09)

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

## 0.4.0 (2026-06-06)

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

## 0.3.1 (2026-06-05)

### 🩹 Fixes

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


### 🩹 Fixes

- **Python `FileLoader` now matches the TypeScript `FileLoader` API.** ([#606](https://github.com/agentmark-ai/agentmark/pull/606))

  - `agentmark-prompt-core`: `FileLoader` constructor now takes a single `build_dir` positional argument — pointing directly at the build output directory (`agentmark build`'s output), matching `new FileLoader('./dist/agentmark')` in TS. The argument defaults to `"./dist/agentmark"`, so `FileLoader()` from a project root with the conventional build layout Just Works (a Python ergonomic sugar — TS makes the same argument required). The previous `base_dir=` kwarg has been removed; both `load` and `load_dataset` resolve under the same `build_dir`, fixing the internal asymmetry where prompt resolution auto-appended `dist/agentmark` but dataset resolution did not — so `FileLoader("dist/agentmark")` could never be passed without breaking one of the two methods. `load_dataset` now also enforces the `.jsonl` extension, eager-checks file existence, and applies the same traversal validator as `load`. The dataset reader validates each row's shape (`{ input: object, ... }`) with line-number diagnostics on parse / shape failures and rejects empty datasets — closing TS divergences that previously let malformed datasets flow silently into experiment runners. Test suite rewritten to mirror `packages/loader-file/test/file-loader.test.ts` 1:1, with three Python-only suites: the default-arg equivalence guard, the extra path-normalization branches (`.prompt.json` / `.prompt`), and the `{ast, metadata}` unwrap regression. **Breaking**: callers passing `FileLoader(base_dir=...)` will now get `TypeError`; migrate to `FileLoader()` (from a project root) or `FileLoader(str(<project_root> / "dist" / "agentmark"))` for cwd-independent code.
  - `create-agentmark`: Python scaffold updated to emit `FileLoader(str(build_dir))` pointing at `<project_root>/dist/agentmark`, matching the TS scaffold's `new FileLoader("./dist/agentmark")`.

## 0.1.4 (2026-05-14)

### 🩹 Fixes

- **Python `FileLoader` now matches the TypeScript `FileLoader` API.** ([#596](https://github.com/agentmark-ai/agentmark/pull/596))

  - `agentmark-prompt-core`: `FileLoader` constructor now takes a single `build_dir` positional argument — pointing directly at the build output directory (`agentmark build`'s output), matching `new FileLoader('./dist/agentmark')` in TS. The argument defaults to `"./dist/agentmark"`, so `FileLoader()` from a project root with the conventional build layout Just Works (a Python ergonomic sugar — TS makes the same argument required). The previous `base_dir=` kwarg has been removed; both `load` and `load_dataset` resolve under the same `build_dir`, fixing the internal asymmetry where prompt resolution auto-appended `dist/agentmark` but dataset resolution did not — so `FileLoader("dist/agentmark")` could never be passed without breaking one of the two methods. `load_dataset` now also enforces the `.jsonl` extension, eager-checks file existence, and applies the same traversal validator as `load`. The dataset reader validates each row's shape (`{ input: object, ... }`) with line-number diagnostics on parse / shape failures and rejects empty datasets — closing TS divergences that previously let malformed datasets flow silently into experiment runners. Test suite rewritten to mirror `packages/loader-file/test/file-loader.test.ts` 1:1, with three Python-only suites: the default-arg equivalence guard, the extra path-normalization branches (`.prompt.json` / `.prompt`), and the `{ast, metadata}` unwrap regression. **Breaking**: callers passing `FileLoader(base_dir=...)` will now get `TypeError`; migrate to `FileLoader()` (from a project root) or `FileLoader(str(<project_root> / "dist" / "agentmark"))` for cwd-independent code.
  - `create-agentmark`: Python scaffold updated to emit `FileLoader(str(build_dir))` pointing at `<project_root>/dist/agentmark`, matching the TS scaffold's `new FileLoader("./dist/agentmark")`.

## 0.1.3 (2026-05-12)

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

## 0.1.2 (2026-04-14)

### 🩹 Fixes

- Declare `agentmark-templatedx` as a runtime dependency. ([#581](https://github.com/agentmark-ai/agentmark/pull/581))

  `agentmark/prompt_core/template_engines/instances.py` imports
  `templatedx` at module load (`from templatedx import TemplateDX`), but the
  published `agentmark-prompt-core` distribution did not list
  `agentmark-templatedx` in its install-requires. Anyone who installs
  `agentmark-prompt-core` from PyPI into a clean environment and imports the
  package hits `ModuleNotFoundError: No module named 'templatedx'`.

  Previously this was masked by the AgentMark managed-builder's Python package
  bundling — every agentmark-* package was copied in as a local-path install
  regardless of declared deps, so templatedx was always present. Once that
  bundling was removed in favour of standard PyPI installs, the missing
  declaration became a runtime crash in deployed handlers.

  Fix: add `agentmark-templatedx>=0.1.1` to `[project].dependencies` in
  `pyproject.toml`. No code changes, no API surface change.

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