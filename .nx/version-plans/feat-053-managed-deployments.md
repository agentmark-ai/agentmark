---
"@agentmark-ai/api-schemas": minor
"@agentmark-ai/api-types": minor
"@agentmark-ai/cli": minor
---

**REST API for managed deployments (spec 053):**

- `@agentmark-ai/api-schemas`: New `schemas/deployments.ts` module with Zod schemas for managed deployment resources (additive — no breaking changes to existing schemas).
- `@agentmark-ai/api-types`: Regenerated to include the new deployment types.
- `@agentmark-ai/cli`: Local dev server now serves the deployment endpoints (cloud-only behavior returns 501 stubs); `openapi-spec.json` extended with deployment routes for consumers of the spec.
