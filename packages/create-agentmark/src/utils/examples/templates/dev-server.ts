export const getDevServerContent = () => {
  return `// dev-server.ts
// This file starts the AgentMark development servers
// Run with: npm run dev (or agentmark dev)

import { client } from './agentmark.config';
import { createRunnerServer } from '@agentmark/cli/runner-server';
import { VercelAdapterRunner } from '@agentmark/vercel-ai-v4-adapter/runner';

// Parse command line arguments
const args = process.argv.slice(2);
const runnerPortArg = args.find(arg => arg.startsWith('--runner-port='));

const runnerPort = runnerPortArg ? parseInt(runnerPortArg.split('=')[1]) : 9417;

async function main() {
  const runner = new VercelAdapterRunner(client as any);
  await createRunnerServer({ port: runnerPort, runner });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
`;
};
