export const getEnvFileContent = (modelProvider: string, useCloud: string = 'cloud'): string => {
  if (useCloud === 'cloud') {
    return `# Agentmark API credentials
AGENTMARK_API_KEY=your_api_key_here
AGENTMARK_APP_ID=your_app_id_here
${modelProvider.toUpperCase()}_API_KEY=your_api_key_here
`;
  } else {
    return `# API keys for the model provider
${modelProvider.toUpperCase()}_API_KEY=your_api_key_here
`;
  }
}; 