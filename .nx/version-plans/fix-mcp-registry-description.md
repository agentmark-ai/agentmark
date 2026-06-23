---
'@agentmark-ai/mcp-server': patch
---

Shorten the MCP server's `server.json` description to satisfy the official MCP Registry's 100-character limit on `description`. The 0.4.1 registry publish was rejected with a 422 validation error (`body.description: expected length <= 100`); the next release republishes with a compliant description.
