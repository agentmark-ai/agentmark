export interface MCPServerConfig {
  url: string;
  apiKey?: string;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 30000;

export function getConfig(): MCPServerConfig {
  return {
    url: process.env.AGENTMARK_URL || 'http://localhost:9418',
    apiKey: process.env.AGENTMARK_API_KEY,
    timeoutMs: parseInt(process.env.AGENTMARK_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10),
  };
}
