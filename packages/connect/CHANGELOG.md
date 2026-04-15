## 0.2.1 (2026-04-14)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.1

## 0.2.0 (2026-04-08)

### 🚀 Features

- Add unified score registry with typed schemas for human annotation. ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

  - `prompt-core`: New `ScoreSchema`, `ScoreDefinition`, `ScoreRegistry` types with Zod validation. `AgentMark` class accepts `scores` option. `evalRegistry` deprecated. `serializeScoreRegistry()` utility. `test_settings.evals` renamed to `scores` (backward compat).
  - `connect`: Handle `get-score-configs` job type to serve serialized schemas to dashboard.
  - Adapters (ai-sdk-v4, ai-sdk-v5, mastra): Accept `scores` option in `createAgentMarkClient`.
  - `ui-components`: Schema-driven annotation form with boolean/numeric/categorical controls. Falls back to free-form when no configs available.
  - `shared-utils`: `AgentmarkConfig.evals` made optional (superseded by score registry).

  (claude-agent-sdk-v0-adapter and create-agentmark were dropped from this plan when restoring it because their bumps already shipped via subsequent releases.)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.0