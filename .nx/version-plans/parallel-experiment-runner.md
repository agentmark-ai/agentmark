---
"@agentmark-ai/prompt-core": minor
"@agentmark-ai/cli": minor
"@agentmark-ai/ai-sdk-v4-adapter": minor
"@agentmark-ai/ai-sdk-v5-adapter": minor
"@agentmark-ai/mastra-v0-adapter": minor
"@agentmark-ai/claude-agent-sdk-v0-adapter": minor
"agentmark-prompt-core": minor
"agentmark-pydantic-ai-v0": minor
"agentmark-claude-agent-sdk-v0": minor
---

Parallel experiment runner — dataset rows now execute concurrently through a bounded worker pool instead of one after another.

- `prompt-core` / `prompt-core-python`: new bounded-concurrency helper — `runDatasetPool` / `run_dataset_pool` — and a `DEFAULT_EXPERIMENT_CONCURRENCY` (20) constant. A run processes 20 dataset rows at a time by default.
- adapters (`ai-sdk-v4`, `ai-sdk-v5`, `mastra-v0`, `claude-agent-sdk-v0`, and the Python `pydantic-ai-v0` / `claude-agent-sdk-v0`): `runExperiment` / `run_experiment` dispatch dataset rows through the pool, so a run is bounded by the slowest row rather than the sum of all rows.
- `cli`: `agentmark run-experiment` accepts a `--concurrency <n>` flag to override the default per run (any positive integer — the CLI runs on the user's own machine). The flag travels to the runner via the `dataset-run` webhook request.

Behavior changes worth noting for consumers:
- A single row failure no longer aborts the whole run — the failed row emits an error chunk and the run continues with the remaining rows.
- Result chunks stream in completion order, not dataset order. Each row still carries its own `traceId` / dataset item identity, so order-independent consumers are unaffected.

See: https://github.com/agentmark-ai/app/issues/2326
