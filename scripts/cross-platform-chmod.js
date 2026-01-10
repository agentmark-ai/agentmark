#!/usr/bin/env node
/**
 * Cross-platform chmod helper
 *
 * On Unix: Sets file permissions using chmod
 * On Windows: No-op (Windows doesn't use Unix permissions)
 *
 * Usage: node scripts/cross-platform-chmod.js <mode> <file>
 * Example: node scripts/cross-platform-chmod.js 755 dist/index.js
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: cross-platform-chmod.js <mode> <file>');
  console.error('Example: cross-platform-chmod.js 755 dist/index.js');
  process.exit(1);
}

const mode = args[0];
const filePath = args[1];

// Skip chmod on Windows - not needed
if (process.platform === 'win32') {
  console.log(`[cross-platform-chmod] Skipping chmod on Windows: ${filePath}`);
  process.exit(0);
}

// On Unix, apply the permissions
try {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`[cross-platform-chmod] File not found: ${resolvedPath}`);
    process.exit(1);
  }

  // Convert string mode to octal (e.g., '755' -> 0o755)
  const octalMode = parseInt(mode, 8);
  fs.chmodSync(resolvedPath, octalMode);
  console.log(`[cross-platform-chmod] Set ${mode} on ${filePath}`);
} catch (error) {
  console.error(`[cross-platform-chmod] Error: ${error.message}`);
  process.exit(1);
}
