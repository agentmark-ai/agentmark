---
'@agentmark-ai/claude-agent-sdk-v0-adapter': patch
'@agentmark-ai/claude-agent-sdk-v0-adapter-python': patch
'@agentmark-ai/pydantic-ai-v0-adapter': patch
'create-agentmark': patch
---

Rename Claude Agent SDK adapter to include upstream version in the name (`v0`), matching the existing convention used by `mastra-v0-adapter`, `ai-sdk-v4-adapter`, and `ai-sdk-v5-adapter`. The adapter now publishes as `@agentmark-ai/claude-agent-sdk-v0-adapter` (TypeScript) and `agentmark-claude-agent-sdk-v0` (Python). `create-agentmark` example templates updated to reference the new names. `agentmark-pydantic-ai-v0` bumped to 0.1.0 for its first PyPI release.
