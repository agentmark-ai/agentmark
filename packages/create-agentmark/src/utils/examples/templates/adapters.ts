export interface AdapterConfig {
  /** npm package name for the adapter */
  package: string;
  /** Additional npm packages required by this adapter */
  dependencies: string[];
  /** Class names used in generated code */
  classes: {
    modelRegistry: string;
    toolRegistry: string;
    webhookHandler: string;
  };
}

export const ADAPTERS: Record<string, AdapterConfig> = {
  'ai-sdk': {
    package: '@agentmark/ai-sdk-v5-adapter',
    dependencies: ['ai@^5'],
    classes: {
      modelRegistry: 'VercelAIModelRegistry',
      toolRegistry: 'VercelAIToolRegistry',
      webhookHandler: 'VercelAdapterWebhookHandler',
    },
  },
  'mastra': {
    package: '@agentmark/mastra-v0-adapter',
    dependencies: ['@mastra/core@<0.20.0', '@mastra/mcp@<0.13.4'],
    classes: {
      modelRegistry: 'MastraModelRegistry',
      toolRegistry: 'MastraToolRegistry',
      webhookHandler: 'MastraAdapterWebhookHandler',
    },
  },
};

export function getAdapterConfig(adapter: string): AdapterConfig {
  const config = ADAPTERS[adapter];
  if (!config) {
    throw new Error(`Unknown adapter: ${adapter}. Available adapters: ${Object.keys(ADAPTERS).join(', ')}`);
  }
  return config;
}
