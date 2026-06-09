---
'@agentmark-ai/prompt-core': minor
'agentmark-prompt-core': minor
'@agentmark-ai/cli': patch
'@agentmark-ai/ai-sdk-v5-adapter': patch
'@agentmark-ai/ai-sdk-v4-adapter': patch
'agentmark-pydantic-ai-v0': patch
'agentmark-claude-agent-sdk-v0': patch
---

refactor(webhook): shared cross-language get-evals control-plane contract

The dashboard's New Experiment dialog showed "No evals available" because the
`get-evals` webhook job had no dispatch. This makes `get-evals` a contract the
TS and Python clients share and every adapter inherits:

- `ControlPlaneClient` (TS interface / Python Protocol): the AgentMark client
  owns `getEvalNames()` / `get_eval_names()`.
- `buildEvalsResponse()` / `build_evals_response()`: one shared wire helper per
  language, emitting a byte-identical `{type:'evals', result, traceId}` envelope
  (names sorted for a deterministic cross-language order; serialized compact and
  raw-UTF-8 so the bytes match across languages).
- The shared dispatch sources names from the client. The CLI's
  `handleWebhookRequest` falls back to the handler's surfaced client, so the
  Vercel adapters answer `get-evals` with zero extra wiring; the per-adapter
  eval logic is removed.

prompt-core (TS + Python) gain new public API → minor. The CLI, the Vercel
v4/v5 adapters (surface their client), and the pydantic / claude-agent-sdk
Python adapters (wire the dispatch) → patch. A shared
`conformance-vectors/control-plane.json` keeps both languages and all adapters
from drifting.
