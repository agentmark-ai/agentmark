import { runServer } from './server.js';

runServer().catch((error: unknown) => {
  console.error('Failed to start MCP server:', error);
  console.error('\nTroubleshooting tips:');
  console.error('  1. Ensure AGENTMARK_URL is set (default: http://localhost:9418)');
  console.error('  2. For local development, make sure `agentmark dev` is running');
  console.error('  3. For cloud usage, set AGENTMARK_API_KEY environment variable');
  console.error('\nExample configuration:');
  console.error('  AGENTMARK_URL=http://localhost:9418 npx @agentmark-ai/mcp-server');
  process.exit(1);
});
