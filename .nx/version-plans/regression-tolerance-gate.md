---
"@agentmark-ai/prompt-core": minor
"@agentmark-ai/cli": minor
---

Regression-vs-baseline gate predicate, opt-in via `test_settings.regression_tolerance`.

- `prompt-core`: new optional `regression_tolerance` field on `TestSettingsSchema`; `TestSettingsSchema` now publicly exported for downstream validation.
- `cli`: JUnit formatter applies a second gate predicate when an eval's `baselineScore` is present and the run's score drops more than `regression_tolerance` below it. Failing cases emit a regression-aware `<failure>` message and embed `baseline_score` / `regression_tolerance` / `baseline_commit_sha` in `<properties>`.
- The predicate is fully opt-in: with no `regression_tolerance` set, or no baseline scores supplied, behaviour is identical to today. The CLI flag that fetches baseline scores from AgentMark Cloud (`--baseline-commit`) and the backend endpoint that serves them ship in a follow-up.
