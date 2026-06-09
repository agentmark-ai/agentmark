---
'@agentmark-ai/prompt-core': minor
'@agentmark-ai/cli': patch
---

refactor(prompt-core,cli): move webhook dispatch into prompt-core/webhook-runner

`handleWebhookRequest` and its types (`WebhookHandler`, `WebhookRequest`,
`WebhookResponse`, `TelemetryOptions`, and the `ControlPlaneClient` re-export)
now live in `@agentmark-ai/prompt-core/webhook-runner`, alongside the
`WebhookRunner` they pair with.

Why: a deployed handler's only need from the CLI was this dispatch function, but
importing `@agentmark-ai/cli/runner-server` drags the CLI's entire dependency
tree — an embedded Next.js dashboard (`next`, `react`, `@mui/*`, `apexcharts`,
`better-sqlite3`, ~400 packages) — into the deployed app. The managed-deploy
build then has to `npm install` all of it just to bundle a handler, which is
slow and was timing out. The dispatch is generic over the handler and already
spoke only prompt-core types, so it belongs in prompt-core. A deployed handler
now depends on `prompt-core` + its adapter only; the CLI stays a dev dependency.

prompt-core (minor): new public exports at the `webhook-runner` subpath.
cli (patch): `@agentmark-ai/cli/runner-server` keeps exporting the same symbols
via thin re-export shims, so existing deployed handlers importing from it keep
working unchanged. No behavior change — the dispatch logic is byte-identical,
pinned by the same `conformance-vectors/control-plane.json` golden cases (the
behavior suite moved to prompt-core's `webhook-dispatch.test.ts`; the CLI keeps
a back-compat guard asserting the shim still forwards to the implementation).

Docs updated: the managed `handler.ts` examples now import the dispatch from
`@agentmark-ai/prompt-core/webhook-runner`; `createWebhookServer` (local dev)
stays on `@agentmark-ai/cli/runner-server`.
