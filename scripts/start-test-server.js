#!/usr/bin/env node
/**
 * Starts the API server for integration tests and waits for it to be ready.
 * Cross-platform script that works on both Windows and Unix.
 *
 * Usage:
 *   node scripts/start-test-server.js [port]
 *
 * Default port: 9419
 */

const { spawn } = require('child_process');
const path = require('path');

const port = process.argv[2] || '9419';
const url = `http://localhost:${port}/v1/traces`;
const maxAttempts = 30;
const retryDelay = 1000;

async function checkServer() {
  try {
    const response = await fetch(url);
    return response.ok || response.status === 404; // Server is up if we get any response
  } catch {
    return false;
  }
}

async function waitForServer() {
  for (let i = 1; i <= maxAttempts; i++) {
    if (await checkServer()) {
      console.log('API server is ready');
      return true;
    }
    console.log(`Waiting for API server... (${i}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
  return false;
}

async function main() {
  console.log(`Starting API server on port ${port}...`);

  // Path to the API server module (from repo root /scripts/ folder)
  const serverPath = path.resolve(__dirname, '../packages/cli/dist/api-server.js');

  // Start server as detached process
  const serverCode = `require('${serverPath.replace(/\\/g, '\\\\')}').createApiServer(${port}).then(() => console.log('API server started'))`;

  const child = spawn('node', ['-e', serverCode], {
    detached: true,
    stdio: 'inherit',
    shell: false
  });

  // Unref to allow parent to exit independently
  child.unref();

  // Wait for server to be ready
  const isReady = await waitForServer();

  if (!isReady) {
    console.error(`ERROR: API server failed to start within ${maxAttempts} seconds`);
    process.exit(1);
  }
}

main();
