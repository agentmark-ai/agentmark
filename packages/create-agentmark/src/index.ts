#!/usr/bin/env node

import { spawn } from 'child_process';

// Forward all arguments to @agentmark/cli init
// This allows: npm create agentmark [args] -> agentmark init [args]
const args = process.argv.slice(2);
const child = spawn('agentmark', ['init', ...args], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('Failed to run agentmark init:', error.message);
  process.exit(1);
});
