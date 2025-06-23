// Map providers to their correct environment variable names
const providerApiKeyMap: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY", 
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
  xai: "XAI_API_KEY",
  ollama: "" // Ollama doesn't need an API key for local usage
};

export const getEnvFileContent = (modelProvider: string, useCloud: string = 'cloud', apiKey: string = ''): string => {
  const envVarName = providerApiKeyMap[modelProvider] || `${modelProvider.toUpperCase()}_API_KEY`;
  const apiKeyValue = apiKey || 'your_api_key_here';
  
  // Ollama doesn't need an API key for local usage
  const needsApiKey = modelProvider !== 'ollama';
  
  if (useCloud === 'cloud') {
    let content = `# Agentmark API credentials
AGENTMARK_API_KEY=your_api_key_here
AGENTMARK_APP_ID=your_app_id_here
`;
    if (needsApiKey) {
      content += `${envVarName}=${apiKeyValue}\n`;
    }
    return content;
  } else {
    if (needsApiKey) {
      return `# API keys for the model provider
${envVarName}=${apiKeyValue}
`;
    } else {
      return `# No API key needed for ${modelProvider}
`;
    }
  }
}; 