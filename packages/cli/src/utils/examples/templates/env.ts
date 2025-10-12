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
  target: string = 'cloud', 
  apiKey: string = '',
  agentmarkApiKey: string = '',
  agentmarkAppId: string = ''
): string => {
  const envVarName = providerApiKeyMap[modelProvider] || `${modelProvider.toUpperCase()}_API_KEY`;
  const apiKeyValue = apiKey || 'your_api_key_here';
  
  // Ollama doesn't need an API key for local usage
  const needsApiKey = modelProvider !== 'ollama';
  
  if (target === 'cloud') {
    let content = `# Add these to your deployed environments. Read: https://docs.agentmark.co/platform/getting_started/quickstart to learn more
AGENTMARK_API_KEY=
AGENTMARK_APP_ID=
AGENTMARK_BASE_URL=http://localhost:9418
`;
    if (needsApiKey) {
      content += `${envVarName}=${apiKeyValue}\n`;
    }
    return content;
  } else {
    let content = `# API keys for the model provider\n`;
    if (needsApiKey) {
      content += `${envVarName}=${apiKeyValue}\n`;
    } else {
      content += `# No API key needed for ${modelProvider}\n`;
    }
    return content;
  }
}; 