---
'@agentmark-ai/cli': patch
---

Fix route-ordering bug where `GET /v1/scores/aggregations` was being caught by `GET /v1/scores/:scoreId` (returning a 404 score-not-found instead of the intended 501 cloud-only stub).
