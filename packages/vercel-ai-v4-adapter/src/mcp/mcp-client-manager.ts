import type {
  McpServers,
  McpServerConfig,
  McpUrlServerConfig,
  McpStdioServerConfig,
} from "@agentmark/agentmark-core";
import { interpolateEnvInObject } from "@agentmark/agentmark-core";
import type { Tool } from "ai";
import { experimental_createMCPClient } from "ai";
// @ts-expect-error no types
import { Experimental_StdioMCPTransport } from "ai/mcp-stdio";

type MCPClient = {
  tools(): Promise<Record<string, Tool<any, any>>>;
};

function isUrlConfig(cfg: McpServerConfig): cfg is McpUrlServerConfig {
  return (cfg as McpUrlServerConfig).url !== undefined;
}

function isStdioConfig(cfg: McpServerConfig): cfg is McpStdioServerConfig {
  return (cfg as McpStdioServerConfig).command !== undefined;
}

export class McpClientManager {
  private readonly servers: McpServers;
  private readonly clients = new Map<string, Promise<MCPClient>>();
  private readonly toolsCache = new Map<
    string,
    Record<string, Tool<any, any>>
  >();

  constructor(servers?: McpServers) {
    this.servers = servers ?? {};
  }

  private getServerConfigOrThrow(server: string): McpServerConfig {
    const cfg = this.servers[server];
    if (!cfg) {
      throw new Error(`MCP server '${server}' not configured`);
    }
    return cfg;
  }

  private async createClient(server: string): Promise<MCPClient> {
    const rawCfg = this.getServerConfigOrThrow(server);
    const cfg = interpolateEnvInObject(rawCfg);

    if (isUrlConfig(cfg)) {
      return experimental_createMCPClient({
        transport: { type: "sse", url: cfg.url, headers: cfg.headers },
      }) as unknown as MCPClient;
    }

    if (isStdioConfig(cfg)) {
      const transport = new Experimental_StdioMCPTransport({
        command: cfg.command,
        args: cfg.args,
        cwd: cfg.cwd,
        env: cfg.env,
      });
      return experimental_createMCPClient({
        transport,
      }) as unknown as MCPClient;
    }

    throw new Error("Invalid MCP server config: expected 'url' or 'command'");
  }

  async getClient(server: string): Promise<MCPClient> {
    const existing = this.clients.get(server);
    if (existing) return existing;
    const created = this.createClient(server);
    this.clients.set(server, created);
    return created;
  }

  async getTool(server: string, toolName: string): Promise<Tool<any, any>> {
    const cacheKey = server;
    const existingTools = this.toolsCache.get(cacheKey);
    if (existingTools && existingTools[toolName]) {
      return existingTools[toolName];
    }

    const client = await this.getClient(server);
    const allTools = await client.tools();
    this.toolsCache.set(cacheKey, allTools);

    const tool = allTools[toolName];
    if (!tool) {
      throw new Error(
        `MCP tool not found: ${server}/${toolName}. Available tools: ${Object.keys(
          allTools
        ).join(", ")}`
      );
    }
    return tool;
  }

  async getAllTools(server: string): Promise<Record<string, Tool<any, any>>> {
    const cacheKey = server;
    const existingTools = this.toolsCache.get(cacheKey);
    if (existingTools) {
      return existingTools;
    }

    const client = await this.getClient(server);
    const allTools = await client.tools();
    this.toolsCache.set(cacheKey, allTools);
    return allTools;
  }
}
