---
"@agentmark-ai/prompt-core": minor
---

Experiment regression gate, JUnit reporter, baseline protocol, and stable row hashing — all additive.

- **Regression gate** (`gate.ts`): `evaluateExperimentGate()` / `isRegression()` compare per-`(row × scorer)` scores against a stored baseline with a configurable fractional-drop tolerance, and enforce run-level mean thresholds declared via `score_thresholds`.
- **JUnit reporter** (`junit.ts`): `buildJUnitReport()` / `buildJUnitXml()` produce GitHub-Actions-compatible JUnit XML, surfacing absolute scorer failures and regression-gate failures as `<testcase>` / `<failure>` elements, plus run-level threshold testcases.
- **Baseline wire protocol** (`baseline.ts`): `baselineRequestQuery()`, `parseBaselineResponse()`, `baselineKey()` single-source the `GET /v1/experiments/baseline` request/response shape so the CLI and SDK can't drift on how baseline scores are fetched and joined.
- **Stable row hashing** (`hash-input.ts`): `hashRowInput()` — FNV-1a 64-bit over a canonical, key-order-independent JSON form of a row's input; synchronous and runtime-agnostic (no `node:crypto`), so Node, Cloudflare Workers, and browsers produce the same join key.
- **`TestSettings` schema**: new optional `experiment_key` and `score_thresholds` fields.
