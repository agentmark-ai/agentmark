## 0.1.12 (2026-06-23)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.2.1

## 0.1.11 (2026-06-22)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.2.0

## 0.1.10 (2026-06-18)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.1.0

## 0.1.9 (2026-06-17)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.5

## 0.1.8 (2026-06-15)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.4

## 0.1.7 (2026-06-12)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.3

## 0.1.6 (2026-06-12)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.2

## 0.1.5 (2026-06-12)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.1

## 0.1.4 (2026-06-11)

### 🩹 Fixes

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

- Updated @agentmark-ai/prompt-core to 1.0.0

## 0.1.3 (2026-06-11)

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

## 0.1.2 (2026-06-10)

### 🩹 Fixes

- fix(loader-file): canonical path-containment guard + NUL-byte rejection ([#743](https://github.com/agentmark-ai/agentmark/pull/743))

  Restructures validateAndResolvePath to the canonical containment check
  from CodeQL's js/path-injection guidance — one path.resolve(base, path)
  gated by a positive startsWith(base + sep) — replacing the equivalent
  but analysis-opaque normalize→join→resolve chain (open alerts 75–78 on
  the OSS mirror). Also rejects NUL bytes outright. Behavior is otherwise
  unchanged; traversal coverage extended with deep-escape, sibling-prefix
  (`base-evil`), and NUL-byte regression tests.

## 0.1.1 (2026-05-12)

### 🩹 Fixes

- Build/lint fixes surfaced by the OSS Parity CI workflow (catches post-sync failures on PRs before they land): ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/ui-components`: Declare `@mui/system`, `@mui/x-data-grid`, and `@mui/x-date-pickers` as both peer- and dev-dependencies so TS `.d.ts` emission resolves these MUI internals at portable paths under the standalone install layout (yarn hoisting otherwise nests `@mui/system` under `@mui/material/node_modules/` and breaks TS2742 portability). Also add `@mui/utils@^7.3.11` as a direct devDep: `@mui/material@7.3.11` introduced internal subpath imports like `@mui/utils/useForcedRerendering` that only exist in `@mui/utils@7.3.11+`, but the root-hoisted `@mui/utils` would otherwise stay at 7.3.8 (constrained by `@mui/x-*`) and the nested `material/node_modules/@mui/utils@7.3.11` isn't visible to Vite/vitest's bare-specifier resolver — causing `Cannot find package '@mui/utils/useForcedRerendering'` failures in component tests that mount `Autocomplete`. Pinning utils at root keeps the subpath discoverable.
  - `@agentmark-ai/cli`: Apply the existing `apiRateLimiter` (renamed from `templatesRateLimiter`) to `/v1/prompts`, `/v1/config`, and `POST /v1/datasets/:datasetName/rows` to address `js/missing-rate-limiting` CodeQL alerts. Convert two `let` declarations that were never reassigned (`useForwarding`, `metadata`) to `const`. Add a targeted ESLint suppression for the same-package `openapi-spec.json` import, which `import/no-restricted-paths` misfires on.
  - `@agentmark-ai/loader-file`: Rename `vitest.config.ts` → `vitest.config.mts` so the test config loads as ESM in vitest 3.x without forcing the entire package to `type: module`.
  - `@agentmark-ai/mcp-server`: Normalize the span shape returned by `HttpDataSource.fetchSpans()` from the CLI server's flat snake_case (`trace_id`, `duration_ms`, `input_tokens`, …) to the canonical camelCase `SpanData` shape. Previously the snake_case fields fell through to consumers undefined, breaking the trace drawer and any tool reading `span.traceId`. Older mocks/tests using the nested-camelCase shape continue to work.

- **License change: MIT → AGPL-3.0-or-later.** ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  The runtime code is byte-identical to the previous patch release — only the
  `LICENSE.md` file and the `license` field in each `package.json` change. Bumping
  as a patch (not a major) because no compile/runtime behavior is affected.

  **Downstream impact (please read before upgrading):** AGPL-3.0 has copyleft
  and network-use obligations that MIT does not. Consumers using these packages
  in proprietary or SaaS products may need to evaluate compatibility before
  upgrading. Users who need the MIT terms can pin to the last MIT-licensed
  release of each package.

# Changelog

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/loader-file`.
> See git history for prior changelog entries.
