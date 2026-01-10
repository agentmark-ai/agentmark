#!/usr/bin/env node
/**
 * Cross-platform Python virtual environment runner
 *
 * Automatically detects the platform and uses the correct venv path:
 * - Unix: .venv/bin/<command>
 * - Windows: .venv\Scripts\<command>
 *
 * Usage: node scripts/run-venv.js <command> [args...]
 * Example: node scripts/run-venv.js pip install -e .
 * Example: node scripts/run-venv.js pytest tests/
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);

if (args.length < 1) {
  console.error('Usage: run-venv.js <command> [args...]');
  console.error('Example: run-venv.js pip install -e .');
  console.error('Example: run-venv.js pytest tests/');
  process.exit(1);
}

const command = args[0];
const commandArgs = args.slice(1);

// Determine venv path based on platform
const isWindows = process.platform === 'win32';
const venvDir = isWindows ? '.venv\\Scripts' : '.venv/bin';
const execExtension = isWindows ? '.exe' : '';

// Build full path to executable
const execPath = path.join(venvDir, command + execExtension);

// Check if venv exists
if (!fs.existsSync('.venv')) {
  console.error('[run-venv] Virtual environment not found. Run: python -m venv .venv');
  process.exit(1);
}

// Check if command exists in venv
const fullExecPath = path.resolve(execPath);
if (!fs.existsSync(fullExecPath)) {
  // Try without extension on Windows (some tools don't have .exe)
  const altPath = path.join(venvDir, command);
  if (isWindows && fs.existsSync(path.resolve(altPath))) {
    // Use the path without extension
    runCommand(altPath, commandArgs);
    return;
  }
  console.error(`[run-venv] Command not found in venv: ${execPath}`);
  console.error(`[run-venv] Make sure the package is installed: ${venvDir}/pip install <package>`);
  process.exit(1);
}

runCommand(execPath, commandArgs);

function runCommand(cmd, cmdArgs) {
  console.log(`[run-venv] Running: ${cmd} ${cmdArgs.join(' ')}`);

  const child = spawn(cmd, cmdArgs, {
    stdio: 'inherit',
    shell: isWindows, // Use shell on Windows for better compatibility
    cwd: process.cwd()
  });

  child.on('error', (error) => {
    console.error(`[run-venv] Error: ${error.message}`);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}
