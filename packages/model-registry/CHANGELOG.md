## 0.5.0 (2026-06-12)

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

## 0.4.0 (2026-06-12)

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

## 0.3.0 (2026-06-10)

### 🚀 Features

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

## 0.2.4 (2026-05-12)

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

- Periodic model-registry data sync — refreshes the bundled pricing/model snapshot served from the CLI's local `/v1/pricing` endpoint and consumed by SDKs that rely on the model-registry workspace dep. No API changes. ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

## 0.2.3 (2026-04-14)

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

## 0.2.2 (2026-04-09)

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

## 0.2.1 (2026-04-08)

### 🩹 Fixes

- Republish with the compiled `dist/` output. The previously published `0.2.0` tarball shipped only `src/index.ts` and had `main: "src/index.ts"` in its manifest, so consumers running on Node ≥22.6 hit `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` because Node refuses to type-strip TypeScript files inside `node_modules`. The package source was corrected in a later sync but never republished. This release contains `dist/index.js` (CJS) plus `dist/index.d.ts` and a manifest pointing at the compiled entry, so consumers like `@agentmark-ai/cli` work on modern Node again.

## 0.2.0 (2026-02-13)

### 🚀 Features

- Move model-registry to OSS as @agentmark-ai/model-registry, update CLI to use import syntax ([#471](https://github.com/agentmark-ai/agentmark/pull/471))