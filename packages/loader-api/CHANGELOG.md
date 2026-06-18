## 0.1.9 (2026-06-18)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.1.0

## 0.1.8 (2026-06-17)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.5

## 0.1.7 (2026-06-15)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.4

## 0.1.6 (2026-06-12)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.3

## 0.1.5 (2026-06-12)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.2

## 0.1.4 (2026-06-12)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 1.0.1

## 0.1.3 (2026-06-11)

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

## 0.1.2 (2026-06-07)

### 🩹 Fixes

- Fix the published type surface that the client-setup docs validation exposed: ([#685](https://github.com/agentmark-ai/agentmark/pull/685))

  **ai-sdk-shared (minor — first publish):**
  - Drop `private: true`. The v4/v5 adapters' published `.d.ts` files import the
    registry/adapter-core types from this package, so consumers' `tsc` could
    never resolve them — `registerProviders`/`registerModels` appeared missing
    under strict mode. Publishing the package (and depending on it normally)
    makes the published declarations resolvable.

  **ai-sdk-v4-adapter / ai-sdk-v5-adapter (patch):**
  - `@agentmark-ai/ai-sdk-shared` moves from a bundled devDependency to a
    regular dependency (`>=0.0.0`, the same range convention the sdk uses for
    its internal peers — it resolves to the workspace in both the monorepo and
    the standalone tree despite their version drift). Runtime behavior is
    unchanged — the same code now loads via a resolvable module instead of
    being inlined, and the emitted type declarations stop dangling.

  **loader-api (patch):**
  - `FetchTemplateOptions.cache` is now optional, so `ApiLoader#load` stays
    assignable to the adapters' `LoaderLike` contract (callers pass
    `AdaptOptions`, which has no `cache` key). Omitting `cache` skips caching —
    the same runtime behavior those callers always got.

  **agentmark-pydantic-ai-v0 (patch):**
  - Streamed text no longer drops the opening token(s): pydantic-ai delivers
    the first chunk of a text part inside `PartStartEvent` (single-chunk
    responses arrive ONLY there), and `_stream_text` previously forwarded
    `TextPartDelta` events alone. The part-start content now yields a delta
    too.

## 0.1.1 (2026-05-12)

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

# Changelog

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/loader-api`.
> See git history for prior changelog entries.
