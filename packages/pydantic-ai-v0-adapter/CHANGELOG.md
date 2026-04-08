## 0.1.1 (2026-04-08)

### 🩹 Fixes

- Rename Claude Agent SDK adapter to include upstream version in the name (`v0`), matching the existing convention used by `mastra-v0-adapter`, `ai-sdk-v4-adapter`, and `ai-sdk-v5-adapter`. The adapter now publishes as `@agentmark-ai/claude-agent-sdk-v0-adapter` (TypeScript) and `agentmark-claude-agent-sdk-v0` (Python). `create-agentmark` example templates updated to reference the new names. `agentmark-pydantic-ai-v0` bumped to 0.1.0 for its first PyPI release. ([#547](https://github.com/agentmark-ai/agentmark/pull/547))

## 0.1.0 (2026-03-18)

### 🚀 Features

- Breaking change: removed tool registries from all adapters. Adapters now accept native SDK tools directly. MDX tools field changed from record to string array. MCP bridge utilities removed from Claude adapter. ([#522](https://github.com/agentmark-ai/agentmark/pull/522))

## 0.0.1 (2026-02-19)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#495](https://github.com/agentmark-ai/agentmark/pull/495))