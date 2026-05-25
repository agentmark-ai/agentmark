/**
 * Runtime config for the MCP server. The MCP server only talks to one
 * URL — the AgentMark gateway (cloud) or a local `agentmark dev`
 * server. Both serve the same OpenAPI contract at `/v1/openapi.json`;
 * scaffolded projects register one MCP entry per endpoint they want
 * (`agentmark` for cloud, `agentmark-local` for port 9418).
 */
export interface MCPServerConfig {
  url: string;
  apiKey?: string;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 30000;

export function getConfig(): MCPServerConfig {
  const parsedTimeout = parseInt(process.env.AGENTMARK_TIMEOUT_MS || '', 10);
  return {
    url: process.env.AGENTMARK_API_URL || 'https://api.agentmark.co',
    apiKey: process.env.AGENTMARK_API_KEY,
    timeoutMs: Number.isNaN(parsedTimeout) ? DEFAULT_TIMEOUT_MS : parsedTimeout,
  };
}
