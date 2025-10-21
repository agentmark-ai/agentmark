export const getDevServerContent = () => {
  return `// dev-server.ts
// This file starts the AgentMark development servers
// Run with: npm run dev (or agentmark dev)

import { client } from './agentmark.config';
import { createDevServers } from '@agentmark/cli/dev-servers';
import { createRunnerServer } from '@agentmark/vercel-ai-v4-adapter/dev';

// Parse command line arguments
const args = process.argv.slice(2);
const runnerPortArg = args.find(arg => arg.startsWith('--runner-port='));
const filePortArg = args.find(arg => arg.startsWith('--file-port='));

const runnerPort = runnerPortArg ? parseInt(runnerPortArg.split('=')[1]) : 9417;
const fileServerPort = filePortArg ? parseInt(filePortArg.split('=')[1]) : 9418;

async function main() {
  await createDevServers({
    client: client as any,
    runnerPort,
    fileServerPort,
    createRunnerServerFn: createRunnerServer
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
`;
};
