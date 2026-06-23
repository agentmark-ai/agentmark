---
'@agentmark-ai/mcp-server': patch
---

Publish the MCP server to the official MCP Registry. Adds the `mcpName` ownership link to `package.json` and a `server.json` (declaring the `AGENTMARK_API_KEY` / `AGENTMARK_API_URL` environment variables). The release workflow publishes the registry entry via GitHub Actions OIDC immediately after the npm publish. Once released, MCP directories (Glama, PulseMCP, mcp.so) ingest it from the registry automatically.
