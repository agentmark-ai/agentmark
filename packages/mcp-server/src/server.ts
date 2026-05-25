import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveBaseUrl, resolveBearer } from './openapi/auth.js';
import { fetchOpenAPISpec } from './openapi/spec-loader.js';
import { registerOpenAPITools } from './openapi/register-tools.js';

/**
 * Create and configure the MCP server.
 *
 * All tools come from the OpenAPI spec served at
 * `<AGENTMARK_API_URL>/v1/openapi.json` — one MCP tool per operation,
 * names derived from the spec's operationIds. The same MCP binary
 * serves the agent's "cloud" and "local" needs by pointing at
 * different URLs:
 *
 *   - `AGENTMARK_API_URL=https://api.agentmark.co` (default) →
 *     full AgentMark Cloud surface (create_app, list_traces, etc.).
 *     Tool calls require auth (session bearer or `AGENTMARK_API_KEY`).
 *
 *   - `AGENTMARK_API_URL=http://localhost:9418` →
 *     local `agentmark dev` server. Same OpenAPI contract, narrower
 *     operation set. Calls are unauthenticated locally.
 *
 * Scaffolded projects ship with two MCP server entries in `mcp.json`
 * — `agentmark` (cloud) and `agentmark-local` (port 9418) — so the
 * agent has both surfaces available in the same conversation and the
 * MCP client namespaces tools by server name
 * (`agentmark/list_traces` vs `agentmark-local/list_traces`).
 *
 * Tool registration is unconditional. We do NOT require auth at
 * startup — fetching the OpenAPI spec is public on both endpoints. If
 * we can't reach the spec endpoint (offline, dev server not running,
 * URL typo) we surface the error and return an empty MCP server
 * rather than crashing.
 */
export async function createMCPServer() {
  const server = new McpServer({
    name: 'agentmark',
    version: '0.2.0',
  });

  const baseUrl = resolveBaseUrl();
  const bearer = resolveBearer();
  try {
    const spec = await fetchOpenAPISpec(baseUrl);
    const registered = registerOpenAPITools(server, {
      spec,
      baseUrl,
      bearer: bearer ?? '',
    });
    console.error(
      `[agentmark-mcp] Registered ${registered.length} tools from ${baseUrl}/v1/openapi.json`,
    );
    if (!bearer) {
      console.error(
        `[agentmark-mcp] No auth credential resolved. Cloud calls will 401; local-dev calls (AGENTMARK_API_URL=http://localhost:…) work unauthenticated. Run \`agentmark login\` or set AGENTMARK_API_KEY for cloud access.`,
      );
    }
  } catch (err) {
    console.error(
      `[agentmark-mcp] Failed to load OpenAPI spec from ${baseUrl}/v1/openapi.json — no tools registered. Error: ${(err as Error).message}`,
    );
  }

  return server;
}

/**
 * Run the MCP server with stdio transport
 */
export async function runServer() {
  const server = await createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
