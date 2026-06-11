import { runServer } from './server.js';

runServer().catch((error: unknown) => {
  console.error('Failed to start MCP server:', error);
  console.error('\nTroubleshooting tips:');
  console.error('  1. Set AGENTMARK_API_URL to the AgentMark endpoint you want');
  console.error('     to target. Defaults to https://api.agentmark.co.');
  console.error('     For local dev traces, point at http://localhost:9418');
  console.error('     (the `agentmark dev` server).');
  console.error('  2. For cloud calls, set AGENTMARK_API_KEY or run `npx @agentmark-ai/cli login`.');
  console.error('     Local dev calls are unauthenticated.');
  console.error('\nExample configuration:');
  console.error('  AGENTMARK_API_URL=http://localhost:9418 npx -y @agentmark-ai/mcp-server');
  process.exit(1);
});
