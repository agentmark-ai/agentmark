#!/usr/bin/env node
/**
 * Cross-platform Python virtual environment setup
 *
 * Creates a venv and installs dependencies using the correct platform paths.
 *
 * Usage: node scripts/setup-python-venv.js [extra-pip-args...]
 * Example: node scripts/setup-python-venv.js -e '.[dev]'
 * Example: node scripts/setup-python-venv.js -e ../templatedx-python -e '.[dev]'
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWindows = process.platform === 'win32';
const pythonCmd = isWindows ? 'python' : 'python3';
const venvDir = '.venv';
const pipPath = isWindows ? '.venv\\Scripts\\pip.exe' : '.venv/bin/pip';

// Get any extra pip install arguments
const extraArgs = process.argv.slice(2);

// Step 1: Create venv if it doesn't exist
if (!fs.existsSync(venvDir)) {
  console.log(`[setup-python-venv] Creating virtual environment with ${pythonCmd}...`);
  try {
    execSync(`${pythonCmd} -m venv ${venvDir}`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`[setup-python-venv] Failed to create venv. Is Python installed?`);
    console.error(`[setup-python-venv] On Windows, use 'python'. On Unix, use 'python3'.`);
    process.exit(1);
  }
}

// Step 2: Install dependencies via pip
if (extraArgs.length > 0) {
  console.log(`[setup-python-venv] Installing dependencies: pip install -q ${extraArgs.join(' ')}`);

  // Build the command with proper quoting
  const pipArgs = ['install', '-q', ...extraArgs];

  const result = spawnSync(pipPath, pipArgs, {
    stdio: 'inherit',
    shell: isWindows // Use shell on Windows for better compatibility
  });

  if (result.status !== 0) {
    console.error(`[setup-python-venv] pip install failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log('[setup-python-venv] Setup complete!');
