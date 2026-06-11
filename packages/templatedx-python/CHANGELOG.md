## 0.3.0 (2026-06-11)

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

## 0.2.1 (2026-06-11)

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

## 0.2.0 (2026-06-07)

### 🚀 Features

- feat(templatedx-python): positioned semantic errors via `TemplateDXError` — parity with the TypeScript package ([#681](https://github.com/agentmark-ai/agentmark/pull/681))

  Semantic errors raised by the transformer (expression evaluation failures,
  unsupported/spread attributes) now raise `TemplateDXError`, which carries the
  mdast position of the offending node (`line`/`column`/`offset` +
  `end_line`/`end_column`/`end_offset`, same 1-based line/column and 0-based
  offset convention as `@agentmark-ai/templatedx`). Editors and linters can map
  any templatedx error to an exact source range with one code path in both
  languages. Error messages are unchanged; `TemplateDXError` subclasses
  `ValueError` (what the transformer previously raised), so existing `except`
  sites are unaffected. When an inner node has already located an error, outer
  JSX wrappers re-raise it as-is instead of clobbering the precise position with
  the enclosing element's range.

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