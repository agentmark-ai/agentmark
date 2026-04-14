---
"@agentmark-ai/prompt-core": patch
"@agentmark-ai/ai-sdk-v4-adapter": patch
"@agentmark-ai/ai-sdk-v5-adapter": patch
"@agentmark-ai/claude-agent-sdk-v0-adapter": patch
"@agentmark-ai/mastra-v0-adapter": patch
"@agentmark-ai/cli": patch
"@agentmark-ai/ui-components": patch
"@agentmark-ai/model-registry": patch
"create-agentmark": patch
"agentmark-prompt-core": patch
"agentmark-claude-agent-sdk-v0": patch
"agentmark-pydantic-ai-v0": patch
---

Unify scorer storage format across the eval runner and annotation UI, rename the client `scores` option back to `evals`, and refresh the model catalogue.

### @agentmark-ai/prompt-core

- `ScoreSchema.categorical.categories` is now `Array<{ label: string; value: number }>` instead of `string[]`. Each category carries its own numeric value used when posting scores. Consumers constructing categorical score configs must pass `{ label, value }` pairs.
- New exported function `toStoredScore(schema, evalResult): StoredScore` — canonical conversion from an `EvalResult` to the ClickHouse storage shape. Used by both the UI (human annotations) and the runner (automated evals) so human and machine scores are byte-identical in storage.
- New exported types: `CategoryValue`, `StoredScore`.
- `DatasetStreamChunk` dropped the short-lived `scores: string[]` field; `evals: string[]` is the canonical name.

### @agentmark-ai/ai-sdk-v4-adapter, ai-sdk-v5-adapter, claude-agent-sdk-v0-adapter, mastra-v0-adapter

- `createAgentMarkClient({ scores })` renamed back to `createAgentMarkClient({ evals })`. The `scores` option is removed; `evalRegistry` remains as a deprecated alias that still works.
- Frontmatter `test_settings` no longer accepts `scores: string[]` — use `evals: string[]`.
- Runner dataset iteration reads `item.evals` directly (previously `item.scores ?? item.evals`).

### @agentmark-ai/cli

- `postExperimentScores` now threads a `dataType` field (`boolean` / `numeric` / `categorical`) through to the `/v1/score` POST body so CLI-posted experiment scores round-trip with the same shape as UI-annotated scores.
- Dependabot bumps for 6 security advisories.
- Added `deploy.test.ts` and `score-posting-client.test.ts` coverage.

### @agentmark-ai/ui-components

- Annotation form now imports `toStoredScore` from `@agentmark-ai/prompt-core` and delegates eval-result → stored-score conversion — removes the duplicated switch/case that had silently drifted from the runner's format.
- `AnnotationEntry` gains a required `dataType: "boolean" | "numeric" | "categorical"` field.
- `AddAnnotationDialog.saveAnnotation` callback now receives `dataType` and forwards it.
- `CategoricalControl` accepts `categories` as `Array<{ label: string; value: number }>` to match the new prompt-core schema.

### @agentmark-ai/model-registry

- Regenerated `models.json` with the latest provider pricing and capability metadata from LiteLLM and OpenRouter.

### create-agentmark

- Python template (`create-python-app.ts`, `user-client-config.ts`) updated to use the new `evals=` kwarg instead of `eval_registry=`.

### agentmark-prompt-core, agentmark-claude-agent-sdk-v0, agentmark-pydantic-ai-v0

- New `evals` keyword argument on `AgentMark.__init__`, `create_agentmark()`, `create_claude_agent_client()`, and `create_pydantic_ai_client()`.
- `eval_registry` kwarg kept as a deprecated alias — when `evals` is provided, `eval_registry` is ignored.
