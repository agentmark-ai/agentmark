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