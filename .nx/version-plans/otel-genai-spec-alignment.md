---
'@agentmark-ai/sdk': minor
'agentmark-sdk': minor
'@agentmark-ai/shared-utils': minor
---

feat(sdk): align with OTel GenAI semantic conventions (dual-emit + standard-shape ingest)

Emit side (additive, no breaking removals):
- observe()/@observe and SpanContext setInput/setOutput now dual-emit
  vendor-namespaced `agentmark.request.input` / `agentmark.response.output`
  alongside the deprecated `gen_ai.request.input` / `gen_ai.response.output`
  (the gen_ai keys are not spec attributes and will be removed in a future
  release).
- `sessionId`/`session_id` additionally emits the standard
  `gen_ai.conversation.id`.
- Both masking processors treat the new vendor IO keys as sensitive.

Ingest side (normalizer): accepts the standard OTel GenAI shapes as
fallbacks when AgentMark keys are absent — `gen_ai.input.messages`,
`gen_ai.output.messages`, `gen_ai.system_instructions` (folded into input
as a leading system message), legacy `gen_ai.prompt`/`gen_ai.completion`,
`gen_ai.provider.name` wherever `gen_ai.system` was read,
`gen_ai.conversation.id` as a sessionId fallback, and legacy
`gen_ai.usage.prompt_tokens`/`completion_tokens`. AgentMark keys always win.
