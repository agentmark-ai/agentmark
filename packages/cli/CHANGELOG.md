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
