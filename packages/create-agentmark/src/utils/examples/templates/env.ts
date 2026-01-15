export const getEnvFileContent = (
  _modelProvider: string,
  apiKey: string = '',
  adapter: string = 'ai-sdk'
): string => {
  const apiKeyValue = apiKey || 'your_api_key_here';

  // Use ANTHROPIC_API_KEY for claude-agent-sdk adapter
  const apiKeyName = adapter === 'claude-agent-sdk' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';

  return `# Cloud deployment: Set these environment variables
# AGENTMARK_BASE_URL=https://api.agentmark.co
# AGENTMARK_API_KEY=your_agentmark_api_key
# AGENTMARK_APP_ID=your_agentmark_app_id
# Learn more: https://docs.agentmark.co/platform/getting_started/quickstart

${apiKeyName}=${apiKeyValue}
`;
};
