## 1.1.6 (2026-06-09)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.10.0

## 1.1.5 (2026-06-09)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.9.0

## 1.1.4 (2026-06-07)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.8.2

## 1.1.3 (2026-06-06)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.8.1

## 1.1.2 (2026-06-06)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.8.0

## 1.1.1 (2026-06-05)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.7.0

## 1.1.0 (2026-06-05)

### 🚀 Features

- Consolidate the per-adapter runners behind a shared `Executor` protocol + a ([#665](https://github.com/agentmark-ai/agentmark/pull/665))
  single `WebhookRunner` (TS + Python), and tighten the resulting interface.

  **Minor, not major:** these packages are pre-1.0 (0.x) and explicitly unstable,
  so breaking changes ride the minor slot for now.

  Breaking / behavior changes in this release:

  - **Executor protocol** is the new SDK-integration contract. Each adapter is now
    a thin `Executor` + paramMap over the shared `WebhookRunner` instead of a
    per-SDK runner. `AgentEvent` is kind-split (`TextStreamEvent` /
    `ObjectStreamEvent`); usage rides on a single terminal `finish` event (the
    standalone `usage` event variant is gone).
  - **`WebhookRunner.runExperiment` signature** changed from trailing positional
    args (`datasetPath`, `sampling`, `concurrency`, `experimentKey`,
    `sourceTreeHash`) to a `RunExperimentOptions` bag, with `signal` added for
    cancellation. The per-adapter `*WebhookHandler.runExperiment` shims and the
    CLI runner-server dispatch follow suit.
  - **`Adapter.adaptText/adaptObject/adaptImage/adaptSpeech`** return `unknown`
    instead of `any`. Concrete adapters override with their real return type, so
    the typed BYO/Default path is unaffected; generic-`Adapter` holders must
    narrow.
  - **Experiment NDJSON wire unified**: the claude-agent (TS + Python) adapters
    drop the `experiment_start` / `experiment_item_error` / `experiment_end`
    envelope in favor of the shared `{type:"dataset"}` / `{type:"error"}` shape
    every other adapter already emits. Verified: no consumer (gateway, builder
    auto-score, dashboard) parses the old envelope.
  - **`datasetItemName`** for the AI-SDK adapters is now `md5(input)[:12]` (parity
    with the Python adapters) instead of the raw row index.

  Additive:

  - BYO bootstrapping primitives: `createExecutor` / `create_executor`,
    `createWebhookRunner`, `runExecutorConformance`.
  - `WireChunk` — the now-typed NDJSON stream contract, exported from prompt-core.
  - New packages `@agentmark-ai/ai-sdk-shared` (shared Vercel executor factory)
    and `@agentmark-ai/conformance-vectors` (cross-language test fixtures).

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.6.0

## 1.0.6 (2026-05-21)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.5.0

## 1.0.5 (2026-05-12)

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

### 🧱 Updated Dependencies

- Updated @agentmark-ai/loader-file to 0.1.1
- Updated @agentmark-ai/prompt-core to 0.4.2

## 1.0.4 (2026-04-14)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.1

## 1.0.3 (2026-04-08)

### 🩹 Fixes

- fix(types): wrap `format()` return type in `Awaited<...>` so consumers receive the resolved value type instead of a nested Promise. Single-line type-only fix to `DefaultObjectPrompt.format` in `src/index.ts` — no runtime behavior change. ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.0

## 1.0.2 (2026-01-21)

This was a version bump only for @agentmark-ai/fallback-adapter to align it with other projects, there were no code changes.

# Changelog

## 1.0.1

### Patch Changes

- 53c4b70: Fix: workspace refs
- Updated dependencies [53c4b70]
  - @agentmark-ai/prompt-core@0.1.1

## 1.0.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

### Patch Changes

- Updated dependencies [39bae0f]
  - @agentmark-ai/prompt-core@0.1.0

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/fallback-adapter`.
> See git history for prior changelog entries.
