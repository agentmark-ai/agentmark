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

export const createAdapterConfig = (
  provider: string
): Record<string, AdapterConfig> => {
  return {
    "ai-sdk": {
      package: "@agentmark-ai/ai-sdk-v5-adapter",
      dependencies: ["ai@^5", `@ai-sdk/${provider}@^2`],
      classes: {
        modelRegistry: "VercelAIModelRegistry",
        toolRegistry: "VercelAIToolRegistry",
        webhookHandler: "VercelAdapterWebhookHandler",
      },
    },
    mastra: {
      package: "@agentmark-ai/mastra-v0-adapter",
      dependencies: [
        "@mastra/core@<0.20.0",
        "@mastra/mcp@<0.13.4",
        `@ai-sdk/${provider}@<2`,
      ],
      classes: {
        modelRegistry: "MastraModelRegistry",
        toolRegistry: "MastraToolRegistry",
        webhookHandler: "MastraAdapterWebhookHandler",
      },
    },
  };
};

export function getAdapterConfig(
  adapter: string,
  provider: string
): AdapterConfig {
  const config = createAdapterConfig(provider)[adapter];
  if (!config) {
    throw new Error(
      `Unknown adapter: ${adapter}. Available adapters: ${Object.keys(
        createAdapterConfig(provider)
      ).join(", ")}`
    );
  }
  return config;
}
