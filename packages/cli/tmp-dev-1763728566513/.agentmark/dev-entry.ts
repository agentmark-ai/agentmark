// Auto-generated runner server entry point
// To customize, create a dev-server.ts file in your project root

import { createRunnerServer } from '@agentmark/cli/runner-server';
import { VercelAdapterRunner } from '@agentmark/ai-sdk-v4-adapter/runner';

async function main() {
  const { client } = await import('../agentmark.client.js');

  const args = process.argv.slice(2);
  const runnerPortArg = args.find(arg => arg.startsWith('--runner-port='));
  const runnerPort = runnerPortArg ? parseInt(runnerPortArg.split('=')[1]) : 9417;

  const runner = new VercelAdapterRunner(client as any);
  await createRunnerServer({ port: runnerPort, runner });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
