/**
 * Package manager utilities for detecting and using the correct package manager.
 */

import fs from 'fs-extra';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import {
  type PackageManager,
  type PackageManagerConfig,
  PACKAGE_MANAGERS,
  DEFAULT_PACKAGE_MANAGER,
} from './types.js';

/**
 * Detect the package manager in use by checking for lock files.
 * Priority order: yarn > pnpm > bun > npm.
 */
export function detectPackageManager(targetPath: string): PackageManagerConfig {
  // Check lock files in priority order
  const lockFiles = ['yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'package-lock.json'];

  for (const lockFile of lockFiles) {
    if (fs.existsSync(path.join(targetPath, lockFile))) {
      const config = PACKAGE_MANAGERS[lockFile];
      if (config) {
        return config;
      }
    }
  }

  // Default to npm if no lock file found
  return DEFAULT_PACKAGE_MANAGER;
}

/**
 * Get the package manager configuration by name.
 */
export function getPackageManagerConfig(name: PackageManager): PackageManagerConfig {
  const configs = Object.values(PACKAGE_MANAGERS);
  const config = configs.find((c) => c.name === name);
  return config || DEFAULT_PACKAGE_MANAGER;
}

/**
 * Install dependencies using the detected package manager.
 */
export function installDependencies(
  targetPath: string,
  packageManager: PackageManagerConfig
): void {
  console.log(`Installing dependencies with ${packageManager.name}...`);

  try {
    execSync(packageManager.installCmd, {
      stdio: 'inherit',
      cwd: targetPath,
    });
    console.log('Dependencies installed successfully!');
  } catch (error) {
    console.error(`Error installing dependencies with ${packageManager.name}:`, error);
    throw new Error(
      `Failed to install dependencies. Please run "${packageManager.installCmd}" manually.`
    );
  }
}

/**
 * Add production dependencies using the detected package manager.
 */
export function addDependencies(
  targetPath: string,
  packageManager: PackageManagerConfig,
  packages: string[]
): void {
  if (packages.length === 0) return;

  console.log(`Adding dependencies with ${packageManager.name}...`);

  try {
    // Build the command arguments
    const cmdParts = packageManager.addCmd.split(' ');
    const cmd = cmdParts[0]!;
    const args = [...cmdParts.slice(1), ...packages];

    execFileSync(cmd, args, {
      stdio: 'inherit',
      cwd: targetPath,
    });
  } catch (error) {
    console.error(`Error adding dependencies:`, error);
    throw new Error(
      `Failed to add dependencies. Please run "${packageManager.addCmd} ${packages.join(' ')}" manually.`
    );
  }
}

/**
 * Add dev dependencies using the detected package manager.
 */
export function addDevDependencies(
  targetPath: string,
  packageManager: PackageManagerConfig,
  packages: string[]
): void {
  if (packages.length === 0) return;

  console.log(`Adding dev dependencies with ${packageManager.name}...`);

  try {
    // Build the command arguments
    const cmdParts = packageManager.addDevCmd.split(' ');
    const cmd = cmdParts[0]!;
    const args = [...cmdParts.slice(1), ...packages];

    execFileSync(cmd, args, {
      stdio: 'inherit',
      cwd: targetPath,
    });
  } catch (error) {
    console.error(`Error adding dev dependencies:`, error);
    throw new Error(
      `Failed to add dev dependencies. Please run "${packageManager.addDevCmd} ${packages.join(' ')}" manually.`
    );
  }
}

/**
 * Get the run script command for a package manager.
 * e.g., "npm run dev" or "yarn dev" or "pnpm dev"
 */
export function getRunScriptCmd(
  packageManager: PackageManagerConfig,
  script: string
): string {
  switch (packageManager.name) {
    case 'npm':
      return `npm run ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    case 'pnpm':
      return `pnpm ${script}`;
    case 'bun':
      return `bun run ${script}`;
    default:
      return `npm run ${script}`;
  }
}
