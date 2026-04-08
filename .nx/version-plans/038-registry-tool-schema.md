---
'@agentmark-ai/prompt-core': minor
'@agentmark-ai/ai-sdk-v4-adapter': minor
'@agentmark-ai/ai-sdk-v5-adapter': minor
'@agentmark-ai/mastra-v0-adapter': minor
---

Breaking change: removed tool registries from all adapters. Adapters now accept native SDK tools directly. MDX tools field changed from record to string array. MCP bridge utilities removed from Claude adapter.

(claude-agent-sdk-v0-adapter, create-agentmark, and the pydantic-ai adapter were dropped from this plan when restoring it because their bumps were already shipped via subsequent releases or namespace renames.)
