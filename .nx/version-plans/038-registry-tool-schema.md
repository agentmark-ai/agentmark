---
'@agentmark-ai/prompt-core': minor
'@agentmark-ai/ai-sdk-v4-adapter': minor
'@agentmark-ai/ai-sdk-v5-adapter': minor
'@agentmark-ai/claude-agent-sdk-adapter': minor
'@agentmark-ai/mastra-v0-adapter': minor
'@agentmark-ai/pydantic-ai-v0-adapter': minor
'@agentmark-ai/create-agentmark': minor
---

Breaking change: removed tool registries from all adapters. Adapters now accept native SDK tools directly. MDX tools field changed from record to string array. MCP bridge utilities removed from Claude adapter.
