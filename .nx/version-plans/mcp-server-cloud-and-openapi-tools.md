---
"@agentmark-ai/mcp-server": minor
---

Cloud-first rewrite: the MCP server now generates one tool per AgentMark API operation and authenticates against the cloud gateway by default.

- **OpenAPI-driven tools.** Instead of a fixed handful of hand-written trace tools, the server fetches `<AGENTMARK_API_URL>/v1/openapi.json` at startup and registers one MCP tool per `/v1/*` operation (~73 tools: traces, spans, sessions, scores, experiments, datasets, environments, deployments, alerts, apps, …).
- **Cloud by default.** `AGENTMARK_API_URL` now defaults to `https://api.agentmark.co`; auth resolves from `AGENTMARK_API_KEY` (or an `agentmark login` session).
- **App-scoped reads now work.** For app-scoped routes whose path has no `{appId}` param (`GET /v1/traces`, `/v1/spans`, `POST /v1/scores`, …), the server sends `X-Agentmark-App-Id` resolved from **`AGENTMARK_APP_ID`**. Without it those routes 401 `Missing app id`, making the entire trace/span/score read surface unusable for a headless agent — this is the fix that lets the client read cloud traces at all.

**Migration (config change; minor under 0.x):** the endpoint env var was renamed `AGENTMARK_URL` → `AGENTMARK_API_URL` and its default flipped from `http://localhost:9418` to cloud. Local-dev users now set `AGENTMARK_API_URL=http://localhost:9418`; cloud users set `AGENTMARK_API_KEY` + `AGENTMARK_APP_ID`.
