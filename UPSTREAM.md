## Upstream proposal: keep runner thin; push dataset logic into clients/loaders

Goal: make `agentmark.runner` simple and durable by removing CDN/dataset fallbacks and keeping all dataset resolution/formatting/telemetry logic encapsulated inside client Loaders (local FileLoader, cloud SDK loader, etc.).

### Problems observed
- Runners and CLIs re‑implement dataset resolution (relative paths vs `templates/datasets`, JSON vs NDJSON, `datasetUrl` vs `test_settings.dataset`).
- Cloud/CDN implementations sometimes include `datasetUrl`, but it’s not guaranteed; clients that assume it break.
- `experimental_telemetry` shape assumptions in the runner caused runtime errors.

### Proposed design changes (upstream)
1) Loader contract enhancement (non‑breaking optional params)
   - Extend the Loader API methods to accept a single `context` param:
     - `load(templatePath: string, promptKind: PromptKind, context?: { promptDir?: string })`
     - `loadDataset(datasetPath: string, context?: { promptDir?: string; preferJson?: boolean })`
   - `formatWithDataset` should accept an options object with hints:
     - `formatWithDataset({ datasetPath?: string, telemetry?: { isEnabled?: boolean }, context?: { promptDir?: string; preferJson?: boolean } })`
   - Loaders are free to ignore `context`, but cloud loaders can use it to resolve relative paths and choose JSON vs NDJSON.

2) Cloud loader (SDK) responsibility
   - Implement all dataset resolution inside the SDK’s Loader:
     - Resolve dataset from frontmatter `test_settings.dataset` relative to `promptDir`.
     - If `datasetUrl` is present, use it; otherwise construct `GET /v1/templates?path=<promptDir>/<dataset>&format=json`.
     - Accept JSON arrays by default; gracefully handle NDJSON (detect Content‑Type and line‑parse).
     - Always yield a `ReadableStream` of rows `{ input, expected_output }` (uniform shape) and synthesize `formatted` by calling the prompt’s `format({ props })` internally (so the runner never does this).
     - Merge telemetry defensively inside the loader when producing `formatted` (avoid assumptions about undefined `experimental_telemetry`).
   - Provide `preferJson` default true to match real client expectations; NDJSON remains available when explicitly requested.

3) Local FileLoader responsibility
   - Keep reading JSONL from disk, but implement conventional fallback for `templates/datasets/<basename>` when relative path is missing.
   - Align emitted row shape with the SDK loader, so callers don’t branch on loader type.

4) Runner simplification (downstream consumers)
   - Runner only:
     - Parses frontmatter to detect kind.
     - Calls `load<Text|Object|Image|Speech>Prompt(ast)`.
     - Calls `formatWithDataset({ datasetPath, telemetry, context: { promptDir } })` on the prompt.
     - Iterates the dataset stream and calls the model adapter.
   - No CDN requests, no `datasetUrl` assumptions, no telemetry merging in runner.

5) CDN compatibility guarantees
   - Keep `/v1/templates?path=…` behavior consistent:
     - `.mdx` returns `{ data: ast }` without requiring `datasetUrl`.
     - `.jsonl`:
       - Default to JSON array (`application/json`), with `?format=ndjson` for streaming.
       - This matches what the SDK Loader expects by default (`preferJson: true`).

### API sketch (TypeScript)
```ts
interface LoaderContext {
  promptDir?: string;        // directory of the prompt file
  preferJson?: boolean;      // hint for HTTP loaders
}

interface Loader<T extends PromptShape<T> = any> {
  load(path: string, kind: PromptKind, ctx?: LoaderContext): Promise<Ast>;
  loadDataset(datasetPath: string, ctx?: LoaderContext): Promise<ReadableStream<{ input: any; expected_output?: any }>>;
}

class Prompt {
  formatWithDataset(opts?: { datasetPath?: string; telemetry?: { isEnabled?: boolean }; context?: LoaderContext }): Promise<ReadableStream<{ dataset: { input: any; expected_output?: any }, formatted: AdapterInput, evals: string[] }>>
}
```

### Migration plan
- Phase 1 (additive):
  - Implement LoaderContext support in SDK loader and FileLoader.
  - Update SDK loader to fully handle dataset fallback (no reliance on `datasetUrl`).
  - Keep runner fallback temporarily, but behind a feature flag `AGENTMARK_RUNNER_STRICT=1` to disable it.
- Phase 2:
  - Remove runner fallback and require loaders to own dataset fetching/formatting.
  - Keep CLI passing `{ datasetPath, promptPath }` to runner; runner forwards `{ context: { promptDir } }` to loaders.

### Test plan (upstream)
- SDK loader
  - Given a prompt AST without `datasetUrl`, with `test_settings.dataset: ./ds.jsonl`, fetches `/v1/templates?path=<promptDir>/ds.jsonl&format=json` and yields rows; synthesizes `formatted` correctly; no exceptions.
  - Handles NDJSON when server returns `application/x-ndjson`.
  - Telemetry present or absent does not crash; merged via optional chaining.
- FileLoader
  - Resolves `templates/datasets/<basename>` fallback when relative path not found.
  - Emits rows and synthesizes `formatted` consistently.
- Runner
  - Only verifies iteration and adapter model calls; no datasetUrl or CDN assumptions.

### Rationale
- Centralizes dataset responsibilities in one place (loaders), lowering surface area for regressions.
- Aligns with single‑responsibility: runners coordinate, loaders load, adapters generate.
- Keeps ecosystem flexible for future sources (remote, versioned storage, etc.) without runner changes.
