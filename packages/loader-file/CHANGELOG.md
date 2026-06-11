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
