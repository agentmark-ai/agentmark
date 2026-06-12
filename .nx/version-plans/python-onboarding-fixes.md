---
'agentmark-prompt-core': minor
'@agentmark-ai/cli': minor
'@agentmark-ai/model-registry': minor
'@agentmark-ai/prompt-core': patch
---

Python + Bedrock onboarding fixes (friction report from a real first-contact setup):

- `agentmark-prompt-core` (Python): new `serve_webhook_runner(runner)` — a stdlib HTTP
  server for the `.agentmark/dev_server.py` entry point, the Python counterpart of the
  TS `createWebhookServer`. Parses the `--webhook-port` flag `agentmark dev` passes,
  serves `runner.dispatch` (POST `{type, data}` → JSON or `AgentMark-Streaming` NDJSON
  with a trailing `done`/`traceId` event), and runs all user async code on one
  persistent event loop. Previously the documented Python entry point built a runner
  and exited — there was no way to serve it without hand-rolling the wire contract.
- `@agentmark-ai/cli`: `pull-models --provider X --models <leaf>` now accepts leaf
  model names (the provider prefix is redundant when `--provider` is explicit);
  already-added models are skipped instead of erroring (idempotent for CI); the
  unknown-model error explains the provider-prefixed ID form. The post-add provider
  hint is language-aware — Python projects get executor guidance instead of
  TypeScript `@ai-sdk/*` imports. Project-language detection now recognizes
  `requirements.txt`, `setup.py`, and a root `dev_server.py` (with explicit AgentMark
  client files taking precedence), so requirements.txt-only projects get Python
  guidance from `doctor`/`dev` on first contact instead of "agentmark.client.ts
  missing". All user-facing command hints use the universally runnable
  `npx @agentmark-ai/cli <cmd>` form (`npx agentmark` only resolved when the CLI
  happened to be a local dependency).
- `@agentmark-ai/prompt-core` (TS): the local dev server's streaming responses now
  always carry `Content-Type: application/x-ndjson` alongside `AgentMark-Streaming`
  (the managed deploy servers already sent both; the dispatch's header fallback
  didn't). The HTTP layer of both local dev servers is now pinned to the shared
  `conformance-vectors/webhook-http.json` so TS and Python can't drift.
- `@agentmark-ai/model-registry`: current Claude Bedrock model IDs in overrides —
  Opus 4.6 (`anthropic.claude-opus-4-6-v1`), Sonnet 4.6, Sonnet 4.5, Opus 4.5, and
  Haiku 4.5 ARN-versioned IDs with their `global.`/`us.`/`eu.`/`jp.`/`apac.`
  cross-region inference profiles (regional entries carry the 10% CRIS premium), plus
  the Messages-API Bedrock IDs `anthropic.claude-opus-4-8` / `anthropic.claude-opus-4-7`
  (which have no ARN-versioned form).
