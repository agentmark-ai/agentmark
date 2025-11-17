// Dev server orchestration utility
// This combines the API server and runner server for local development

export interface DevServerOptions {
  runnerPort?: number;
  apiServerPort?: number;
  client: any; // AgentMark client from any adapter
  createRunnerServerFn: (options: { port: number; client: any }) => Promise<any>;
}

import { createApiServer } from './api-server';

export async function createDevServers(options: DevServerOptions) {
  const { runnerPort = 9417, apiServerPort = 9418, client, createRunnerServerFn } = options;

  // Start API server
  const apiServer = await createApiServer(apiServerPort);

  // Start runner server (adapter-specific)
  const runnerServer = await createRunnerServerFn({ port: runnerPort, client });

  console.log('\n' + '─'.repeat(60));
  console.log('AgentMark Development Servers Started');
  console.log('─'.repeat(60));
  console.log(`  API served on:    http://localhost:${apiServerPort}`);
  console.log(`  CLI served on:    http://localhost:${runnerPort}`);
  console.log('─'.repeat(60) + '\n');
  console.log('Ready! Use these CLI commands:');
  console.log('  $ agentmark run-prompt agentmark/<your-prompt>.prompt.mdx');
  console.log('  $ agentmark run-experiment agentmark/<your-prompt>.prompt.mdx');
  console.log('\nPress Ctrl+C to stop all servers\n');

  return { apiServer, runnerServer };
}
