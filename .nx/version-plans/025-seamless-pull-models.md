---
'@agentmark-ai/cli': minor
'@agentmark-ai/prompt-core': minor
'@agentmark-ai/ai-sdk-v4-adapter': minor
'@agentmark-ai/ai-sdk-v5-adapter': minor
'@agentmark-ai/claude-agent-sdk-adapter': minor
'@agentmark-ai/mastra-v0-adapter': minor
'create-agentmark': minor
---

Add seamless pull-models flow with provider/model format

- prompt-core: validate model names against builtInModels allow-list at load time
- ai-sdk-v4-adapter, ai-sdk-v5-adapter: add registerProviders() and getModelFunction() for seamless provider/model string resolution; add speech model support
- claude-agent-sdk-adapter, mastra-v0-adapter: update model registry to use provider/model format
- create-agentmark: scaffold new projects with builtInModels in provider/model format and registerProviders wiring
