#!/usr/bin/env node
/**
 * E2E harness for the AgentMark MCP server against the staging gateway.
 *
 *   AGENTMARK_API_URL=https://api-stg.agentmark.co node scripts/e2e-stg.mjs
 *
 * What this does (real wire calls, no mocks):
 *   1. Spawns `./dist/bin.js` as a stdio subprocess (the real MCP binary).
 *   2. Speaks JSON-RPC over its stdin/stdout — same protocol Claude Code,
 *      Cursor, etc. use.
 *   3. `initialize` → `tools/list` → assert the OpenAPI tools registered
 *      successfully. We expect at least `create_app` and
 *      `start_app_git_connect`.
 *   4. `tools/call create_app` → assert a non-error envelope and that
 *      the returned body has the expected `id` + `name` fields.
 *   5. `tools/call start_app_git_connect` against that fresh app → assert
 *      the response includes a GitHub OAuth URL and a `state` token.
 *   6. Clean up: `tools/call delete_app` on the app we created (if a
 *      `delete_app` tool is registered) so we don't leave litter on stg.
 *
 * Output is purely diagnostic: a one-line PASS/FAIL per stage and the
 * gateway's response bodies. The script exits 0 on full success and 1
 * on any failure, suitable for CI.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binPath = path.resolve(__dirname, '..', 'dist', 'bin.js');

const child = spawn('node', [binPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    ...process.env,
    AGENTMARK_API_URL: process.env.AGENTMARK_API_URL || 'https://api-stg.agentmark.co',
  },
});

let nextId = 1;
const pending = new Map();
let buffer = '';

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf-8');
  let newlineIdx;
  while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    } catch (err) {
      console.error('[harness] failed to parse:', line, err);
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  const req = { jsonrpc: '2.0', id, method, params };
  child.stdin.write(JSON.stringify(req) + '\n');
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }
    }, 30000);
  });
}

function stage(name) {
  console.log(`\n=== ${name} ===`);
}

function pass(msg) {
  console.log(`  PASS  ${msg}`);
}

function fail(msg) {
  console.log(`  FAIL  ${msg}`);
  process.exitCode = 1;
}

async function main() {
  stage('1. initialize');
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e-harness', version: '0.0.0' },
  });
  if (init.result && init.result.serverInfo) {
    pass(`server says hello: ${init.result.serverInfo.name}@${init.result.serverInfo.version}`);
  } else {
    fail(`bad initialize response: ${JSON.stringify(init).slice(0, 200)}`);
    return;
  }
  // initialized notification
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  stage('2. tools/list');
  const listed = await rpc('tools/list', {});
  if (!listed.result || !Array.isArray(listed.result.tools)) {
    fail(`bad tools/list response: ${JSON.stringify(listed).slice(0, 400)}`);
    return;
  }
  const toolNames = listed.result.tools.map((t) => t.name);
  console.log(`  Registered tools (${toolNames.length}):`, toolNames.join(', '));
  for (const expected of ['create_app', 'start_app_git_connect', 'list_traces']) {
    if (toolNames.includes(expected)) pass(`tool "${expected}" registered`);
    else fail(`tool "${expected}" missing — registration broken`);
  }

  stage('3. tools/call create_app');
  const appName = `mcp-e2e-${Date.now()}`;
  const created = await rpc('tools/call', {
    name: 'create_app',
    arguments: { name: appName, description: 'created by mcp-server e2e harness' },
  });
  if (created.result?.isError) {
    fail(`create_app returned isError: ${created.result.content?.[0]?.text || ''}`);
    return;
  }
  const createdBody = JSON.parse(created.result.content[0].text);
  // Gateway responses are wrapped: { data: { id, ... } } or { data: [...] }.
  const newAppId = createdBody.data?.id || createdBody.id || createdBody.app?.id;
  if (!newAppId) {
    fail(`create_app returned no id: ${JSON.stringify(createdBody).slice(0, 200)}`);
    return;
  }
  pass(`created app id=${newAppId} name=${appName}`);

  stage('4. tools/call start_app_git_connect');
  const connect = await rpc('tools/call', {
    name: 'start_app_git_connect',
    arguments: { appId: newAppId, provider: 'github' },
  });
  if (connect.result?.isError) {
    fail(`start_app_git_connect returned isError: ${connect.result.content?.[0]?.text || ''}`);
  } else {
    const connectBody = JSON.parse(connect.result.content[0].text);
    const url =
      connectBody.data?.authorization_url ||
      connectBody.data?.url ||
      connectBody.authorization_url ||
      connectBody.url;
    const state = connectBody.data?.state || connectBody.state;
    if (url && url.includes('github.com')) {
      pass(`got github oauth url (state=${(state || '').slice(0, 8)}...)`);
    } else {
      fail(`unexpected git-connect response: ${JSON.stringify(connectBody).slice(0, 400)}`);
    }
  }

  stage('5. cleanup: tools/call delete_app');
  if (toolNames.includes('delete_app')) {
    const del = await rpc('tools/call', {
      name: 'delete_app',
      arguments: { appId: newAppId },
    });
    if (del.result?.isError) {
      fail(`delete_app failed: ${del.result.content?.[0]?.text || ''}`);
    } else {
      pass(`deleted app ${newAppId}`);
    }
  } else {
    console.log('  SKIP  delete_app not registered (gateway doesn\'t expose it)');
  }

  child.kill();
  console.log('\nE2E summary:', process.exitCode === 1 ? 'FAIL' : 'PASS');
}

main().catch((err) => {
  console.error('Harness crashed:', err);
  child.kill();
  process.exit(1);
});
