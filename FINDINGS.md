# Findings: datasetUrl removal, loader-first approach, and fallback

- Symptom: Cloud runner requests failed with `Cannot read properties of undefined (reading 'datasetUrl')` and earlier `experimental_telemetry` errors.
- Root causes:
  - CDN (local) sometimes included `datasetUrl` in AST payloads, but it wasn’t guaranteed. Code that assumed its presence threw.
  - Runner previously merged telemetry from `item.formatted.experimental_telemetry` without guarding for undefined.

What we did
- Removed `datasetUrl` coupling entirely from the local CDN: `/v1/templates` for `.prompt.mdx` now returns `{ data: ast }` only.
- Simplified the runner to prefer `formatWithDataset` from the configured loader for all kinds. The loader owns dataset discovery (frontmatter + conventional paths) and shaping.
- Added a guarded fallback in the runner (text prompts only) in case a loader throws due to missing `datasetUrl`: it fetches the dataset via `AGENTMARK_BASE_URL` as JSON and synthesizes `formatted` via `prompt.format({ props })`. Telemetry merging uses optional chaining.
- Forwarded dataset hints `{ datasetPath, promptPath }` from CLI to runner, and runner preloads prompt in loader when `promptPath` is provided to help loaders resolve relative paths.

Tests
- Added `packages/vercel-ai-v4-adapter/test/runner-dataseturl-fallback.test.ts` to simulate a loader that throws on `formatWithDataset`; verifies fallback succeeds.
- Existing CLI and adapter tests pass, including CDN JSON-compat and run-experiment flows.

Outcome
- `datasetUrl` is no longer needed by the runner or CDN consumers. Loaders handle dataset fetching; runner coordinates; telemetry is merged safely. All tests are green.
