---
"@agentmark-ai/api-schemas": minor
"@agentmark-ai/api-types": minor
"@agentmark-ai/cli": minor
---

Add `?name=X` lookup to `/v1/prompts` (gateway + OSS):

- `@agentmark-ai/api-schemas`: New `ListPromptsQuerySchema` accepting an optional `name` param, plus `ListPromptsBodySchema` (`{ paths: string[] }`) and `ListPromptsResponseSchema` envelope so consumers can resolve prompts by name without scanning a list.
- `@agentmark-ai/api-types`: Regenerated to include the new query/response types.
- `@agentmark-ai/cli`: Local dev server's `GET /v1/prompts` now accepts an optional `?name=X` query param and returns matching paths (single-element array on convention-match, possibly more on frontmatter scan).
