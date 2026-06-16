## 1.2.0 (2026-06-16)

### 🚀 Features

- Add `agentmark init` as a first-class CLI command: install `@agentmark-ai/cli` globally and run `agentmark init` to scaffold a project (`agentmark.json`, prompts dir, IDE MCP configs, agent skill). `init` additionally pins `@agentmark-ai/cli` as a local dev dependency and adds npm scripts to the project's `package.json` (non-destructively — never clobbering an existing `dev`/`build` script), so CI and teammates resolve the same CLI version from `node_modules/.bin` without a global install. `agentmark doctor` now reports whether that local pin is present (advisory `deps.cli` check). `create-agentmark` (`npm create agentmark`) becomes a thin, dependency-free wrapper that delegates to `agentmark init` via `npx` (reusing an installed CLI or fetching on demand), so both entry points produce identical output without pulling the CLI's full tree into the scaffolder. ([#787](https://github.com/agentmark-ai/agentmark/pull/787))

## 1.1.6 (2026-06-16)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.8.0

## 1.1.5 (2026-06-14)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.7.0

## 1.1.4 (2026-06-12)

### 🩹 Fixes

- Default editor selection to detected editors instead of all four ([#769](https://github.com/agentmark-ai/agentmark/pull/769))

## 1.1.3 (2026-06-11)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.6.1

## 1.1.2 (2026-06-10)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.6.0

## 1.1.1 (2026-06-09)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.5.1

## 1.1.0 (2026-06-08)

### 🚀 Features

- feat(create-agentmark): --yes non-interactive mode and --help usage ([#689](https://github.com/agentmark-ai/agentmark/pull/689))

  Headless onboarding stops at step zero without this: the init blocked on
  TTY prompts no CI job or coding agent can answer, and with no --help the
  existing escape hatches (--path, --client, --overwrite) were
  undiscoverable. `--yes` (`-y`) accepts the interactive default for every
  prompt — target folder (`.` inside an existing project, else
  my-agentmark-app), all four IDE clients, keep an existing agentmark.json
  (--overwrite stays the explicit opt-in). `--help` (`-h`) prints the flag
  surface. `npx create-agentmark --yes` with stdin closed now completes the
  full init unattended.

## 1.0.1 (2026-06-07)

### 🩹 Fixes

- fix(create-agentmark): the CLI ran as a silent no-op via npm/npx — realpath both sides of the entry check ([#687](https://github.com/agentmark-ai/agentmark/pull/687))

  v1.0.0's `isDirectlyInvoked()` guard compared `import.meta.url` against
  `pathToFileURL(process.argv[1])` without realpath-ing either side. npm and
  npx invoke bins through a `node_modules/.bin` symlink, so the two URLs never
  matched: `npm create agentmark` exited 0 having printed nothing and written
  nothing. (macOS additionally symlinks /tmp, so even direct invocations
  failed in temp directories.) Both sides are now realpath'd, and a regression
  test invokes the built bin through a `node_modules/.bin`-style symlink — the
  exact path every real user takes.

# 1.0.0 (2026-06-05)

### ⚠️  Breaking Changes

- **Breaking:** `npm create agentmark` is now a minimal init. The CLI no longer scaffolds an example app or picks an LLM adapter — it writes `agentmark.json`, creates an empty `agentmark/` directory, wires MCP configs into the IDE clients you select, installs the AgentMark agent skill, and hands off to your AI tool. ([#643](https://github.com/agentmark-ai/agentmark/pull/643))

  Rationale: the old scaffolder forced a four-template menu (`party-planner`, `customer-support`, `story-teller`, `animal-drawing`) and a language/adapter choice up front, which produced opinionated code that rarely matched the project the user was actually building. The new flow defers the "wire AgentMark into my codebase" decision to the `setup-and-integration` skill workflow, which runs inside the user's AI tool, queries the docs MCP for current framework-specific guidance, and adapts to whatever stack already exists.

  What the new CLI does:

  1. Writes `agentmark.json` with `agentmarkPath: "."` (skips if present unless `--overwrite`)
  2. Creates `agentmark/` with a `.gitkeep` (skips if present)
  3. Wires MCP into selected IDE clients via existing `writeMcpConfig()` — multi-select, all 4 pre-selected
  4. Installs the AgentMark agent skill (`npx skills add agentmark-ai/skills`, best-effort)
  5. Runs `git init` if the target is a greenfield folder
  6. Prints handoff: "Open Claude Code, Cursor, VS Code, or Zed and say: Set up AgentMark in this project."

  What's gone (breaking):

  - Language selection (TypeScript/Python prompt) — adapter handled by skill workflow per docs
  - Adapter selection (`--adapter ai-sdk | claude-agent-sdk | mastra | pydantic-ai`)
  - API key prompt — skill workflow's "Before you start" check enforces auth via `agentmark login` or `AGENTMARK_API_KEY`
  - Deployment-mode prompt (`--cloud` / `--self-host`)
  - Single-select IDE prompt — now multi-select with all 4 pre-selected
  - `createExampleApp` / `createPythonApp` generators + all template files
  - `./templates` package export (no external consumers in the repo)
  - `--language`, `--adapter`, `--api-key`, `--deployment-mode` CLI flags

  What's preserved:

  - `npm create agentmark <folder>` (positional arg)
  - `--path`, `--client`, `--overwrite` flags
  - Undocumented `--api-url` escape hatch for internal staging / self-hosters
  - `installAgentmarkSkill()` flow (unchanged)
  - `writeMcpConfig()` flow (unchanged; same three-server layout: `agentmark-docs`, `agentmark`, `agentmark-local`)

  Migration for users who relied on the example scaffolder: the four example prompts now live in the docs as copy-paste recipes (see follow-up PR). For first-time onboarding, the new flow is: `npm create agentmark` → open AI tool → "Set up AgentMark in this project."

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.5.0

## 0.10.8 (2026-05-21)

### 🩹 Fixes

- **Python `FileLoader` now matches the TypeScript `FileLoader` API.** ([#606](https://github.com/agentmark-ai/agentmark/pull/606))

  - `agentmark-prompt-core`: `FileLoader` constructor now takes a single `build_dir` positional argument — pointing directly at the build output directory (`agentmark build`'s output), matching `new FileLoader('./dist/agentmark')` in TS. The argument defaults to `"./dist/agentmark"`, so `FileLoader()` from a project root with the conventional build layout Just Works (a Python ergonomic sugar — TS makes the same argument required). The previous `base_dir=` kwarg has been removed; both `load` and `load_dataset` resolve under the same `build_dir`, fixing the internal asymmetry where prompt resolution auto-appended `dist/agentmark` but dataset resolution did not — so `FileLoader("dist/agentmark")` could never be passed without breaking one of the two methods. `load_dataset` now also enforces the `.jsonl` extension, eager-checks file existence, and applies the same traversal validator as `load`. The dataset reader validates each row's shape (`{ input: object, ... }`) with line-number diagnostics on parse / shape failures and rejects empty datasets — closing TS divergences that previously let malformed datasets flow silently into experiment runners. Test suite rewritten to mirror `packages/loader-file/test/file-loader.test.ts` 1:1, with three Python-only suites: the default-arg equivalence guard, the extra path-normalization branches (`.prompt.json` / `.prompt`), and the `{ast, metadata}` unwrap regression. **Breaking**: callers passing `FileLoader(base_dir=...)` will now get `TypeError`; migrate to `FileLoader()` (from a project root) or `FileLoader(str(<project_root> / "dist" / "agentmark"))` for cwd-independent code.
  - `create-agentmark`: Python scaffold updated to emit `FileLoader(str(build_dir))` pointing at `<project_root>/dist/agentmark`, matching the TS scaffold's `new FileLoader("./dist/agentmark")`.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.4.0

## 0.10.7 (2026-05-14)

### 🩹 Fixes

- **Python `FileLoader` now matches the TypeScript `FileLoader` API.** ([#596](https://github.com/agentmark-ai/agentmark/pull/596))

  - `agentmark-prompt-core`: `FileLoader` constructor now takes a single `build_dir` positional argument — pointing directly at the build output directory (`agentmark build`'s output), matching `new FileLoader('./dist/agentmark')` in TS. The argument defaults to `"./dist/agentmark"`, so `FileLoader()` from a project root with the conventional build layout Just Works (a Python ergonomic sugar — TS makes the same argument required). The previous `base_dir=` kwarg has been removed; both `load` and `load_dataset` resolve under the same `build_dir`, fixing the internal asymmetry where prompt resolution auto-appended `dist/agentmark` but dataset resolution did not — so `FileLoader("dist/agentmark")` could never be passed without breaking one of the two methods. `load_dataset` now also enforces the `.jsonl` extension, eager-checks file existence, and applies the same traversal validator as `load`. The dataset reader validates each row's shape (`{ input: object, ... }`) with line-number diagnostics on parse / shape failures and rejects empty datasets — closing TS divergences that previously let malformed datasets flow silently into experiment runners. Test suite rewritten to mirror `packages/loader-file/test/file-loader.test.ts` 1:1, with three Python-only suites: the default-arg equivalence guard, the extra path-normalization branches (`.prompt.json` / `.prompt`), and the `{ast, metadata}` unwrap regression. **Breaking**: callers passing `FileLoader(base_dir=...)` will now get `TypeError`; migrate to `FileLoader()` (from a project root) or `FileLoader(str(<project_root> / "dist" / "agentmark"))` for cwd-independent code.
  - `create-agentmark`: Python scaffold updated to emit `FileLoader(str(build_dir))` pointing at `<project_root>/dist/agentmark`, matching the TS scaffold's `new FileLoader("./dist/agentmark")`.

## 0.10.6 (2026-05-12)

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

- Updated @agentmark-ai/shared-utils to 0.3.3

## 0.10.5 (2026-04-14)

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

## 0.10.4 (2026-04-13)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.3.2

## 0.10.3 (2026-04-08)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.3.1

## 0.10.2 (2026-04-08)

### 🩹 Fixes

- Rename Claude Agent SDK adapter to include upstream version in the name (`v0`), matching the existing convention used by `mastra-v0-adapter`, `ai-sdk-v4-adapter`, and `ai-sdk-v5-adapter`. The adapter now publishes as `@agentmark-ai/claude-agent-sdk-v0-adapter` (TypeScript) and `agentmark-claude-agent-sdk-v0` (Python). `create-agentmark` example templates updated to reference the new names. `agentmark-pydantic-ai-v0` bumped to 0.1.0 for its first PyPI release. ([#547](https://github.com/agentmark-ai/agentmark/pull/547))

## 0.10.1 (2026-03-24)

### 🩹 Fixes

- Update example templates: simplify tool definitions to string array format, fix ast type from unknown to any. ([#526](https://github.com/agentmark-ai/agentmark/pull/526))

## 0.10.0 (2026-03-18)

### 🚀 Features

- Breaking change: removed tool registries from all adapters. Adapters now accept native SDK tools directly. MDX tools field changed from record to string array. MCP bridge utilities removed from Claude adapter. ([#522](https://github.com/agentmark-ai/agentmark/pull/522))

## 0.9.0 (2026-02-19)

### 🚀 Features

- Add seamless pull-models flow with provider/model format ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - prompt-core: validate model names against builtInModels allow-list at load time
  - ai-sdk-v4-adapter, ai-sdk-v5-adapter: add registerProviders() and getModelFunction() for seamless provider/model string resolution; add speech model support
  - claude-agent-sdk-adapter, mastra-v0-adapter: update model registry to use provider/model format
  - create-agentmark: scaffold new projects with builtInModels in provider/model format and registerProviders wiring

### 🩹 Fixes

- Fix builtInModels derived from templates instead of hardcoded adapter switch ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - createExamplePrompts() now returns the model IDs it actually writes, making it the single source of truth for builtInModels
  - Removes the hardcoded adapter→model switch that was missing openai/dall-e-3 and openai/tts-1-hd for ai-sdk users
  - ai-sdk users now get all three models (gpt-4o, dall-e-3, tts-1-hd) in builtInModels on init
- Fix agentmark.json missing from initial git commit and duplicate dev-config.json locations ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - create-agentmark: move initGitRepo() to main() so it runs after agentmark.json is written, ensuring all files land in the initial commit
  - cli: add findProjectRoot() that walks up to find agentmark.json, anchoring .agentmark/dev-config.json there as a single source of truth regardless of which directory agentmark dev is run from

## 0.8.4 (2026-02-19)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#495](https://github.com/agentmark-ai/agentmark/pull/495))

## 0.8.3 (2026-02-14)

### 🩹 Fixes

- Show webhook secret in --remote banner, simplify generated npm scripts to single `agentmark` command, and fix duplicate trace exporter in SDK. ([#479](https://github.com/agentmark-ai/agentmark/pull/479))

## 0.8.2 (2026-02-13)

### 🩹 Fixes

- Init tracing for demo ([#471](https://github.com/agentmark-ai/agentmark/pull/471))

## 0.8.1 (2026-02-09)

### 🩹 Fixes

- Init tracing for demo ([#469](https://github.com/agentmark-ai/agentmark/pull/469))

## 0.8.0 (2026-02-04)

### 🚀 Features

- Use cloudflared instead of local tunnel ([#459](https://github.com/agentmark-ai/agentmark/pull/459))

# Changelog

## 0.7.0

### Minor Changes

- 97abbdd: Add claude agent sdk adapter
- a4a1d95: Support mcp server

### Patch Changes

- Updated dependencies [97abbdd]
  - @agentmark-ai/shared-utils@0.2.0

## 0.6.0

### Minor Changes

- ca59b7c: Change package orgs

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

### Patch Changes

- Updated dependencies [39bae0f]
  - @agentmark-ai/shared-utils@0.1.0

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `create-agentmark`.
> See git history for prior changelog entries.
