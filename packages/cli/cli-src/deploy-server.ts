#!/usr/bin/env node
/**
 * Standalone deployment server for AgentMark webhooks.
 * This runs the webhook server without the file server or dev tooling.
 * Designed for production deployments on Railway, Render, etc.
 */

import { createWebhookServer, type WebhookHandler } from './runner-server';

async function startDeploymentServer() {
  const port = parseInt(process.env.PORT || process.env.WEBHOOK_PORT || '9417', 10);

  // Webhook secret is required for production
  const webhookSecret = process.env.AGENTMARK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('❌ Error: AGENTMARK_WEBHOOK_SECRET environment variable is required');
    console.error('\nSet this in your deployment platform:');
    console.error('  Railway: Settings → Variables → Add Variable');
    console.error('  Render: Environment → Add Environment Variable');
    console.error('\nGenerate a secure secret with: openssl rand -hex 32');
    process.exit(1);
  }

  // Import the user's client configuration
  let handler: WebhookHandler;
  try {
    // In deployment, agentmark.client.ts should be in the workspace root
    const clientModule = await import(process.cwd() + '/agentmark.client.ts');
    // The client export is the agentmark client instance
    handler = clientModule.client;

    if (!handler) {
      throw new Error('No "client" export found in agentmark.client.ts');
    }
  } catch (error: any) {
    console.error('❌ Error: Could not load agentmark.client.ts');
    console.error('Make sure agentmark.client.ts exists in your project root');
    console.error('Error:', error.message);
    process.exit(1);
  }

  // Start the webhook server
  try {
    await createWebhookServer({
      port,
      handler,
      signatureVerification: {
        secret: webhookSecret
      }
    });

    console.log('\n' + '═'.repeat(60));
    console.log('🚀 AgentMark Webhook Server (Production Mode)');
    console.log('═'.repeat(60));
    console.log(`\n  Listening on port: ${port}`);
    console.log('  Signature verification: enabled');
    console.log('\n' + '═'.repeat(60));
    console.log('Server ready to receive webhook requests');
    console.log('═'.repeat(60) + '\n');
  } catch (error: any) {
    console.error('❌ Failed to start webhook server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nShutting down server...');
  process.exit(0);
});

startDeploymentServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
