---
"@agentmark-ai/shared-utils": minor
---

Normalizer: robust AI-SDK input extraction, model-based span-kind resolution, and experiment span attributes — all additive.

- **AI-SDK v4/v5 input extraction** (`strategies/v4.ts`, `strategies/v5.ts`): `extractInput` now handles every `ai.prompt` shape — message array, `{messages, system?}`, `{prompt, system?}`, and bare strings — via a new `coerceToMessages` helper, so wrapper spans and string-prompt generation calls no longer render blank input.
- **Semantic-kind resolver** (`semantic-kind-resolver.ts`): a new rule resolves spans carrying `gen_ai.request.model` to `"llm"` (catching vendor-neutral model calls that name maps miss), and `ai.generateText` / `ai.streamText` / `ai.generateObject` / `ai.streamObject` were added to the Vercel AI-SDK operation map.
- **AgentMark parser + types**: extract the `experiment_key` and `source_tree_hash` span attributes into `NormalizedSpan` (new optional `experimentKey` / `sourceTreeHash` fields).
