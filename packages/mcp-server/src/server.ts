import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createDataSource } from './data-source/index.js';
import type { DataSource } from './data-source/types.js';

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
        const isConnection = message.includes('ECONNREFUSED') || message.includes('fetch failed');

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
        const isConnection = message.includes('ECONNREFUSED') || message.includes('fetch failed');

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
 * Create and configure the MCP server
 */
export async function createMCPServer() {
  const server = new McpServer({
    name: 'agentmark-traces',
    version: '0.1.0',
  });

  const dataSource = createDataSource();
  registerTools(server, dataSource);

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
