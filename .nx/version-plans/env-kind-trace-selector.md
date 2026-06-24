---
'@agentmark-ai/sdk': minor
---

Add per-request environment selection to the tracer. `initTracing({ environment, prNumber })` — with `AGENTMARK_ENVIRONMENT` / `AGENTMARK_PR_NUMBER` env-var fallbacks so CI can select an env with no code — emits `X-Agentmark-Environment` / `X-Agentmark-Pr-Number` headers, letting a kind-scoped API key attribute traces to a named environment or a pull request's preview env. On Vercel the selector is auto-derived from `VERCEL_ENV` / `VERCEL_GIT_PULL_REQUEST_ID` (zero config). Omitted selectors fall back to the key's pinned environment (unchanged behavior).
