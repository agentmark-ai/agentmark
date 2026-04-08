## 0.10.3 (2026-04-08)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/shared-utils to 0.3.1

## 0.10.2 (2026-04-08)

### 🩹 Fixes

- Rename Claude Agent SDK adapter to include upstream version in the name (`v0`), matching the existing convention used by `mastra-v0-adapter`, `ai-sdk-v4-adapter`, and `ai-sdk-v5-adapter`. The adapter now publishes as `@agentmark-ai/claude-agent-sdk-v0-adapter` (TypeScript) and `agentmark-claude-agent-sdk-v0` (Python). `create-agentmark` example templates updated to reference the new names. `agentmark-pydantic-ai-v0` bumped to 0.1.0 for its first PyPI release. ([#547](https://github.com/agentmark-ai/agentmark/pull/547))

## 0.10.1 (2026-03-24)

### 🩹 Fixes

- Update example templates: simplify tool definitions to string array format, fix ast type from unknown to any. ([#526](https://github.com/agentmark-ai/agentmark/pull/526))

## 0.10.0 (2026-03-18)

### 🚀 Features

- Breaking change: removed tool registries from all adapters. Adapters now accept native SDK tools directly. MDX tools field changed from record to string array. MCP bridge utilities removed from Claude adapter. ([#522](https://github.com/agentmark-ai/agentmark/pull/522))

## 0.9.0 (2026-02-19)

### 🚀 Features

- Add seamless pull-models flow with provider/model format ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - prompt-core: validate model names against builtInModels allow-list at load time
  - ai-sdk-v4-adapter, ai-sdk-v5-adapter: add registerProviders() and getModelFunction() for seamless provider/model string resolution; add speech model support
  - claude-agent-sdk-adapter, mastra-v0-adapter: update model registry to use provider/model format
  - create-agentmark: scaffold new projects with builtInModels in provider/model format and registerProviders wiring

### 🩹 Fixes

- Fix builtInModels derived from templates instead of hardcoded adapter switch ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - createExamplePrompts() now returns the model IDs it actually writes, making it the single source of truth for builtInModels
  - Removes the hardcoded adapter→model switch that was missing openai/dall-e-3 and openai/tts-1-hd for ai-sdk users
  - ai-sdk users now get all three models (gpt-4o, dall-e-3, tts-1-hd) in builtInModels on init
- Fix agentmark.json missing from initial git commit and duplicate dev-config.json locations ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - create-agentmark: move initGitRepo() to main() so it runs after agentmark.json is written, ensuring all files land in the initial commit
  - cli: add findProjectRoot() that walks up to find agentmark.json, anchoring .agentmark/dev-config.json there as a single source of truth regardless of which directory agentmark dev is run from

## 0.8.4 (2026-02-19)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#495](https://github.com/agentmark-ai/agentmark/pull/495))

## 0.8.3 (2026-02-14)

### 🩹 Fixes

- Show webhook secret in --remote banner, simplify generated npm scripts to single `agentmark` command, and fix duplicate trace exporter in SDK. ([#479](https://github.com/agentmark-ai/agentmark/pull/479))

## 0.8.2 (2026-02-13)

### 🩹 Fixes

- Init tracing for demo ([#471](https://github.com/agentmark-ai/agentmark/pull/471))

## 0.8.1 (2026-02-09)

### 🩹 Fixes

- Init tracing for demo ([#469](https://github.com/agentmark-ai/agentmark/pull/469))

## 0.8.0 (2026-02-04)

### 🚀 Features

- Use cloudflared instead of local tunnel ([#459](https://github.com/agentmark-ai/agentmark/pull/459))

# Changelog

## 0.7.0

### Minor Changes

- 97abbdd: Add claude agent sdk adapter
- a4a1d95: Support mcp server

### Patch Changes

- Updated dependencies [97abbdd]
  - @agentmark-ai/shared-utils@0.2.0

## 0.6.0

### Minor Changes

- ca59b7c: Change package orgs

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

### Patch Changes

- Updated dependencies [39bae0f]
  - @agentmark-ai/shared-utils@0.1.0

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `create-agentmark`.
> See git history for prior changelog entries.
