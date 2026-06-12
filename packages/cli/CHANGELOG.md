## 0.23.2 (2026-06-12)

### 🩹 Fixes

- Replace hardcoded `party-planner.prompt.mdx` example path in the `dev` startup banner with a generic `<your-prompt>.prompt.mdx` placeholder. ([#773](https://github.com/agentmark-ai/agentmark/pull/773))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.9.4
- Updated @agentmark-ai/prompt-core to 1.0.3

## 0.23.1 (2026-06-12)

### 🩹 Fixes

- pip fallback chain (pip → pip3 → .venv/bin/pip), clearer GENERATION span upgrade message, synchronous dev-server teardown to free port after --smoke --boot ([#770](https://github.com/agentmark-ai/agentmark/pull/770))

## 0.23.0 (2026-06-12)

### 🚀 Features

- Python + Bedrock onboarding fixes (friction report from a real first-contact setup): ([#767](https://github.com/agentmark-ai/agentmark/pull/767), [#766](https://github.com/agentmark-ai/agentmark/issues/766))

  - `agentmark-prompt-core` (Python): new `serve_webhook_runner(runner)` — a stdlib HTTP
    server for the `.agentmark/dev_server.py` entry point, the Python counterpart of the
    TS `createWebhookServer`. Parses the `--webhook-port` flag `agentmark dev` passes,
    serves `runner.dispatch` (POST `{type, data}` → JSON or `AgentMark-Streaming` NDJSON
    with a trailing `done`/`traceId` event), and runs all user async code on one
    persistent event loop. Previously the documented Python entry point built a runner
    and exited — there was no way to serve it without hand-rolling the wire contract.
    Also: `_classify_span_as_llm` now stamps `gen_ai.operation.name="chat"` and
    `agentmark.span.kind="llm"` so the normalizer classifies the span as GENERATION
    (fixes the Requests view showing nothing for Bedrock/raw-executor users); eval
    functions now work whether `def` or `async def` via `inspect.isawaitable`.
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
    happened to be a local dependency). Also: `doctor` now runs the real pip check
    instead of silently skipping it for Python projects; `doctor --smoke` gains a
    `smoke.generationSpan` check that fails with an actionable fix when no GENERATION
    span is found (catches the Requests-view-empty symptom before it reaches prod).
  - `@agentmark-ai/prompt-core` (TS): the local dev server's streaming responses now
    always carry `Content-Type: application/x-ndjson` alongside `AgentMark-Streaming`
    (the managed deploy servers already sent both; the dispatch's header fallback
    didn't). The HTTP layer of both local dev servers is now pinned to the shared
    `conformance-vectors/webhook-http.json` so TS and Python can't drift. Also:
    `classifySpanAsLlm` stamps `gen_ai.operation.name="chat"` and
    `agentmark.span.kind="llm"` on all text/object call sites (mirrors the Python fix).
  - `@agentmark-ai/model-registry`: current Claude Bedrock model IDs in overrides —
    Opus 4.6 (`anthropic.claude-opus-4-6-v1`), Sonnet 4.6, Sonnet 4.5, Opus 4.5, and
    Haiku 4.5 ARN-versioned IDs with their `global.`/`us.`/`eu.`/`jp.`/`apac.`
    cross-region inference profiles (regional entries carry the 10% CRIS premium), plus
    the Messages-API Bedrock IDs `anthropic.claude-opus-4-8` / `anthropic.claude-opus-4-7`
    (which have no ARN-versioned form). Also: model registry fetch now tries raw GitHub
    (no CDN cache) first and falls back to jsDelivr, eliminating the ~24h stale-cache
    false-positive "model not recognized" warning after a new model is published.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/model-registry to 0.5.0
- Updated @agentmark-ai/ui-components to 0.9.3
- Updated @agentmark-ai/prompt-core to 1.0.2

## 0.22.1 (2026-06-12)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/api-types to 0.8.0

## 0.22.0 (2026-06-12)

### 🚀 Features

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

- Updated @agentmark-ai/model-registry to 0.4.0
- Updated @agentmark-ai/ui-components to 0.9.2
- Updated @agentmark-ai/prompt-core to 1.0.1

## 0.21.0 (2026-06-11)

### 🚀 Features

- feat(search): structured JSON filter schemas for the v2 search endpoints ([#753](https://github.com/agentmark-ai/agentmark/pull/753))

  New `filters` schemas (`FilterLeafSchema`, `FilterOrGroupSchema`,
  `FilterNodeSchema`) and search body schemas (`TracesSearchBodySchema`,
  `SpansSearchBodySchema`, `ScoresSearchBodySchema`) backing
  `POST /v1/{traces|spans|scores}/search`, plus
  `FilterSchemaResponseSchema` for the `GET /v1/filter-schema` discovery
  endpoint. Operators reuse the canonical `AnalyticsFilter` vocabulary and
  add JSON-only `in` / `notIn` / `between`. `ScoresParams` gains an optional
  `filters?: AnalyticsFilterNode[]` (api-types) — existing callers are
  unaffected.

  The local dev server (`agentmark dev`) serves `GET /v1/filter-schema` from
  the same shared tables (identical contract to cloud by construction) and
  answers the `POST /search` endpoints with a structured
  `501 not_available_locally` until the local SQLite filter compiler lands.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.9.1
- Updated @agentmark-ai/api-schemas to 0.6.0
- Updated @agentmark-ai/prompt-core to 1.0.0
- Updated @agentmark-ai/api-types to 0.7.0

## 0.20.2 (2026-06-11)

### 🩹 Fixes

- Onboarding fixes from a real-world setup report: ([#752](https://github.com/agentmark-ai/agentmark/pull/752))

  - mcp-server: expired sessions auto-refresh via the `refresh_token` in
    `~/.agentmark/auth.json` (persisted back, CLI-compatible); login hints name
    `npx @agentmark-ai/cli login` (the `agentmark` npm package does not exist)
  - cli: doctor labels state the actual condition ("dev server entry missing",
    not "present ⚠"); python dev server gets the project root on PYTHONPATH and
    a per-run bytecode-cache prefix (stale .pyc can no longer mask edits);
    `dev` warns when the linked trace-forwarding endpoint is unreachable;
    dev-config.json is never written outside an agentmark project;
    `doctor --smoke` names missing init_tracing as the likely no-trace cause

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.9.0
- Updated @agentmark-ai/shared-utils to 0.6.1
- Updated @agentmark-ai/api-schemas to 0.5.0
- Updated @agentmark-ai/prompt-core to 0.13.0
- Updated @agentmark-ai/api-types to 0.6.0

## 0.20.1 (2026-06-10)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.8.2
- Updated @agentmark-ai/prompt-core to 0.12.1

## 0.20.0 (2026-06-10)

### 🚀 Features

- Link prompt version (commit sha) to traces on regular prompt runs: the gateway/CLI dev server stamp the served-at commit into agentmark_meta.commit_sha, the runner threads it through PromptSpanParams, and the SDK span hooks emit it as metadata.commit_sha alongside the new agentmark.prompt_name attribute. ([#738](https://github.com/agentmark-ai/agentmark/pull/738))
- feat(pricing): layered model-id price resolution ([#725](https://github.com/agentmark-ai/agentmark/pull/725))

  Adds an fs-free `@agentmark-ai/model-registry/pricing` entry point that
  centralizes model→price mapping: `buildPricingDictionary` (per-token →
  per-1K conversion, previously duplicated across consumers) and
  `resolveModelPrice`/`resolveModelKey` with layered matching — exact id,
  then normalized candidates (provider path prefixes like `openai/` and
  `models/`, OpenAI fine-tune ids `ft:base:org::id`, Bedrock cross-region
  prefixes `us.`/`eu.`, version suffixes `-2024-08-06`/`@20241022`/`-latest`),
  then case-insensitive, then longest boundary-prefix fallback.

  `ModelRegistry.getPricingForModel` and the CLI's local trace cost
  attribution now resolve through these rules, so spans reporting
  provider-prefixed, fine-tuned, region-prefixed, or newly released dated
  model ids price against the closest registry entry instead of $0.


### 🩹 Fixes

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

- Canonicalize OTLP status codes to numeric strings in the span normalizer; CLI read mappers accept legacy enum-name variants from older local DBs ([#735](https://github.com/agentmark-ai/agentmark/pull/735))
- fix(cli): derive trace-level input/output on local GET /v1/traces/:id ([#731](https://github.com/agentmark-ai/agentmark/pull/731))

  The local dev server's trace-detail route maps getTraceById →
  mapRawTraceToDetail → toTraceDetailWire, but mapRawTraceToDetail never
  populated `TraceDetail.input`/`output` (getTraceById's SQL doesn't
  aggregate them), and toTraceDetailWire omits undefined keys — so the
  local wire response never carried trace-level I/O. This made `doctor
  --smoke`'s traceShape check (`trace.input == null` / `trace.output ==
  null`) structurally unsatisfiable against the local server, failing for
  every project regardless of wiring.

  mapRawTraceToDetail now mirrors the cloud gateway's
  transformTraceDetail: trace input = first GENERATION span's input,
  trace output = last GENERATION span's output, in timestamp order.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/model-registry to 0.3.0
- Updated @agentmark-ai/ui-components to 0.8.1
- Updated @agentmark-ai/shared-utils to 0.6.0
- Updated @agentmark-ai/prompt-core to 0.12.0
- Updated @agentmark-ai/api-types to 0.5.0

## 0.19.0 (2026-06-09)

### 🚀 Features

- fix(doctor): remove obsolete adapter dependency checks ([#722](https://github.com/agentmark-ai/agentmark/pull/722))

  SDK-specific adapters are being removed from AgentMark — there is no
  `@agentmark-ai/*-adapter` to require, and your model SDK is your own choice. So
  `agentmark doctor` drops two now-meaningless checks:

  - `deps.adapter` — previously warned when no `@agentmark-ai/*-adapter` was
    installed ("prompts need one to run end-to-end"). Untrue now: prompts run
    through the neutral render plus your SDK, or an executor.
  - `deps.provider` — the AI-SDK-adapter ↔ `@ai-sdk/*` provider major-version
    coherence sub-check. Moot without an adapter.

  `deps.sdk` (is `@agentmark-ai/sdk` installed, for tracing + the cloud-execution
  runner) stays. `doctor --smoke` remains the end-to-end proof that a prompt
  actually runs. **Contract note:** the `--json` `results[].id` set no longer
  includes `deps.adapter` / `deps.provider`; consumers that branched on them should
  stop. The live `doctor --json` output is the authority for the current id set.

## 0.18.1 (2026-06-09)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.8.0

## 0.18.0 (2026-06-09)

### 🚀 Features

- feat(cli): doctor --smoke verifies evals are listable; deprecate vestigial agentmark.json `evals` ([#717](https://github.com/agentmark-ai/agentmark/pull/717))

  `agentmark doctor --smoke` gains a `smoke.evals` check. After the live prompt
  run, it POSTs the `get-evals` control-plane job to the dev server and asserts the
  handler answers with the canonical `{ type: "evals" }` envelope. This is the
  verification surface for the unified-dispatch feature: it catches the exact
  failure behind *"No evals available"* in the New Experiment dialog — a deployed
  handler that runs prompts fine but can't list evals (e.g. a hand-rolled
  prompt-run/dataset-run switch instead of `runner.dispatch`). It passes with the
  registered eval count (a clean "0 evals registered" when none), fails with a fix
  pointing at `runner.dispatch`, and warns (never blocks) if the probe itself errors.

  Also deprecates the top-level `evals` field in `agentmark.json`. The dashboard
  now lists a running app's evals live via that same get-evals job, so the static
  declaration has no effect. It is marked `deprecated` in the bundled schema but
  stays a *known* key, so existing configs that still carry it validate unchanged
  (no new unknown-key warning). The schema's properties are now pinned against the
  CLI's `KNOWN_CONFIG_KEYS` so the two can't drift in either direction.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/conformance-vectors to 0.2.1
- Updated @agentmark-ai/ui-components to 0.7.1
- Updated @agentmark-ai/prompt-core to 0.11.0

## 0.17.2 (2026-06-09)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.7.0

## 0.17.1 (2026-06-09)

### 🩹 Fixes

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

- Updated @agentmark-ai/ui-components to 0.6.9
- Updated @agentmark-ai/prompt-core to 0.10.0

## 0.17.0 (2026-06-09)

### 🚀 Features

- feat(cli): add `agentmark doctor`, a static setup health check ([#708](https://github.com/agentmark-ai/agentmark/pull/708))

  `agentmark doctor` inspects an AgentMark project without a network call or
  spawning a server, and reports each finding with an actionable fix:
  agentmark.json validity, the `agentmarkPath: "/"` footgun, and field/schema
  shape (required keys present, no unknown top-level keys); the three setup files
  (`agentmark.client.ts`/`agentmark_client.py`, the dev-server entry, and the
  managed-deploy handler); env/credential hygiene (`.env` gitignored,
  `AGENTMARK_API_KEY` / `AGENTMARK_APP_ID` set); prompt frontmatter + `model_name`;
  prompt models declared in `builtInModels` (which prompt-core enforces as an
  allowlist when non-empty); builtInModels recognized by the model catalog; and AI
  SDK adapter/provider major-version coherence. `--json` for machine output,
  `--strict` to fail on warnings in CI.

  The setup-file checks map to the real run paths: the client is required for
  everything (fail when missing), the dev-server entry backs local
  run-prompt/run-experiment (warn), and `handler.ts`/`handler.py` is the entry
  AgentMark Cloud bundles for managed deployment: warn when absent, fail when an
  explicit `handler` key in agentmark.json points at a file that does not exist.

  It reuses the same helpers the other commands do (project-layout, setup-file
  resolution, and model classification), so its findings match what `dev`,
  `build`, and `generate-schema` act on. As part of that refactor, the "no
  agentmark.json here" error is now unified across `build`, `generate-schema`, and
  `pull-models` (the latter two previously pointed at a non-existent `agentmark
  init`).

  `--smoke` adds an opt-in live tier (assumes `agentmark dev` is running): it runs
  one representative prompt through the dev-server webhook (the same path
  `run-prompt` uses), confirms real content + token usage came back, then fetches
  the emitted trace from the local API server and checks its shape (token usage,
  input, output, and a model on a span). That verifies the SDK, adapter/executor,
  provider credentials, and tracing-in-the-right-format end to end, indirectly,
  with no provider-specific knowledge. `--prompt <path>` picks the prompt to run;
  `--boot` starts `agentmark dev` headless and tears it down after, so the live
  check is a single command (for CI / agents) instead of a two-terminal dance.

  `--json` emits `{ ok, counts, results: [{ id, group, title, status, detail, fix }] }`
  with stable check ids and a `pass | warn | fail | skip` status, so agents can
  branch on the result and apply each `fix` programmatically.

## 0.16.5 (2026-06-09)

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

- fix(cli): agentmark dev runs the adapter in local mode, not cloud ([#701](https://github.com/agentmark-ai/agentmark/pull/701))

  `agentmark dev` forwarded the project env, including `AGENTMARK_API_KEY` /
  `AGENTMARK_APP_ID` from a local `.env`, to the spawned adapter. The client read
  the presence of those creds as "use cloud", so the adapter loaded deployed
  prompts and datasets from `api.agentmark.co` and bypassed the local files the
  dev server serves, with locally resolved datasets coming through empty. The
  spawn now strips the cloud creds and any cloud `AGENTMARK_BASE_URL` from the
  adapter env and pins `AGENTMARK_DEV_SERVER` to the local API server, for both
  the Python and TypeScript adapters, logging a notice when cloud creds are
  detected. Trace forwarding to prod is unaffected: it runs off this process's
  `TraceForwarder` using `agentmark link` creds, not the adapter's env.

- fix(cli): point `agentmark dev` setup errors at the setup skill + client-setup docs ([#697](https://github.com/agentmark-ai/agentmark/pull/697))

  When `agentmark dev` could not find `agentmark.client.ts` / `agentmark_client.py`
  or a dev-server entry, it told users to "run create-agentmark" — the step they
  had usually already run. Those files are written by the editor's "Set up
  AgentMark in this project" skill, not the scaffolder, so the old message pointed
  people at the wrong fix. The errors now name that skill and link the
  client-setup guide.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.6.8
- Updated @agentmark-ai/shared-utils to 0.5.1
- Updated @agentmark-ai/prompt-core to 0.9.0

## 0.16.4 (2026-06-07)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.6.7
- Updated @agentmark-ai/prompt-core to 0.8.2
- Updated @agentmark-ai/templatedx to 0.4.1

## 0.16.3 (2026-06-06)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.6.6
- Updated @agentmark-ai/prompt-core to 0.8.1
- Updated @agentmark-ai/templatedx to 0.4.0

## 0.16.2 (2026-06-06)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.6.5
- Updated @agentmark-ai/prompt-core to 0.8.0

## 0.16.1 (2026-06-05)

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

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.6.4
- Updated @agentmark-ai/prompt-core to 0.7.0

## 0.16.0 (2026-06-05)

### 🚀 Features

- Environment-scoped types + alerts schema extension + regenerated CLI OpenAPI spec, accompanying features 054 (Environments & Promotion) and 055 (Environment-Centric Navigation). ([#631](https://github.com/agentmark-ai/agentmark/pull/631))

  - `api-types`: types updated to surface environment context on resources that gain env scoping (trace / score / session env-tagging; environment lifecycle; promotion history).
  - `api-schemas`: `alert` create/read schemas gain an optional, nullable `environment_id` so an alert can be scoped to a single environment of an app (NULL = app-wide, the existing behaviour). Backwards-compatible — every existing producer/consumer continues to round-trip without the field.
  - `cli`: bundled `openapi-spec.json` regenerated to include the new `/v1/environments/*` and promote/rollback routes shipping with 054; minor cleanup in `index.ts`.

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

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.6.3
- Updated @agentmark-ai/shared-utils to 0.5.0
- Updated @agentmark-ai/api-schemas to 0.4.0
- Updated @agentmark-ai/prompt-core to 0.6.0
- Updated @agentmark-ai/api-types to 0.4.0

## 0.15.0 (2026-05-21)

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

- **`/v1/requests` endpoint on the local dev server:** ([#606](https://github.com/agentmark-ai/agentmark/pull/606))

  - `@agentmark-ai/api-schemas`: New `schemas/requests.ts` module — `RequestsListParamsSchema` (pagination) plus `RequestResponseSchema` / `RequestsListResponseSchema` (`{ data, pagination }` envelope) describing the per-request (GENERATION-span) record. Additive — no changes to existing schemas.
  - `@agentmark-ai/api-types`: Regenerated to include the new request types derived from the schemas above.
  - `@agentmark-ai/cli`: Local dev server now serves `GET /v1/requests`, returning the canonical paginated envelope from the local trace store (the dashboard's "Requests" page is now backed by a real route instead of always 404-ing to an empty list). Internals: the former `local-prompt-logs-service` is renamed to `local-requests-service`, with matching `toRequestsListWire` wire mappers and an `openapi-spec.json` entry for `/v1/requests`.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.6.2
- Updated @agentmark-ai/shared-utils to 0.4.0
- Updated @agentmark-ai/api-schemas to 0.3.0
- Updated @agentmark-ai/prompt-core to 0.5.0
- Updated @agentmark-ai/api-types to 0.3.0

## 0.14.0 (2026-05-12)

### 🚀 Features

- **`/v1/requests` endpoint on the local dev server:** ([#591](https://github.com/agentmark-ai/agentmark/pull/591), [#587](https://github.com/agentmark-ai/agentmark/issues/587))

  - `@agentmark-ai/api-schemas`: New `schemas/requests.ts` module — `RequestsListParamsSchema` (pagination) plus `RequestResponseSchema` / `RequestsListResponseSchema` (`{ data, pagination }` envelope) describing the per-request (GENERATION-span) record. Additive — no changes to existing schemas.
  - `@agentmark-ai/api-types`: Regenerated to include the new request types derived from the schemas above.
  - `@agentmark-ai/cli`: Local dev server now serves `GET /v1/requests`, returning the canonical paginated envelope from the local trace store (the dashboard's "Requests" page is now backed by a real route instead of always 404-ing to an empty list). Internals: the former `local-prompt-logs-service` is renamed to `local-requests-service`, with matching `toRequestsListWire` wire mappers and an `openapi-spec.json` entry for `/v1/requests`.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.6.1
- Updated @agentmark-ai/api-schemas to 0.2.0
- Updated @agentmark-ai/api-types to 0.2.0

## 0.13.0 (2026-05-12)

### 🚀 Features

- Add POST /v1/scores/batch endpoint for bulk score ingestion (up to 1000 scores per request, 207-style per-item results). ([#583](https://github.com/agentmark-ai/agentmark/pull/583))
- **REST API for managed deployments (spec 053):** ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/api-schemas`: New `schemas/deployments.ts` module with Zod schemas for managed deployment resources (additive — no breaking changes to existing schemas).
  - `@agentmark-ai/api-types`: Regenerated to include the new deployment types.
  - `@agentmark-ai/cli`: Local dev server now serves the deployment endpoints (cloud-only behavior returns 501 stubs); `openapi-spec.json` extended with deployment routes for consumers of the spec.

- Add `?name=X` lookup to `/v1/prompts` (gateway + OSS): ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/api-schemas`: New `ListPromptsQuerySchema` accepting an optional `name` param, plus `ListPromptsBodySchema` (`{ paths: string[] }`) and `ListPromptsResponseSchema` envelope so consumers can resolve prompts by name without scanning a list.
  - `@agentmark-ai/api-types`: Regenerated to include the new query/response types.
  - `@agentmark-ai/cli`: Local dev server's `GET /v1/prompts` now accepts an optional `?name=X` query param and returns matching paths (single-element array on convention-match, possibly more on frontmatter scan).

- Add "Test prompt" button to the trace drawer, surfacing the originating prompt's name/variables directly from a span: ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/ui-components`: New `TestPromptDialog` component plus `buildRunPromptCommand` (and `singleQuoteShellEscape` helper) under `./sections/traces/components`. New `extractSpanPromptName` and `extractSpanTemplateProps` helpers in `./sections/traces/utils/extract-span-data`. All additive — existing exports unchanged.
  - `@agentmark-ai/cli`: Dashboard wires the new "Test prompt" button into the trace drawer; new `src/lib/api/prompts.ts` client + `src/lib/api/traces.ts` extensions for prompt resolution and wire-shape utilities used by the dialog.

- Implement `GET /v1/pricing` on the local dev server. Serves the bundled `@agentmark-ai/model-registry` pricing snapshot so SDK consumers pointing at `agentmark dev` see the same cost data shape they'd get from cloud. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))
- **BREAKING:** Remove `@agentmark-ai/connect` package and the CLI `--remote` flag. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - The `@agentmark-ai/connect` WebSocket client package is removed from the workspace. The package's last published version on npm (`0.2.1`) remains available for existing consumers but will not receive further updates.
  - `agentmark dev --remote` is removed; the local dev server no longer establishes a websocket back to the cloud platform. Use platform-managed deployments instead (see spec 053 / `/v1/deployments`).
  - The associated `JobHandler` and `WebSocketClient` imports in `cli-src/commands/dev.ts` are removed; the dev command no longer accepts `remote` in its options.

- **BREAKING:** Remove `agentmark export traces` command. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  The cloud gateway's `GET /v1/traces/export` endpoint has been deleted as part of the trace-API consolidation — the surface is now `GET /v1/traces` with filters, matching the industry convention (Langfuse, LangSmith, Arize). Client-side JSONL/CSV/OpenAI-format conversion is a three-line loop; see the `GET /v1/traces` docs for the replacement pattern.

- **REST API parity (spec 052):** ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/api-schemas`: New Zod schemas for `score-configs` and `api-keys`. Extended `spans` with `start_date`, `end_date`, `user_id`, `session_id`, `filter` (JSON DSL). Added `session_id` to `scores`. Added `assigned_to_me` to `annotation-queues`. New canonical `DatasetSchema` + `DatasetsListParamsSchema`/`DatasetsListResponseSchema` for `/v1/datasets`. **Breaking:** `/v1/datasets` now returns the canonical `{ data: [{ name, row_count, created_at }], pagination }` envelope and accepts `name`/`limit`/`offset` query params. The legacy flat-shape response (`{ datasets: string[] }`) and `LegacyDatasetsListResponseSchema` are removed.
  - `@agentmark-ai/api-types`: Regenerated to include the new schema-derived types.
  - `@agentmark-ai/cli`: Local dev server now serves `GET /v1/score-configs` and `GET /v1/score-configs/{name}` from the local `agentmark.json`. Added 501 stubs for `/v1/api-keys` (cloud-only). **Breaking:** local `GET /v1/datasets` upgraded to the canonical paginated envelope (matches the cloud change). The dashboard `getDatasets()` helper now calls the new endpoint and extracts `name` from each row.


### 🩹 Fixes

- Fix route-ordering bug where `GET /v1/scores/aggregations` was being caught by `GET /v1/scores/:scoreId` (returning a 404 score-not-found instead of the intended 501 cloud-only stub). ([#583](https://github.com/agentmark-ai/agentmark/pull/583))
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

- Harden error parser to read gateway's canonical nested error envelope ([#583](https://github.com/agentmark-ai/agentmark/pull/583))
  (`{ error: { code, message } }`). Previous flat-string shape is still
  accepted as a fallback.

- **License change: MIT → AGPL-3.0-or-later.** ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  The runtime code is byte-identical to the previous patch release — only the
  `LICENSE.md` file and the `license` field in each `package.json` change. Bumping
  as a patch (not a major) because no compile/runtime behavior is affected.

  **Downstream impact (please read before upgrading):** AGPL-3.0 has copyleft
  and network-use obligations that MIT does not. Consumers using these packages
  in proprietary or SaaS products may need to evaluate compatibility before
  upgrading. Users who need the MIT terms can pin to the last MIT-licensed
  release of each package.

- Bump `hono`, `next-intl`, and `ip-address` to satisfy Dependabot security advisories. No API or behavior changes. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))
- Periodic model-registry data sync — refreshes the bundled pricing/model snapshot served from the CLI's local `/v1/pricing` endpoint and consumed by SDKs that rely on the model-registry workspace dep. No API changes. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/model-registry to 0.2.4
- Updated @agentmark-ai/ui-components to 0.6.0
- Updated @agentmark-ai/shared-utils to 0.3.3
- Updated @agentmark-ai/api-schemas to 0.1.0
- Updated @agentmark-ai/prompt-core to 0.4.2
- Updated @agentmark-ai/templatedx to 0.3.1
- Updated @agentmark-ai/api-types to 0.1.0

## 0.12.2 (2026-04-14)

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

- Updated @agentmark-ai/model-registry to 0.2.3
- Updated @agentmark-ai/ui-components to 0.5.2
- Updated @agentmark-ai/prompt-core to 0.4.1
- Updated @agentmark-ai/connect to 0.2.1

## 0.12.1 (2026-04-13)

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

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.5.1
- Updated @agentmark-ai/shared-utils to 0.3.2

## 0.12.0 (2026-04-09)

### 🚀 Features

- Document the `agentmark export traces` CLI feature that was previously missed for versioning. ([#559](https://github.com/agentmark-ai/agentmark/pull/559))

  Commit [`76a049ec`](https://github.com/agentmark-ai/app/commit/76a049ec) *"feat: add CLI `agentmark export traces` command and gateway test coverage"* (Phase 3 of #1819, merged to main on 2026-04-08) added a substantial new CLI command without an accompanying nx version plan, so nx release would not have picked up the change on its own.

  This plan retroactively pins a **minor** bump for `@agentmark-ai/cli` because the work is strictly additive feature surface — not a bug fix:

  - New command: `agentmark export traces` with flags `--format`, `--score`, `--since`, `--until`, `--limit`, `--dry-run`, `--output`, and filter flags
  - New score filter parsing (`correctness>=0.8` → `minScore` query param)
  - New dual-auth flow (API key from forwarding config **or** JWT from login)
  - New dry-run mode that fetches a 3-row sample and displays a summary
  - New file output handling with overwrite protection and stdout piping
  - New readable error messages for 400 / 401 / 403 / 429 responses

  Strict semver and the existing monorepo convention (see `b579c19f`) both put this at `minor` for new features.


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

### 🧱 Updated Dependencies

- Updated @agentmark-ai/model-registry to 0.2.2

## 0.11.0 (2026-04-08)

### 🚀 Features

- Add dataset sampling support: percentage-based sampling with seed reproducibility, ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))
  specific row selection via indices/ranges, and train/test split for experiments.
  New CLI flags: --sample, --rows, --split, --seed on run-experiment command.

  (claude-agent-sdk-v0-adapter was dropped from this plan when restoring it because its bump shipped in a later release.)


### 🩹 Fixes

- fix(cli): bump @agentmark-ai/templatedx pin to pick up resolveAstSchemaRefs ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

  The previously pinned templatedx@0.2.0 did not export `resolveAstSchemaRefs`. The CLI's `run-prompt` and `build` commands destructure that symbol from the package and call it, so they crashed with "resolveAstSchemaRefs is not a function" at runtime. Bumping the pin to the republished templatedx (which now ships the export from `schema-ref-resolver.ts`) restores `agentmark run` and `agentmark build`.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.5.0
- Updated @agentmark-ai/shared-utils to 0.3.1
- Updated @agentmark-ai/prompt-core to 0.4.0
- Updated @agentmark-ai/templatedx to 0.3.0
- Updated @agentmark-ai/connect to 0.2.0

## 0.10.3 (2026-04-08)

### 🧱 Updated Dependencies

- Updated `@agentmark-ai/model-registry` to `0.2.1`. The previously pinned `0.2.0` was a broken publish that shipped raw TypeScript source instead of compiled JS, which caused `npx @agentmark-ai/cli ui` to crash on Node ≥22.6 with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Bumping the pin picks up the republished `0.2.1` that ships `dist/index.js` and a correct `main` field.

## 0.10.2 (2026-04-08)

### 🩹 Fixes

- Convert `next.config.ts` to `next.config.mjs` to drop the runtime `typescript` dependency. Fixes the npx UI server crash where Next.js could not parse the `.ts` config because `typescript` was only listed in `devDependencies`. ([#547](https://github.com/agentmark-ai/agentmark/pull/547))

## 0.10.1 (2026-03-18)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.3.0
- Updated @agentmark-ai/prompt-core to 0.3.0

## 0.10.0 (2026-03-03)

### 🚀 Features

- feat: add experiments UI with list, detail, and comparison views ([#502](https://github.com/agentmark-ai/agentmark/pull/502))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.4.0

## 0.9.0 (2026-02-19)

### 🚀 Features

- Add seamless pull-models flow with provider/model format ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - prompt-core: validate model names against builtInModels allow-list at load time
  - ai-sdk-v4-adapter, ai-sdk-v5-adapter: add registerProviders() and getModelFunction() for seamless provider/model string resolution; add speech model support
  - claude-agent-sdk-adapter, mastra-v0-adapter: update model registry to use provider/model format
  - create-agentmark: scaffold new projects with builtInModels in provider/model format and registerProviders wiring
- Show remote trace URL when running `agentmark dev --remote` ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  When trace forwarding is active, `agentmark run` now prints both the local
  and remote trace URLs after each prompt execution, along with a warning that
  remote traces may take up to 1 minute to appear.
  - Add `org_name` to `DevKeyResponse` interface (returned by the updated platform API)
  - Add `orgName` to `ForwardingConfig` so the remote URL can be constructed from the persisted config
  - `run-prompt` conditionally shows the remote URL when forwarding is active; falls back to the plain local URL for unlinked sessions

### 🩹 Fixes

- Fix agentmark.json missing from initial git commit and duplicate dev-config.json locations ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - create-agentmark: move initGitRepo() to main() so it runs after agentmark.json is written, ensuring all files land in the initial commit
  - cli: add findProjectRoot() that walks up to find agentmark.json, anchoring .agentmark/dev-config.json there as a single source of truth regardless of which directory agentmark dev is run from
- Fix pull-models UX: require at least one model selection, show accurate success message, and remove prompt.schema.json auto-generation ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - Add `min: 1` to the models multiselect so users can't accidentally confirm with zero selections
  - Replace generic "Models pulled successfully." with "Added N model(s): ..." to accurately reflect what changed
  - Remove automatic `prompt.schema.json` regeneration from `pull-models` (schema generation was not reliably useful without additional IDE setup)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.2.0
- Updated @agentmark-ai/prompt-core to 0.2.0

## 0.8.2 (2026-02-19)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#495](https://github.com/agentmark-ai/agentmark/pull/495))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.1.2
- Updated @agentmark-ai/prompt-core to 0.1.2

## 0.8.1 (2026-02-17)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#492](https://github.com/agentmark-ai/agentmark/pull/492))

## 0.8.0 (2026-02-14)

### 🚀 Features

- Add --remote flag for one-step platform connection (login + tunnel + forwarding) ([#486](https://github.com/agentmark-ai/agentmark/pull/486))

### 🩹 Fixes

- Increase API server body limit to 10mb for OTLP trace payloads ([#486](https://github.com/agentmark-ai/agentmark/pull/486))
- Show webhook secret in --remote banner, simplify generated npm scripts to single `agentmark` command, and fix duplicate trace exporter in SDK. ([#479](https://github.com/agentmark-ai/agentmark/pull/479))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.6

## 0.7.0 (2026-02-14)

### 🚀 Features

- Add --remote flag for one-step platform connection (login + tunnel + forwarding) ([#482](https://github.com/agentmark-ai/agentmark/pull/482))

### 🩹 Fixes

- Increase API server body limit to 10mb for OTLP trace payloads ([#482](https://github.com/agentmark-ai/agentmark/pull/482))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.5

## 0.6.0 (2026-02-13)

### 🚀 Features

- Add --remote flag for one-step platform connection (login + tunnel + forwarding) ([#477](https://github.com/agentmark-ai/agentmark/pull/477))

### 🩹 Fixes

- Increase API server body limit to 10mb for OTLP trace payloads ([#477](https://github.com/agentmark-ai/agentmark/pull/477))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.4

## 0.5.3 (2026-02-13)

### 🩹 Fixes

- Increase API server body limit to 10mb for OTLP trace payloads ([#475](https://github.com/agentmark-ai/agentmark/pull/475))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.3

## 0.5.2 (2026-02-13)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.2

## 0.5.1 (2026-02-13)

### 🩹 Fixes

- Move model-registry to OSS as @agentmark-ai/model-registry, update CLI to use import syntax ([#471](https://github.com/agentmark-ai/agentmark/pull/471))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/model-registry to 0.2.0

## 0.5.0 (2026-02-04)

### 🚀 Features

- Use cloudflared instead of local tunnel ([#459](https://github.com/agentmark-ai/agentmark/pull/459))

## 0.4.1 (2026-01-28)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.1

## 0.4.0 (2026-01-21)

### 🚀 Features

- Fix: security issues ([#449](https://github.com/agentmark-ai/agentmark/pull/449))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.0
- Updated @agentmark-ai/shared-utils to 0.3.0
- Updated @agentmark-ai/shared-utils to 0.3.0
- Updated @agentmark-ai/templatedx to 0.2.0
- Updated @agentmark-ai/templatedx to 0.2.0

# Changelog

## 0.3.0

### Minor Changes

- 97abbdd: Add claude agent sdk adapter
- a4a1d95: Support mcp server

### Patch Changes

- Updated dependencies [97abbdd]
  - @agentmark-ai/shared-utils@0.2.0

## 0.2.0

### Minor Changes

- 03c4c2c: Feat: Timeline view

## 0.1.1

### Patch Changes

- 53c4b70: Fix: workspace refs
- Updated dependencies [53c4b70]
  - @agentmark-ai/prompt-core@0.1.1

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

### Patch Changes

- Updated dependencies [39bae0f]
  - @agentmark-ai/shared-utils@0.1.0
  - @agentmark-ai/prompt-core@0.1.0
  - @agentmark-ai/templatedx@0.1.0

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/cli`.
> See git history for prior changelog entries.
