#!/usr/bin/env node
/**
 * Cross-platform Python virtual environment setup
 *
 * Creates a venv, ensures uv is available, and installs dependencies.
 * uv handles editable installs alongside PyPI deps correctly — pip's resolver
 * can hit "resolution-too-deep" when a local editable has different deps than
 * the PyPI-published version of the same package.
 *
 * Usage: node scripts/setup-python-venv.js [extra-pip-args...]
 * Example: node scripts/setup-python-venv.js -e '.[dev]'
 * Example: node scripts/setup-python-venv.js -e ../templatedx-python -e '.[dev]'
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const pythonCmd = isWindows ? 'python' : 'python3';
const venvDir = '.venv';
const pipPath = isWindows ? '.venv\\Scripts\\pip.exe' : '.venv/bin/pip';
const uvPath = isWindows ? '.venv\\Scripts\\uv.exe' : '.venv/bin/uv';
const pythonPath = isWindows ? '.venv\\Scripts\\python.exe' : '.venv/bin/python3';

// Get any extra pip install arguments
const extraArgs = process.argv.slice(2);

// Step 1: Create venv if it doesn't exist
if (!fs.existsSync(venvDir)) {
  console.log(`[setup-python-venv] Creating virtual environment with ${pythonCmd}...`);
  try {
    execFileSync(pythonCmd, ['-m', 'venv', venvDir], { stdio: 'inherit' });
  } catch (error) {
    console.error(`[setup-python-venv] Failed to create venv. Is Python installed?`);
    console.error(`[setup-python-venv] On Windows, use 'python'. On Unix, use 'python3'.`);
    process.exit(1);
  }
}

// Step 2: Ensure uv is available in the venv
function ensureUv() {
  // Check if uv is already in the venv
  if (fs.existsSync(uvPath)) {
    return true;
  }
  // Install uv into the venv via pip (~2s)
  console.log('[setup-python-venv] Installing uv into venv...');
  const result = spawnSync(pipPath, ['install', '-q', 'uv'], {
    stdio: 'inherit',
    shell: isWindows,
  });
  return result.status === 0;
}

// Step 3: Install dependencies via uv (preferred) or pip (fallback)
if (extraArgs.length > 0) {
  const hasUv = ensureUv();
  const installer = hasUv ? 'uv pip' : 'pip';

  console.log(`[setup-python-venv] Installing dependencies (${installer}): ${installer} install -q ${extraArgs.join(' ')}`);

  let result;
  if (hasUv) {
    result = spawnSync(uvPath, ['pip', 'install', '-q', '--python', pythonPath, ...extraArgs], {
      stdio: 'inherit',
      shell: isWindows,
    });
  } else {
    // Fallback to pip (may hit resolution-too-deep with conflicting editables)
    result = spawnSync(pipPath, ['install', '-q', ...extraArgs], {
      stdio: 'inherit',
      shell: isWindows,
    });
  }

  if (result.status !== 0) {
    console.error(`[setup-python-venv] ${installer} install failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log('[setup-python-venv] Setup complete!');
