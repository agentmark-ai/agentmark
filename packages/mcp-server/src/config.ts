export interface MCPServerConfig {
  url: string;
  apiKey?: string;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 30000;

export function getConfig(): MCPServerConfig {
  const parsedTimeout = parseInt(process.env.AGENTMARK_TIMEOUT_MS || '', 10);
  return {
    url: process.env.AGENTMARK_URL || 'http://localhost:9418',
    apiKey: process.env.AGENTMARK_API_KEY,
    timeoutMs: Number.isNaN(parsedTimeout) ? DEFAULT_TIMEOUT_MS : parsedTimeout,
  };
}
