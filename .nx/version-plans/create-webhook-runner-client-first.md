---
'@agentmark-ai/prompt-core': major
'@agentmark-ai/sdk': major
'@agentmark-ai/loader-api': patch
'@agentmark-ai/loader-file': patch
'agentmark-prompt-core': minor
'agentmark-sdk': minor
'agentmark-templatedx': minor
---

Client-first webhook runner + API-surface major. sdk 2.0 / prompt-core 1.0
(stabilized: the deprecated surface is gone; what remains is the supported API):

**Breaking (TS):**
- `createWebhookRunner({ client, executor, hooks? })` — `client` is REQUIRED;
  the `loader`/`evals` options are removed. Register both once, on
  `createAgentMark`; the runner sources them from the client. The factory's
  single implementation lives in prompt-core (main barrel + `/webhook-runner`
  subpath, no tracing default); `@agentmark-ai/sdk`'s export wraps it and
  defaults hooks to AgentMark tracing.
- Removed: `createAgentMarkClient` (use `createAgentMark`), the `evalRegistry`
  option (use `evals`), the deprecated `RunExperimentOptions` alias in the
  webhook runner (use `WebhookExperimentOptions`), and the XML helpers from
  the main barrel (`escapeXmlAttribute`/`escapeXmlText`/`wrapCdata`/
  `stringifyForXml` → `@agentmark-ai/prompt-core/internal`, not semver-stable).
- sdk's prompt-core peer floor is now `>=1.0.0`.

**Breaking (Python, pre-1.0 minor):**
- `create_webhook_runner(client, executor, *)` — the executor-first legacy
  signature and the `loader`/`evals` kwargs are removed; `eval_registry` is
  removed from `AgentMark`/`create_agentmark` (use `evals`).

**Additive:**
- `ApiLoader`/`FileLoader` at `@agentmark-ai/prompt-core/loader-api` +
  `/loader-file`; the standalone loader packages become re-export shims
  (patch) and `@agentmark-ai/fallback-adapter` is retired from publishing.
- `WebhookExperimentOptions` (renamed from the colliding name).
- `AgentMarkSDK.runExperiment` runs on prompt-core's shared `runDatasetPool`
  and accepts `signal?: AbortSignal`.
- Python namespace aliases `agentmark.sdk` / `agentmark.templatedx`
  (explicit re-exports; flat names remain supported).
