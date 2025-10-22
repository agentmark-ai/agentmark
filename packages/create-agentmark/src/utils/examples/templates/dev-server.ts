export const getDevServerContent = () => {
  return `// dev-server.ts
// This file starts the AgentMark development servers
// Run with: npm run dev (or agentmark dev)

import { client } from './agentmark.config';
import { createRunnerServer } from '@agentmark/cli/runner-server';
import { VercelAdapterRunner } from '@agentmark/vercel-ai-v4-adapter/runner';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const runnerPortArg = args.find(arg => arg.startsWith('--runner-port='));
const fileServerPortArg = args.find(arg => arg.startsWith('--file-server-port='));

const runnerPort = runnerPortArg ? parseInt(runnerPortArg.split('=')[1]) : 9417;
const fileServerPort = fileServerPortArg ? parseInt(fileServerPortArg.split('=')[1]) : 9418;

async function main() {
  const runner = new VercelAdapterRunner(client as any);
  const fileServerUrl = \`http://localhost:\${fileServerPort}\`;
  const templatesDirectory = path.join(process.cwd(), 'agentmark');

  await createRunnerServer({
    port: runnerPort,
    runner,
    fileServerUrl,
    templatesDirectory
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
`;
};
