---
"@agentmark-ai/sdk": minor
---

Experiment runner, baseline fetch, JUnit output, and streaming-span tracing.

- **`AgentMarkSDK.runExperiment()`** — runs any callable (agent / workflow / multi-step pipeline) over a dataset inside instrumented spans, applies per-scorer evaluators, posts scores to the gateway, and returns a structured `RunExperimentResult` with per-row regression detail and score-threshold gate results. Supports configurable concurrency, optional JUnit XML, and an optional baseline regression gate.
- **`AgentMarkSDK.getBaselineScores()`** — fetches a prior run's per-`(row × scorer)` baseline scores from the gateway, keyed by `experimentKey` + `sourceTreeHash` (the shared baseline protocol used by the CLI).
- **`experimentResultToJUnit()`** — renders a `RunExperimentResult` as CLI-compatible JUnit XML for CI pipelines.
- **`streamWithSpan()`** — wraps a streaming producer in a span so failures during stream *consumption* (after the producer callback returns) correctly mark the span ERROR instead of leaving it green.
- **`trace`** — alias for `span`, for parity with the Python SDK.
- New `SpanOptions` fields `experimentKey`, `sourceTreeHash`, `datasetInput`; the masking processor now redacts `agentmark.dataset_input`. New exported types: `RunExperimentOptions` / `RunExperimentResult`, `ExperimentEvaluator`, `BaselineResolved`, `ScoreThresholdResult`, `StreamWithSpanOptions` / `StreamWithSpanResult`.

All additive — no existing API changed.
