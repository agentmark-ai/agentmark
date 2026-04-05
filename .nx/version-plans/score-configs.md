---
"@agentmark-ai/prompt-core": minor
"@agentmark-ai/connect": minor
"@agentmark-ai/ai-sdk-v4-adapter": minor
"@agentmark-ai/ai-sdk-v5-adapter": minor
"@agentmark-ai/mastra-v0-adapter": minor
"@agentmark-ai/claude-agent-sdk-adapter": minor
"@agentmark-ai/ui-components": minor
"@agentmark-ai/create-agentmark": minor
"@agentmark-ai/shared-utils": patch
---

Add unified score registry with typed schemas for human annotation.

- `prompt-core`: New `ScoreSchema`, `ScoreDefinition`, `ScoreRegistry` types with Zod validation. `AgentMark` class accepts `scores` option. `evalRegistry` deprecated. `serializeScoreRegistry()` utility. `test_settings.evals` renamed to `scores` (backward compat).
- `connect`: Handle `get-score-configs` job type to serve serialized schemas to dashboard.
- Adapters (ai-sdk-v4, ai-sdk-v5, mastra, claude-agent-sdk): Accept `scores` option in `createAgentMarkClient`.
- `ui-components`: Schema-driven annotation form with boolean/numeric/categorical controls. Falls back to free-form when no configs available.
- `create-agentmark`: Generate client code with `scores` registry instead of `evalRegistry`.
- `shared-utils`: `AgentmarkConfig.evals` made optional (superseded by score registry).
