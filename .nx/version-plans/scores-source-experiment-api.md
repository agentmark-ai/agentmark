---
'@agentmark-ai/sdk': minor
'agentmark-sdk': minor
'@agentmark-ai/ui-components': minor
'@agentmark-ai/api-schemas': minor
'@agentmark-ai/cli': minor
---

Align the score `source` enum with `experiment | annotation | api`. `SCORE_SOURCE_TYPES` (api-schemas) now validates the public score-write API against those three values and defaults an omitted source to `"api"` (was `"eval"`); the legacy `"eval"` value is no longer accepted on write. `score()` (TS + Python SDK) sends `source`, defaulting to `"api"`. Both experiment score-writers stamp `source: "experiment"`: the SDK `runExperiment` eval loop and the CLI `agentmark run-experiment` score POST. ui-components `ScoreData.source` widened to match (`"eval"` kept only as a legacy display value for historical rows).
