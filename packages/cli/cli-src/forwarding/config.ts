/**
 * Forwarding configuration read/write.
 * Manages the `forwarding` section of the shared `.agentmark/dev-config.json` file.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadLocalConfig, LocalConfig } from '../config';

export type ForwardingConfig = NonNullable<LocalConfig['forwarding']>;

/**
 * Returns the path to the shared dev-config.json file.
 * Mirrors the logic in ../config.ts to ensure both modules
 * read/write the same file.
 */
function getConfigPath(): string {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return path.join(os.tmpdir(), '.agentmark-dev-config.json');
  }

  const cwd = process.cwd();
  return path.join(cwd, '.agentmark', 'dev-config.json');
}

/**
 * Writes the full config object back to the shared config file.
 */
function writeConfig(config: LocalConfig): void {
  const configPath = getConfigPath();

  try {
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving forwarding config:', error);
  }
}

/**
 * Loads the forwarding configuration from the shared dev-config.json.
 * Returns null if no forwarding config has been saved.
 */
export function loadForwardingConfig(): ForwardingConfig | null {
  const config = loadLocalConfig();
  return config.forwarding ?? null;
}

/**
 * Saves forwarding configuration into the shared dev-config.json.
 * Merges with the existing config so other fields are preserved.
 */
export function saveForwardingConfig(forwarding: ForwardingConfig): void {
  const config = loadLocalConfig();
  config.forwarding = forwarding;
  writeConfig(config);
}

/**
 * Removes the forwarding configuration from the shared dev-config.json.
 * Preserves all other config fields.
 */
export function clearForwardingConfig(): void {
  const config = loadLocalConfig();
  delete config.forwarding;
  writeConfig(config);
}

/**
 * Checks whether the API key in the forwarding config has expired.
 * Returns true if `expiresAt` is set and is in the past.
 * Returns false if `expiresAt` is not set (no expiration).
 */
export function isKeyExpired(config: ForwardingConfig): boolean {
  if (!config.expiresAt) {
    return false;
  }
  return new Date(config.expiresAt).getTime() < Date.now();
}
