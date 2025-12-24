import type {
  McpServerConfig,
  McpUrlServerConfig,
  McpStdioServerConfig,
} from "@agentmark-ai/prompt-core";
import { interpolateEnvInObject } from "@agentmark-ai/prompt-core";
import type { Tool } from "ai";

type MCPClient = {
  tools(): Promise<Record<string, Tool<any, any>>>;
};

function isUrlConfig(cfg: McpServerConfig): cfg is McpUrlServerConfig {
  return (cfg as McpUrlServerConfig).url !== undefined;
}

function isStdioConfig(cfg: McpServerConfig): cfg is McpStdioServerConfig {
  return (cfg as McpStdioServerConfig).command !== undefined;
}

export class McpServerRegistry {
  private readonly servers = new Map<string, McpServerConfig>();
  private readonly clients = new Map<string, Promise<MCPClient>>();
  private readonly toolsCache = new Map<
    string,
    Record<string, Tool<any, any>>
  >();

  /**
   * Register an MCP server with the given configuration
   * @param name - The name of the MCP server
   * @param config - The server configuration (URL or stdio)
   */
  register(name: string, config: McpServerConfig): this {
    this.servers.set(name, config);
    return this;
  }

  /**
   * Register multiple MCP servers at once
   * @param servers - A record of server names to configurations
   */
  registerServers(servers: Record<string, McpServerConfig>): this {
    for (const [name, config] of Object.entries(servers)) {
      this.register(name, config);
    }
    return this;
  }

  /**
   * Check if an MCP server is registered
   */
  has(name: string): boolean {
    return this.servers.has(name);
  }

  /**
   * Get the configuration for a registered MCP server
   */
  getConfig(name: string): McpServerConfig | undefined {
    return this.servers.get(name);
  }

  private getConfigOrThrow(name: string): McpServerConfig {
    const cfg = this.servers.get(name);
    if (!cfg) {
      throw new Error(
        `MCP server '${name}' not registered. Available servers: ${Array.from(
          this.servers.keys()
        ).join(", ")}`
      );
    }
    return cfg;
  }

  private async createClient(serverName: string): Promise<MCPClient> {
    const rawCfg = this.getConfigOrThrow(serverName);
    const cfg = interpolateEnvInObject(rawCfg);

    if (isUrlConfig(cfg)) {
      const { experimental_createMCPClient } = await import("@ai-sdk/mcp");
      return experimental_createMCPClient({
        transport: { type: "sse", url: cfg.url, headers: cfg.headers },
      });
    }

    if (isStdioConfig(cfg)) {
      const { Experimental_StdioMCPTransport } = await import("@ai-sdk/mcp/mcp-stdio");
      const { experimental_createMCPClient } = await import("@ai-sdk/mcp");
      const transport = new Experimental_StdioMCPTransport({
        command: cfg.command,
        args: cfg.args,
        cwd: cfg.cwd,
        env: cfg.env,
      });
      return experimental_createMCPClient({
        transport,
      });
    }

    throw new Error("Invalid MCP server config: expected 'url' or 'command'");
  }

  async getClient(serverName: string): Promise<MCPClient> {
    const existing = this.clients.get(serverName);
    if (existing) return existing;
    const created = this.createClient(serverName);
    this.clients.set(serverName, created);
    return created;
  }

  async getTool(serverName: string, toolName: string): Promise<Tool<any, any>> {
    const cacheKey = serverName;
    const existingTools = this.toolsCache.get(cacheKey);
    if (existingTools && existingTools[toolName]) {
      return existingTools[toolName];
    }

    const client = await this.getClient(serverName);
    const allTools = await client.tools();
    this.toolsCache.set(cacheKey, allTools);

    const tool = allTools[toolName];
    if (!tool) {
      throw new Error(
        `MCP tool not found: ${serverName}/${toolName}. Available tools: ${Object.keys(
          allTools
        ).join(", ")}`
      );
    }
    return tool;
  }

  async getAllTools(
    serverName: string
  ): Promise<Record<string, Tool<any, any>>> {
    const cacheKey = serverName;
    const existingTools = this.toolsCache.get(cacheKey);
    if (existingTools) {
      return existingTools;
    }

    const client = await this.getClient(serverName);
    const allTools = await client.tools();
    this.toolsCache.set(cacheKey, allTools);
    return allTools;
  }
}
