---
"@agentmark-ai/model-registry": patch
"@agentmark-ai/cli": patch
---

Periodic model-registry data sync — refreshes the bundled pricing/model snapshot served from the CLI's local `/v1/pricing` endpoint and consumed by SDKs that rely on the model-registry workspace dep. No API changes.
