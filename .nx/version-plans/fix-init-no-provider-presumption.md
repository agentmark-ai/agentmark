---
'@agentmark-ai/cli': patch
---

`agentmark init` no longer presumes a provider. It used to seed
`builtInModels: ["openai/gpt-5.5"]` so the dashboard dropdown wasn't empty on
first run — but the model is provider-specific and the provider isn't known at
init time, so in (say) an Anthropic project this produced an immediate
model/provider mismatch the user (or their coding agent) had to undo. `init`
now seeds `builtInModels: []`; the integration step populates it for the chosen
provider via `pull-models`. Until then `doctor` warns (with the `pull-models`
fix) and prompts can use any model (no allowlist enforcement) — an honest
empty default instead of a wrong one.
