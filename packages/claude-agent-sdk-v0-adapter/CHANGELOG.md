## 0.3.1 (2026-04-08)

### 🩹 Fixes

- Rename Claude Agent SDK adapter to include upstream version in the name (`v0`), matching the existing convention used by `mastra-v0-adapter`, `ai-sdk-v4-adapter`, and `ai-sdk-v5-adapter`. The adapter now publishes as `@agentmark-ai/claude-agent-sdk-v0-adapter` (TypeScript) and `agentmark-claude-agent-sdk-v0` (Python). `create-agentmark` example templates updated to reference the new names. `agentmark-pydantic-ai-v0` bumped to 0.1.0 for its first PyPI release. ([#547](https://github.com/agentmark-ai/agentmark/pull/547))

## 0.3.0 (2026-03-18)

### 🚀 Features

- Breaking change: removed tool registries from all adapters. Adapters now accept native SDK tools directly. MDX tools field changed from record to string array. MCP bridge utilities removed from Claude adapter. ([#522](https://github.com/agentmark-ai/agentmark/pull/522))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.3.0
- Updated @agentmark-ai/sdk to 1.0.7

## 0.2.0 (2026-02-19)

### 🚀 Features

- Add seamless pull-models flow with provider/model format ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - prompt-core: validate model names against builtInModels allow-list at load time
  - ai-sdk-v4-adapter, ai-sdk-v5-adapter: add registerProviders() and getModelFunction() for seamless provider/model string resolution; add speech model support
  - claude-agent-sdk-adapter, mastra-v0-adapter: update model registry to use provider/model format
  - create-agentmark: scaffold new projects with builtInModels in provider/model format and registerProviders wiring

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.2.0
- Updated @agentmark-ai/sdk to 1.0.6

## 0.1.2 (2026-02-19)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#495](https://github.com/agentmark-ai/agentmark/pull/495))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.1.2
- Updated @agentmark-ai/sdk to 1.0.5

## 0.1.1 (2026-01-21)

This was a version bump only for @agentmark-ai/claude-agent-sdk-adapter to align it with other projects, there were no code changes.

# @agentmark-ai/claude-agent-sdk-adapter

## 0.1.0

### Minor Changes

- 97abbdd: Add claude agent sdk adapter
