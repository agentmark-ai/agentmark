## 0.3.0 (2026-06-05)

### 🚀 Features

- Cloud-first rewrite: the MCP server now generates one tool per AgentMark API operation and authenticates against the cloud gateway by default. ([#658](https://github.com/agentmark-ai/agentmark/pull/658))

  - **OpenAPI-driven tools.** Instead of a fixed handful of hand-written trace tools, the server fetches `<AGENTMARK_API_URL>/v1/openapi.json` at startup and registers one MCP tool per `/v1/*` operation (~73 tools: traces, spans, sessions, scores, experiments, datasets, environments, deployments, alerts, apps, …).
  - **Cloud by default.** `AGENTMARK_API_URL` now defaults to `https://api.agentmark.co`; auth resolves from `AGENTMARK_API_KEY` (or an `agentmark login` session).
  - **App-scoped reads now work.** For app-scoped routes whose path has no `{appId}` param (`GET /v1/traces`, `/v1/spans`, `POST /v1/scores`, …), the server sends `X-Agentmark-App-Id` resolved from **`AGENTMARK_APP_ID`**. Without it those routes 401 `Missing app id`, making the entire trace/span/score read surface unusable for a headless agent — this is the fix that lets the client read cloud traces at all.

  **Migration (config change; minor under 0.x):** the endpoint env var was renamed `AGENTMARK_URL` → `AGENTMARK_API_URL` and its default flipped from `http://localhost:9418` to cloud. Local-dev users now set `AGENTMARK_API_URL=http://localhost:9418`; cloud users set `AGENTMARK_API_KEY` + `AGENTMARK_APP_ID`.

## 0.2.2 (2026-05-12)

### 🩹 Fixes

- Build/lint fixes surfaced by the OSS Parity CI workflow (catches post-sync failures on PRs before they land): ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  - `@agentmark-ai/ui-components`: Declare `@mui/system`, `@mui/x-data-grid`, and `@mui/x-date-pickers` as both peer- and dev-dependencies so TS `.d.ts` emission resolves these MUI internals at portable paths under the standalone install layout (yarn hoisting otherwise nests `@mui/system` under `@mui/material/node_modules/` and breaks TS2742 portability). Also add `@mui/utils@^7.3.11` as a direct devDep: `@mui/material@7.3.11` introduced internal subpath imports like `@mui/utils/useForcedRerendering` that only exist in `@mui/utils@7.3.11+`, but the root-hoisted `@mui/utils` would otherwise stay at 7.3.8 (constrained by `@mui/x-*`) and the nested `material/node_modules/@mui/utils@7.3.11` isn't visible to Vite/vitest's bare-specifier resolver — causing `Cannot find package '@mui/utils/useForcedRerendering'` failures in component tests that mount `Autocomplete`. Pinning utils at root keeps the subpath discoverable.
  - `@agentmark-ai/cli`: Apply the existing `apiRateLimiter` (renamed from `templatesRateLimiter`) to `/v1/prompts`, `/v1/config`, and `POST /v1/datasets/:datasetName/rows` to address `js/missing-rate-limiting` CodeQL alerts. Convert two `let` declarations that were never reassigned (`useForwarding`, `metadata`) to `const`. Add a targeted ESLint suppression for the same-package `openapi-spec.json` import, which `import/no-restricted-paths` misfires on.
  - `@agentmark-ai/loader-file`: Rename `vitest.config.ts` → `vitest.config.mts` so the test config loads as ESM in vitest 3.x without forcing the entire package to `type: module`.
  - `@agentmark-ai/mcp-server`: Normalize the span shape returned by `HttpDataSource.fetchSpans()` from the CLI server's flat snake_case (`trace_id`, `duration_ms`, `input_tokens`, …) to the canonical camelCase `SpanData` shape. Previously the snake_case fields fell through to consumers undefined, breaking the trace drawer and any tool reading `span.traceId`. Older mocks/tests using the nested-camelCase shape continue to work.

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

## 0.2.1 (2026-02-13)

### 🩹 Fixes

- Fix the invalid package.json refs ([#471](https://github.com/agentmark-ai/agentmark/pull/471))

## 0.2.0 (2026-01-21)

### 🚀 Features

- Fix: security issues ([#449](https://github.com/agentmark-ai/agentmark/pull/449))

# @agentmark-ai/mcp-server

## 0.1.0

### Minor Changes

- a4a1d95: agentmark mcp server with tools for searching traces and spans
