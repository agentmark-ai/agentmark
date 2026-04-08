## 0.5.0 (2026-04-08)

### 🚀 Features

- Add unified score registry with typed schemas for human annotation. ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

  - `prompt-core`: New `ScoreSchema`, `ScoreDefinition`, `ScoreRegistry` types with Zod validation. `AgentMark` class accepts `scores` option. `evalRegistry` deprecated. `serializeScoreRegistry()` utility. `test_settings.evals` renamed to `scores` (backward compat).
  - `connect`: Handle `get-score-configs` job type to serve serialized schemas to dashboard.
  - Adapters (ai-sdk-v4, ai-sdk-v5, mastra): Accept `scores` option in `createAgentMarkClient`.
  - `ui-components`: Schema-driven annotation form with boolean/numeric/categorical controls. Falls back to free-form when no configs available.
  - `shared-utils`: `AgentmarkConfig.evals` made optional (superseded by score registry).

  (claude-agent-sdk-v0-adapter and create-agentmark were dropped from this plan when restoring it because their bumps already shipped via subsequent releases.)

- feat(traces): add metadata display to span tooltip, eval score chips in trace tree, and runtime type coercion for metadata values ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

### 🩹 Fixes

- Export RequestTable from requests section ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.0

## 0.4.0 (2026-03-03)

### 🚀 Features

- feat: add experiments UI with list, detail, and comparison views ([#502](https://github.com/agentmark-ai/agentmark/pull/502))

## 0.3.6 (2026-02-14)

### 🩹 Fixes

- Export RequestTable from requests section ([#486](https://github.com/agentmark-ai/agentmark/pull/486))

## 0.3.5 (2026-02-14)

### 🩹 Fixes

- Export RequestTable from requests section ([#482](https://github.com/agentmark-ai/agentmark/pull/482))

## 0.3.4 (2026-02-13)

### 🩹 Fixes

- Export RequestTable from requests section ([#477](https://github.com/agentmark-ai/agentmark/pull/477))

## 0.3.3 (2026-02-13)

### 🩹 Fixes

- Export RequestTable from requests section ([#475](https://github.com/agentmark-ai/agentmark/pull/475))

## 0.3.2 (2026-02-13)

### 🩹 Fixes

- Export RequestTable from requests section ([#473](https://github.com/agentmark-ai/agentmark/pull/473))

## 0.3.1 (2026-01-28)

### 🩹 Fixes

- fix: Datagrid filter panel flickers ([#456](https://github.com/agentmark-ai/agentmark/pull/456))

## 0.3.0 (2026-01-21)

### 🚀 Features

- Fix: security issues ([#449](https://github.com/agentmark-ai/agentmark/pull/449))

# Changelog

## 0.2.0

### Minor Changes

- 03c4c2c: Feat: Timeline view

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/ui-components`.
> See git history for prior changelog entries.
