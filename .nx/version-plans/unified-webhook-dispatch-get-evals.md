---
'@agentmark-ai/prompt-core': minor
'@agentmark-ai/sdk': minor
'@agentmark-ai/ai-sdk-v4-adapter': minor
'@agentmark-ai/ai-sdk-v5-adapter': minor
'@agentmark-ai/mastra-v0-adapter': minor
'@agentmark-ai/claude-agent-sdk-v0-adapter': minor
'@agentmark-ai/conformance-vectors': patch
'agentmark-prompt-core': minor
'agentmark-pydantic-ai-v0': minor
'agentmark-claude-agent-sdk-v0': minor
'agentmark-sdk': minor
---

feat(webhook): the runner owns dispatch; evals reach the cloud on every path

The New Experiment dialog showed *"No evals available"* for deployed apps even
when they registered evals. Root cause: no single object owned "what the
deployed app exposes," so the eval registry had to travel a hand-assembled chain
(client → executor → runner → handler → dispatch → transport) that every entry
path re-wired — and any path could drop it. The Python managed handler hand-rolled
dispatch and 400'd on `get-evals`; the TS managed server forwarded the dispatch
envelope raw; the BYO `createWebhookRunner` built a client with no `evals` input
at all. This makes the chain non-assemblable.

- **Dispatch lives on the runner.** `WebhookRunner.dispatch(event)` (TS + Python)
  routes prompt-run / dataset-run / get-evals, sourcing evals from its OWN
  client — no passable, omittable client argument. The canonical managed handler
  is `handler = runner.dispatch` (or `adapterHandler.dispatch`). `runner.client`
  / `getEvalNames()` are public so a runner satisfies the control-plane contract.

- **`evals` is threaded through every builder.** TS `createWebhookRunner({ evals })`
  and the new Python `create_webhook_runner(executor, evals=…)` register evals
  once → they both run in experiments and list in the dialog. Adapter factories
  already threaded evals; now the BYO path does too.

- **Adapters delegate, don't reimplement.** Pydantic / claude / ai-sdk-v4 / v5
  webhook handlers expose `.dispatch` + `.client` by delegating to the shared
  runner (both span hooks bundled at construction); no per-adapter dispatch code.

- **Anti-drift.** `conformance-vectors/protocol-catalog.json` gains a normative
  `webhookJobs` section; both languages assert their REAL dispatch's job-type set
  (`WEBHOOK_JOB_TYPES` / `WebhookRequest['type']`) is exhaustive over it, and the
  get-evals payload stays pinned to `control-plane.json` on the dev AND managed
  surfaces. Adding a job to one language without the other fails the other's CI.

New public API (minor) across prompt-core (TS + Python), the SDK
(`createWebhookRunner` `evals` option), and the adapters (`dispatch`/`client`).
Back-compat: `handleWebhookRequest(event, handler, client?)` still works; the
managed servers still accept legacy flat results. The managed Node server now
unwraps the dispatch envelope (the TS half of the empty dialog) — see
`apps/builder` machine-execute-contract test (monorepo, not released here).
