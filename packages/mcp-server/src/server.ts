import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createDataSource } from './data-source/index.js';
import type { DataSource } from './data-source/types.js';
import { resolveBaseUrl, resolveBearer } from './openapi/auth.js';
import { fetchOpenAPISpec } from './openapi/spec-loader.js';
import { registerOpenAPITools } from './openapi/register-tools.js';

/**
 * Register all trace debugging tools on the MCP server
 * @internal Exported for testing purposes
 */
export function registerTools(server: McpServer, dataSource: DataSource) {
  // Filter schema for get_spans
  const SpanFilterSchema = z.object({
    field: z.string().describe('Field to filter on (e.g., "name", "status", "duration", "data.type", "data.model")'),
    operator: z.enum(['eq', 'gt', 'gte', 'lt', 'lte', 'contains'])
      .describe('Comparison operator: eq (equals), gt/gte/lt/lte (numeric comparison), contains (string match)'),
    value: z.union([z.string(), z.number()])
      .describe('Value to compare against'),
  });

  // list_traces tool
  server.tool(
    'list_traces',
    'List recent traces with metadata. Returns trace IDs, names, status (0=ok, 1=warning, 2=error), latency, cost, and token counts. Use this to find traces to debug.',
    {
      limit: z.number().min(1).max(200).optional().default(50)
        .describe('Maximum number of traces to return (default: 50, max: 200)'),
      sessionId: z.string().optional().describe('Filter traces by session ID'),
      datasetRunId: z.string().optional().describe('Filter traces by dataset run ID'),
      cursor: z.string().optional().describe('Pagination cursor from previous response'),
    },
    async (args) => {
      try {
        const result = await dataSource.listTraces({
          limit: args.limit,
          sessionId: args.sessionId,
          datasetRunId: args.datasetRunId,
          cursor: args.cursor,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const isTimeout = message.includes('timeout');
        // Connection-failure detection. The HttpDataSource rewraps
        // ECONNREFUSED as "Connection failed: …" before the error reaches
        // here, so match the rewrapped prefix in addition to the raw
        // node:net error codes — otherwise these tag as INVALID_QUERY,
        // confusing the client about whether the server is even reachable.
        const isConnection =
          message.includes('ECONNREFUSED') ||
          message.includes('fetch failed') ||
          message.startsWith('Connection failed:');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: message,
                code: isTimeout ? 'TIMEOUT' : isConnection ? 'CONNECTION_FAILED' : 'INVALID_QUERY',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // get_trace tool - returns trace summary with filtered/paginated spans
  server.tool(
    'get_trace',
    'Get trace summary including status, latency, cost, and token counts. Use this to understand overall trace health before drilling into spans. Status: 0=ok, 1=warning, 2=error.',
    {
      traceId: z.string().describe('The trace ID to retrieve'),
      filters: z.array(SpanFilterSchema).optional()
        .describe('Filter criteria. Examples: [{"field": "status", "operator": "eq", "value": "2"}] for errors, [{"field": "duration", "operator": "gt", "value": 1000}] for slow spans, [{"field": "data.type", "operator": "eq", "value": "GENERATION"}] for LLM calls'),
      limit: z.number().min(1).max(200).optional().default(50)
        .describe('Results per page (default: 50, max: 200)'),
      cursor: z.string().optional()
        .describe('Pagination cursor from previous response'),
    },
    async (args) => {
      try {
        const result = await dataSource.getTrace(args.traceId, {
          filters: args.filters,
          limit: args.limit,
          cursor: args.cursor,
        });

        if (!result) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Trace not found: ${args.traceId}`,
                  code: 'NOT_FOUND',
                  details: { traceId: args.traceId },
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const isTimeout = message.includes('timeout');
        // Connection-failure detection. The HttpDataSource rewraps
        // ECONNREFUSED as "Connection failed: …" before the error reaches
        // here, so match the rewrapped prefix in addition to the raw
        // node:net error codes — otherwise these tag as INVALID_QUERY,
        // confusing the client about whether the server is even reachable.
        const isConnection =
          message.includes('ECONNREFUSED') ||
          message.includes('fetch failed') ||
          message.startsWith('Connection failed:');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: message,
                code: isTimeout ? 'TIMEOUT' : isConnection ? 'CONNECTION_FAILED' : 'INVALID_QUERY',
                details: { traceId: args.traceId },
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

}

/**
 * Create and configure the MCP server.
 *
 * Two tool sets are registered:
 *
 *   1. **Trace-debugging tools** (existing) — backed by the local
 *      ClickHouse / SQLite data source. These work without any
 *      AgentMark Cloud auth and let an agent inspect traces from a
 *      `agentmark dev` session.
 *
 *   2. **AgentMark Cloud tools** (new) — generated at startup from
 *      the gateway's `/v1/openapi.json` spec. One MCP tool per
 *      operation, names derived from the spec's operationIds. Auth
 *      via the session bearer from `~/.agentmark/auth.json` (after
 *      `agentmark login`) or `AGENTMARK_API_KEY` env. When neither
 *      credential resolves, the OpenAPI tool set is skipped silently
 *      so the trace-debugging tools still work.
 *
 * This is the headless surface for agents that need to provision
 * apps, mint API keys, kick off deployments, etc. The CLI side
 * stays curated for terminal humans; agents flow through here.
 */
export async function createMCPServer() {
  const server = new McpServer({
    name: 'agentmark',
    version: '0.2.0',
  });

  const dataSource = createDataSource();
  registerTools(server, dataSource);

  // Try to register the OpenAPI-driven Cloud tools. If we can't
  // resolve auth or fetch the spec, skip silently — the user may be
  // running this MCP server purely for local trace debugging.
  const bearer = resolveBearer();
  if (bearer) {
    const baseUrl = resolveBaseUrl();
    try {
      const spec = await fetchOpenAPISpec(baseUrl);
      const registered = registerOpenAPITools(server, {
        spec,
        baseUrl,
        bearer,
      });
      console.error(
        `[agentmark-mcp] Registered ${registered.length} Cloud tools from ${baseUrl}/v1/openapi.json`,
      );
    } catch (err) {
      console.error(
        `[agentmark-mcp] Failed to load Cloud OpenAPI spec from ${baseUrl}; only local trace-debugging tools will be available. Error: ${(err as Error).message}`,
      );
    }
  } else {
    console.error(
      '[agentmark-mcp] No auth credential found (run `agentmark login` or set AGENTMARK_API_KEY). Cloud tools disabled; local trace-debugging tools still work.',
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
