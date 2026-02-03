/**
 * Version checking logic for the update notifier.
 */

import https from 'https';
import { readFileSync } from 'fs';
import { join } from 'path';
import { UpdateCheckResult, UpdateInfo } from './types';
import { NPM_REGISTRY_URL, REQUEST_TIMEOUT_MS, DISABLE_UPDATE_CHECK_ENV } from './constants';

/**
 * Compares two semver strings to determine if latest is newer than current.
 * Returns false for pre-release versions to avoid notifying users to "downgrade".
 */
export function isNewerVersion(current: string, latest: string): boolean {
  // Skip pre-release versions (e.g., "0.3.0-beta.1")
  if (latest.includes('-')) {
    return false;
  }

  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  if (currentParts.some(isNaN) || latestParts.some(isNaN)) {
    return false;
  }

  while (currentParts.length < 3) currentParts.push(0);
  while (latestParts.length < 3) latestParts.push(0);

  const [curMajor, curMinor, curPatch] = currentParts;
  const [latMajor, latMinor, latPatch] = latestParts;

  if (latMajor > curMajor) return true;
  if (latMajor === curMajor && latMinor > curMinor) return true;
  if (latMajor === curMajor && latMinor === curMinor && latPatch > curPatch) return true;

  return false;
}

/**
 * Gets the current installed version from package.json.
 */
export function getCurrentVersion(): string {
  try {
    const packageJsonPath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Checks if update notifications are disabled via environment variable.
 */
export function isUpdateCheckDisabled(): boolean {
  const value = process.env[DISABLE_UPDATE_CHECK_ENV];
  return value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false';
}

/**
 * Fetches the latest version from npm registry.
 */
export function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const request = https.get(NPM_REGISTRY_URL, { timeout: REQUEST_TIMEOUT_MS }, (response) => {
      if (response.statusCode !== 200) {
        resolve(null);
        return;
      }

      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          const latest = json.latest;
          if (typeof latest === 'string' && /^\d+\.\d+\.\d+/.test(latest)) {
            resolve(latest);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });

    request.on('error', () => resolve(null));
    request.on('timeout', () => {
      request.destroy();
      resolve(null);
    });
  });
}

/**
 * Starts an asynchronous update check.
 * Call early in CLI startup - the network request runs in parallel with command execution.
 */
export async function startUpdateCheck(): Promise<UpdateCheckResult> {
  try {
    if (isUpdateCheckDisabled()) {
      return { status: 'check-disabled' };
    }

    const currentVersion = getCurrentVersion();
    const latestVersion = await fetchLatestVersion();

    if (!latestVersion) {
      return { status: 'check-failed' };
    }

    const updateAvailable = isNewerVersion(currentVersion, latestVersion);
    const info: UpdateInfo = {
      currentVersion,
      latestVersion,
      updateAvailable,
    };

    return updateAvailable
      ? { status: 'update-available', info }
      : { status: 'up-to-date', info };
  } catch {
    return { status: 'check-failed' };
  }
}
