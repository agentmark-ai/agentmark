// Dev server orchestration utility
// This combines the file server and webhook server for local development

export interface DevServerOptions {
  webhookPort?: number;
  fileServerPort?: number;
  client: any; // AgentMark client from any adapter
  createWebhookServerFn: (options: { port: number; client: any }) => Promise<any>;
}

import { createFileServer } from './file-server';

export async function createDevServers(options: DevServerOptions) {
  const { webhookPort = 9417, fileServerPort = 9418, client, createWebhookServerFn } = options;

  // Start file server
  const fileServer = await createFileServer(fileServerPort);

  // Start webhook server (adapter-specific)
  const webhookServer = await createWebhookServerFn({ port: webhookPort, client });

  console.log('\n' + '─'.repeat(60));
  console.log('AgentMark Development Servers Started');
  console.log('─'.repeat(60));
  console.log(`  Files served on:  http://localhost:${fileServerPort}`);
  console.log(`  Webhook served on: http://localhost:${webhookPort}`);
  console.log('─'.repeat(60) + '\n');
  console.log('Ready! Use these CLI commands:');
  console.log('  $ agentmark run-prompt agentmark/<your-prompt>.prompt.mdx');
  console.log('  $ agentmark run-experiment agentmark/<your-prompt>.prompt.mdx');
  console.log('\nPress Ctrl+C to stop all servers\n');

  return { fileServer, webhookServer };
}
