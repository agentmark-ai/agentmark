---
"@agentmark-ai/shared-utils": minor
"@agentmark-ai/claude-agent-sdk-v0-adapter": patch
"@agentmark-ai/mastra-v0-adapter": patch
---

Stable, content-hashed dataset item names for cross-runtime regression-vs-baseline comparison.

- New shared utility `computeDatasetItemName(input, fallbackIndex)` in `@agentmark-ai/shared-utils` — first 12 hex chars of MD5 of canonical JSON, matching the pydantic-ai adapter's byte-for-byte format.
- Mastra and Claude Agent SDK adapters now use the new utility instead of `String(index)`. Item names survive dataset row reordering and produce identical identifiers across TypeScript and Python runtimes — a precondition for baseline lookup keying on `(prompt × scorer × row)`.
