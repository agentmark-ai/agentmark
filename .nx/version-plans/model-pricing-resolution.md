---
'@agentmark-ai/model-registry': minor
'@agentmark-ai/cli': minor
---

feat(pricing): layered model-id price resolution

Adds an fs-free `@agentmark-ai/model-registry/pricing` entry point that
centralizes model→price mapping: `buildPricingDictionary` (per-token →
per-1K conversion, previously duplicated across consumers) and
`resolveModelPrice`/`resolveModelKey` with layered matching — exact id,
then normalized candidates (provider path prefixes like `openai/` and
`models/`, OpenAI fine-tune ids `ft:base:org::id`, Bedrock cross-region
prefixes `us.`/`eu.`, version suffixes `-2024-08-06`/`@20241022`/`-latest`),
then case-insensitive, then longest boundary-prefix fallback.

`ModelRegistry.getPricingForModel` and the CLI's local trace cost
attribution now resolve through these rules, so spans reporting
provider-prefixed, fine-tuned, region-prefixed, or newly released dated
model ids price against the closest registry entry instead of $0.
