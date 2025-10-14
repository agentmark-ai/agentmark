// Map providers to their correct environment variable names
const providerApiKeyMap: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY", 
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
  xai: "XAI_API_KEY",
  ollama: "" // Ollama doesn't need an API key for local usage
};

export const getEnvFileContent = (
  modelProvider: string,
  apiKey: string = ''
): string => {
  const envVarName = providerApiKeyMap[modelProvider] || `${modelProvider.toUpperCase()}_API_KEY`;
  const apiKeyValue = apiKey || 'your_api_key_here';

  // Ollama doesn't need an API key for local usage
  const needsApiKey = modelProvider !== 'ollama';

  let content = `# Cloud deployment: Set these environment variables
# AGENTMARK_BASE_URL=https://api.agentmark.co
# AGENTMARK_API_KEY=your_agentmark_api_key
# AGENTMARK_APP_ID=your_agentmark_app_id
# Learn more: https://docs.agentmark.co/platform/getting_started/quickstart

`;

  if (needsApiKey) {
    content += `${envVarName}=${apiKeyValue}\n`;
  } else {
    content += `# No API key needed for ${modelProvider}\n`;
  }

  return content;
}; 