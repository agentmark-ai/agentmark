export const getDevServerContent = () => {
  return `// dev-server.ts
// This file starts the AgentMark development servers
// Run with: npm run dev (or agentmark dev)

import { client } from './agentmark.config';

// Parse command line arguments
const args = process.argv.slice(2);
const runnerPortArg = args.find(arg => arg.startsWith('--runner-port='));
const filePortArg = args.find(arg => arg.startsWith('--file-port='));

const runnerPort = runnerPortArg ? parseInt(runnerPortArg.split('=')[1]) : 9417;
const fileServerPort = filePortArg ? parseInt(filePortArg.split('=')[1]) : 9418;

async function main() {
  const { createDevServers } = await import("@agentmark/vercel-ai-v4-adapter/dev");

  await createDevServers({
    client: client as any,
    runnerPort,
    fileServerPort
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
`;
};
