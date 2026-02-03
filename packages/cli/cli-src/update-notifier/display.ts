/**
 * Display logic for update notifications.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { UpdateCheckResult } from './types';
import { PACKAGE_NAME } from './constants';

export interface PackageManagerInfo {
  name: 'npm' | 'yarn' | 'pnpm';
  command: string;
}

/**
 * Detects the package manager used in the project by checking for lock files.
 *
 * @param cwd - Directory to check for lock files (defaults to process.cwd())
 * @returns Package manager info with the appropriate upgrade command
 */
export function detectPackageManager(cwd: string = process.cwd()): PackageManagerInfo {
  // Check for yarn.lock first (yarn)
  if (existsSync(join(cwd, 'yarn.lock'))) {
    return {
      name: 'yarn',
      command: `yarn upgrade ${PACKAGE_NAME}`,
    };
  }

  // Check for pnpm-lock.yaml (pnpm)
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
    return {
      name: 'pnpm',
      command: `pnpm update ${PACKAGE_NAME}`,
    };
  }

  // Default to npm
  return {
    name: 'npm',
    command: `npm update ${PACKAGE_NAME}`,
  };
}

/**
 * Displays an update notification to stderr if an update is available.
 * Uses a boxed format with Unicode characters for visibility.
 * Adapts to terminal width to avoid rendering issues.
 *
 * @param result - The result of the update check
 * @param cwd - Directory to check for package manager (defaults to process.cwd())
 */
export function displayUpdateNotification(result: UpdateCheckResult, cwd?: string): void {
  if (result.status !== 'update-available') {
    return;
  }

  const { currentVersion, latestVersion } = result.info;
  const { command } = detectPackageManager(cwd);

  // Get terminal width, default to 80 if unavailable
  const terminalWidth = process.stderr.columns || 80;

  // Calculate box width based on content, but cap at terminal width - 2 for safety
  const versionLine = `   Update available! ${currentVersion} → ${latestVersion}`;
  const commandLine = `   Run: ${command}`;
  const maxContentWidth = Math.max(versionLine.length, commandLine.length);
  const maxBoxWidth = Math.min(terminalWidth - 2, maxContentWidth + 4);

  // If terminal is too narrow, use simple format without box
  if (maxBoxWidth < 40) {
    const simpleNotification = `\nUpdate available: ${currentVersion} → ${latestVersion}\nRun: ${command}\n`;
    process.stderr.write(simpleNotification);
    return;
  }

  const boxWidth = maxBoxWidth;

  // Truncate lines if needed
  const truncate = (str: string, width: number) => {
    if (str.length <= width) return str.padEnd(width);
    return str.slice(0, width - 3) + '...';
  };

  // Build the notification box
  const topBorder = '╭' + '─'.repeat(boxWidth) + '╮';
  const bottomBorder = '╰' + '─'.repeat(boxWidth) + '╯';
  const emptyLine = '│' + ' '.repeat(boxWidth) + '│';
  const versionLineFormatted = '│' + truncate(versionLine, boxWidth) + '│';
  const commandLineFormatted = '│' + truncate(commandLine, boxWidth) + '│';

  const notification = [
    '',
    topBorder,
    emptyLine,
    versionLineFormatted,
    commandLineFormatted,
    emptyLine,
    bottomBorder,
    '',
  ].join('\n');

  process.stderr.write(notification);
}
