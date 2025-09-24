import type { McpServers } from "@agentmark/agentmark-core";
import { interpolateEnvInObject } from "@agentmark/agentmark-core";

type MCPClientLike = {
  getTools: () => Promise<Record<string, unknown>>;
};

export class MCPClientManager {
  private readonly rawServers?: McpServers;
  private interpolatedServers?: McpServers;
  private clientPromise?: Promise<MCPClientLike>;
  private toolsCache: Map<string, Record<string, unknown>> = new Map();

  constructor(servers?: McpServers) {
    this.rawServers = servers;
  }

  private getInterpolatedServers(): McpServers | undefined {
    if (!this.rawServers) return undefined;
    if (!this.interpolatedServers) {
      this.interpolatedServers = interpolateEnvInObject(this.rawServers, {
        strict: false,
      });
    }
    return this.interpolatedServers;
  }

  private async ensureClient(): Promise<MCPClientLike> {
    if (!this.clientPromise) {
      const servers = this.getInterpolatedServers() ?? {};
      this.clientPromise = this.createClient(servers);
    }
    return this.clientPromise;
  }

  private async createClient(servers: McpServers): Promise<MCPClientLike> {
    const serversForClient: Record<string, any> = {};
    for (const [name, cfg] of Object.entries(servers ?? {})) {
      const anyCfg = cfg as any;
      const urlValue: string | undefined = anyCfg?.URL || anyCfg?.url;
      if (urlValue) {
        const unsupported = Object.keys(anyCfg).filter(
          (k) => !["URL", "url"].includes(k)
        );
        if (unsupported.length > 0) {
          throw new Error(
            `Unsupported MCP server options for '${name}': ${unsupported.join(
              ", "
            )}. Only 'URL' is supported for HTTP servers.`
          );
        }
        const url = new URL(urlValue);
        serversForClient[name] = { url };
        continue;
      }
      if (anyCfg && anyCfg.command) {
        const unsupported = Object.keys(anyCfg).filter(
          (k) => !["command", "args", "env"].includes(k)
        );
        if (unsupported.length > 0) {
          throw new Error(
            `Unsupported MCP server options for '${name}': ${unsupported.join(
              ", "
            )}. Only 'command', 'args', and 'env' are supported for stdio servers.`
          );
        }
        serversForClient[name] = {
          command: anyCfg.command as string,
          args: anyCfg.args as string[] | undefined,
          env: anyCfg.env as Record<string, string> | undefined,
        };
        continue;
      }
      throw new Error("Invalid MCP server config: expected 'url' or 'command'");
    }
    let mod: any;
    try {
      mod = await import("@mastra/mcp");
    } catch (err) {
      throw new Error(
        "@mastra/mcp is not installed. Please add it as a dependency in your app."
      );
    }
    const mcp = new mod.MCPClient({ servers: serversForClient });
    return mcp as MCPClientLike;
  }

  async getNamespacedTools(): Promise<Record<string, unknown>> {
    const client = await this.ensureClient();
    const CACHE_KEY = "__all__";
    const cached = this.toolsCache.get(CACHE_KEY);
    if (cached) return cached;
    const tools = await client.getTools();
    this.toolsCache.set(CACHE_KEY, tools);
    return tools;
  }
}


