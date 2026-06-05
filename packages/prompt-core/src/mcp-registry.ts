import type {
  McpServerConfig,
  McpUrlServerConfig,
  McpStdioServerConfig,
} from "./mcp";
import { interpolateEnvInObject } from "./mcp";

/**
 * Minimal interface an MCP client must satisfy. Every SDK's MCP client
 * (AI SDK v4/v5, Mastra, etc.) exposes `tools()` returning a map keyed by
 * tool name — that's all the registry needs. The actual client import is
 * deferred to the executor package via the `createClient` factory so
 * `prompt-core` stays free of SDK dependencies.
 */
export interface McpClient<TTool> {
  tools(): Promise<Record<string, TTool>>;
}

/**
 * Factory that creates a client given the raw server config. The factory
 * is responsible for picking the right transport (SSE/stdio) and importing
 * the SDK's MCP client dynamically as a peer dependency.
 */
export type McpClientFactory<TTool> = (
  config: McpUrlServerConfig | McpStdioServerConfig
) => Promise<McpClient<TTool>>;

function isUrlConfig(cfg: McpServerConfig): cfg is McpUrlServerConfig {
  return (cfg as McpUrlServerConfig).url !== undefined;
}

function isStdioConfig(cfg: McpServerConfig): cfg is McpStdioServerConfig {
  return (cfg as McpStdioServerConfig).command !== undefined;
}

/**
 * Shared MCP server registry. Resolves `mcp://server/tool` URIs (including
 * the `mcp://server/*` wildcard) to SDK-native tool values. Connection +
 * tool listing is cached per server; client construction is deferred to
 * the per-SDK `McpClientFactory` so this package has zero MCP runtime deps.
 */
export class McpServerRegistry<TTool = unknown> {
  private readonly servers = new Map<string, McpServerConfig>();
  private readonly clients = new Map<string, Promise<McpClient<TTool>>>();
  private readonly toolsCache = new Map<string, Record<string, TTool>>();

  constructor(private readonly factory: McpClientFactory<TTool>) {}

  register(name: string, config: McpServerConfig): this {
    this.servers.set(name, config);
    return this;
  }

  registerServers(servers: Record<string, McpServerConfig>): this {
    for (const [name, config] of Object.entries(servers)) {
      this.register(name, config);
    }
    return this;
  }

  has(name: string): boolean {
    return this.servers.has(name);
  }

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

  private async createClient(serverName: string): Promise<McpClient<TTool>> {
    const rawCfg = this.getConfigOrThrow(serverName);
    const cfg = interpolateEnvInObject(rawCfg);

    if (isUrlConfig(cfg) || isStdioConfig(cfg)) {
      return this.factory(cfg);
    }

    throw new Error("Invalid MCP server config: expected 'url' or 'command'");
  }

  async getClient(serverName: string): Promise<McpClient<TTool>> {
    const existing = this.clients.get(serverName);
    if (existing) return existing;
    const created = this.createClient(serverName);
    this.clients.set(serverName, created);
    created.catch((err: unknown) => {
      console.error(
        `[McpServerRegistry] Failed to connect to MCP server '${serverName}':`,
        err
      );
      this.clients.delete(serverName);
    });
    return created;
  }

  async getTool(serverName: string, toolName: string): Promise<TTool> {
    const existingTools = this.toolsCache.get(serverName);
    if (existingTools && existingTools[toolName]) {
      return existingTools[toolName];
    }

    let allTools: Record<string, TTool>;
    try {
      const client = await this.getClient(serverName);
      allTools = await client.tools();
      this.toolsCache.set(serverName, allTools);
    } catch (err) {
      this.toolsCache.delete(serverName);
      throw err;
    }

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

  async getAllTools(serverName: string): Promise<Record<string, TTool>> {
    const existingTools = this.toolsCache.get(serverName);
    if (existingTools) {
      return existingTools;
    }

    try {
      const client = await this.getClient(serverName);
      const allTools = await client.tools();
      this.toolsCache.set(serverName, allTools);
      return allTools;
    } catch (err) {
      this.toolsCache.delete(serverName);
      throw err;
    }
  }
}
