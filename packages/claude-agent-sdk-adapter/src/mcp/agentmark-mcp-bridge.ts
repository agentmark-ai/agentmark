import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { AgentMarkToolDefinition } from "../types";

/** Package version - updated during build or manually */
const PACKAGE_VERSION = "1.0.0";

/**
 * MCP Server configuration that can be passed to Claude Agent SDK
 */
export interface AgentMarkMcpServerConfig {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** Tool definitions */
  tools: AgentMarkToolDefinition[];
}

/**
 * Options for creating an AgentMark MCP server
 */
export interface CreateMcpServerOptions {
  /** Server version (defaults to package version) */
  version?: string;
}

/**
 * Convert JSON Schema to Zod schema.
 * Handles basic types - extend as needed for more complex schemas.
 */
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  const type = schema.type as string;
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const required = schema.required as string[] | undefined;
  const items = schema.items as Record<string, unknown> | undefined;

  switch (type) {
    case 'string':
      return z.string();
    case 'number':
    case 'integer':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      if (items) {
        return z.array(jsonSchemaToZod(items));
      }
      return z.array(z.unknown());
    case 'object':
      if (properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const [key, propSchema] of Object.entries(properties)) {
          const zodProp = jsonSchemaToZod(propSchema);
          shape[key] = required?.includes(key) ? zodProp : zodProp.optional();
        }
        return z.object(shape);
      }
      return z.record(z.unknown());
    default:
      return z.unknown();
  }
}

/**
 * Creates tool wrappers for AgentMark tools that can be used with Claude Agent SDK's MCP support.
 *
 * Uses Claude Agent SDK's native tool() and createSdkMcpServer() functions.
 *
 * @param name - Server name
 * @param tools - AgentMark tool definitions
 * @param options - Optional configuration (version, etc.)
 * @returns MCP server configuration
 *
 * @example
 * ```typescript
 * const tools = toolRegistry.getTools();
 * const mcpServer = createAgentMarkMcpServer('agentmark-tools', tools);
 *
 * // Use with Claude Agent SDK
 * const result = await query({
 *   prompt: "Use the tools to help me",
 *   options: {
 *     mcpServers: {
 *       'agentmark-tools': mcpServer
 *     }
 *   }
 * });
 * ```
 */
export function createAgentMarkMcpServer(
  name: string,
  tools: AgentMarkToolDefinition[],
  options?: CreateMcpServerOptions
): AgentMarkMcpServerConfig {
  const version = options?.version ?? PACKAGE_VERSION;

  return {
    name,
    version,
    tools,
  };
}

/**
 * Converts an AgentMark MCP server config to Claude Agent SDK mcpServers format.
 *
 * Uses Claude Agent SDK's native createSdkMcpServer() function.
 *
 * @param serverConfig - The AgentMark MCP server configuration
 * @returns Configuration compatible with Claude Agent SDK mcpServers option
 */
export function toClaudeAgentMcpServer(
  serverConfig: AgentMarkMcpServerConfig
): ReturnType<typeof createSdkMcpServer> {
  // Convert AgentMark tools to SDK tool definitions
  const sdkTools = serverConfig.tools.map((agentmarkTool) => {
    // Convert JSON Schema parameters to Zod schema
    const zodSchema = jsonSchemaToZod(agentmarkTool.parameters);

    // Get the shape from the zod object schema
    const shape = zodSchema instanceof z.ZodObject
      ? (zodSchema as z.ZodObject<z.ZodRawShape>).shape
      : { input: z.unknown() };

    return tool(
      agentmarkTool.name,
      agentmarkTool.description,
      shape,
      async (args) => {
        try {
          const result = await agentmarkTool.execute(args);
          return {
            content: [
              {
                type: 'text' as const,
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error executing tool ${agentmarkTool.name}: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  });

  // Create the SDK MCP server
  return createSdkMcpServer({
    name: serverConfig.name,
    version: serverConfig.version,
    tools: sdkTools,
  });
}

/**
 * Helper to check if any tools are available
 */
export function hasTools(tools: AgentMarkToolDefinition[]): boolean {
  return tools.length > 0;
}
