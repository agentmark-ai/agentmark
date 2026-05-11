---
"@agentmark-ai/ai-sdk-v4-adapter": patch
"@agentmark-ai/ai-sdk-v5-adapter": patch
"@agentmark-ai/api-schemas": patch
"@agentmark-ai/claude-agent-sdk-v0-adapter": patch
"@agentmark-ai/cli": patch
"@agentmark-ai/create-agentmark": patch
"@agentmark-ai/eslint-config": patch
"@agentmark-ai/fallback-adapter": patch
"@agentmark-ai/loader-api": patch
"@agentmark-ai/loader-file": patch
"@agentmark-ai/mcp-server": patch
"@agentmark-ai/model-registry": patch
"@agentmark-ai/prompt-core": patch
"@agentmark-ai/sdk": patch
"@agentmark-ai/shared-utils": patch
"@agentmark-ai/templatedx": patch
---

**License change: MIT → AGPL-3.0-or-later.**

The runtime code is byte-identical to the previous patch release — only the
`LICENSE.md` file and the `license` field in each `package.json` change. Bumping
as a patch (not a major) because no compile/runtime behavior is affected.

**Downstream impact (please read before upgrading):** AGPL-3.0 has copyleft
and network-use obligations that MIT does not. Consumers using these packages
in proprietary or SaaS products may need to evaluate compatibility before
upgrading. Users who need the MIT terms can pin to the last MIT-licensed
release of each package.
