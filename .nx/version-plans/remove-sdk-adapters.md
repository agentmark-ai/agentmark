---
'@agentmark-ai/prompt-core': minor
'@agentmark-ai/fallback-adapter': minor
'@agentmark-ai/shared-utils': patch
'@agentmark-ai/sdk': patch
'@agentmark-ai/loader-file': patch
agentmark-sdk: patch
agentmark-prompt-core: minor
agentmark-templatedx: patch
---

Remove the SDK-specific adapter packages (ai-sdk-v4-adapter, ai-sdk-v5-adapter,
ai-sdk-shared, mastra-v0-adapter, pydantic-ai-v0-adapter). AgentMark integrates
with any SDK through the neutral render / executor seam.

`createAgentMark` is now the single client factory: its `adapter` argument is
optional in both languages (TypeScript `createAgentMark({ loader })`, Python
`create_agentmark(loader=loader)`) and defaults to the neutral
`DefaultAdapter`. `createAgentMarkClient` is a deprecated alias in
`@agentmark-ai/prompt-core`; `@agentmark-ai/fallback-adapter` is deprecated
and re-exports both unchanged.
