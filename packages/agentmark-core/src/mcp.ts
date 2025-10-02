export type ToolJsonSchema = Record<string, any>;

export type InlineToolDefinition = {
  description: string;
  parameters: ToolJsonSchema;
};

export type NormalizedTool = {
  alias: string;
  kind: "mcp" | "inline";
  value: string | InlineToolDefinition;
};

export type McpUrlServerConfig = {
  url: string;
  headers?: Record<string, string>;
};

export type McpStdioServerConfig = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
};

export type McpServerConfig = McpUrlServerConfig | McpStdioServerConfig;
export type McpServers = Record<string, McpServerConfig>;

const ENV_PATTERN = /^env\(['"]([A-Z0-9_]+)['"]\)$/;

export function parseMcpUri(uri: string): { server: string; tool: string } {
  if (typeof uri !== "string" || !uri.startsWith("mcp://")) {
    throw new Error("Invalid MCP URI: must start with 'mcp://'");
  }

  const withoutScheme = uri.slice("mcp://".length);
  const firstSlash = withoutScheme.indexOf("/");
  if (firstSlash === -1) {
    throw new Error("Invalid MCP URI: expected 'mcp://{server}/{tool}'");
  }

  const server = withoutScheme.slice(0, firstSlash).trim();
  const tool = withoutScheme.slice(firstSlash + 1).trim();

  if (!server) {
    throw new Error("Invalid MCP URI: server part is empty");
  }
  if (!tool) {
    throw new Error("Invalid MCP URI: tool part is empty");
  }

  return { server, tool };
}

export function interpolateEnvInObject<T>(
  input: T,
  options?: { strict?: boolean }
): T {
  const strict = options?.strict ?? true;

  function visit(value: unknown): unknown {
    if (typeof value === "string") {
      const match = value.match(ENV_PATTERN);
      if (match) {
        const varName = match[1];
        const envValue = process.env[varName];
        if (envValue === undefined) {
          if (strict) {
            throw new Error(`Missing environment variable: ${varName}`);
          }
          return value;
        }
        return envValue;
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => visit(item));
    }

    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = visit(v);
      }
      return result as unknown as T;
    }

    return value;
  }

  return visit(input) as T;
}

export function normalizeToolsMap(
  tools: Record<string, string | InlineToolDefinition>
): NormalizedTool[] {
  const result: NormalizedTool[] = [];
  for (const [alias, value] of Object.entries(tools ?? {})) {
    if (typeof value === "string") {
      result.push({ alias, kind: "mcp", value });
      continue;
    }
    if (
      value &&
      typeof value === "object" &&
      typeof value.description === "string" &&
      value.parameters
    ) {
      result.push({ alias, kind: "inline", value });
      continue;
    }
    throw new Error(
      `Invalid tool entry for alias '${alias}': expected MCP URI string or inline tool definition`
    );
  }
  return result;
}


