/**
 * Local development configuration management.
 * Stores persistent settings like forwarding preferences and app port.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Configuration constants
const CONFIG_EXPIRATION_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface LocalConfig {
  createdAt?: string;
  appPort?: number;
  forwarding?: {
    appId?: string;
    appName?: string;
    orgName?: string;
    tenantId?: string;
    apiKey?: string;
    apiKeyId?: string;
    expiresAt?: string;
    baseUrl?: string;
  };
}

// Cache for loaded config to avoid repeated file I/O
let cachedConfig: LocalConfig | null = null;
let cachedConfigPath: string | null = null;

/**
 * Walk up from startDir looking for a directory that contains agentmark.json.
 * Returns that directory (the project root), or startDir if not found.
 */
export function findProjectRoot(startDir: string): string {
  let current = path.resolve(startDir);
  const fsRoot = path.parse(current).root;

  while (true) {
    if (fs.existsSync(path.join(current, 'agentmark.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current || current === fsRoot) {
      return startDir;
    }
    current = parent;
  }
}

function getConfigPath(): string {
  // Use temp directory during tests to avoid polluting the project
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    const tmpDir = os.tmpdir();
    return path.join(tmpDir, `.agentmark-dev-config-${process.pid}.json`);
  }

  // Use .agentmark directory in project root for config
  try {
    const projectRoot = findProjectRoot(process.cwd());
    const configDir = path.join(projectRoot, '.agentmark');

    // Create .agentmark directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Ensure .gitignore exists and includes dev-config.json
    ensureGitignoreEntry(projectRoot);

    return path.join(configDir, 'dev-config.json');
  } catch {
    // Fallback to temp directory if can't write to project
    const tmpDir = os.tmpdir();
    return path.join(tmpDir, '.agentmark-dev-config.json');
  }
}

/**
 * Ensures .gitignore contains .agentmark/dev-config.json
 */
function ensureGitignoreEntry(projectRoot: string): void {
  try {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const entry = '.agentmark/dev-config.json';

    let gitignoreContent = '';
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    }

    // Check if entry already exists
    if (!gitignoreContent.includes(entry)) {
      // Add entry with a comment
      const newContent = gitignoreContent +
        (gitignoreContent.endsWith('\n') ? '' : '\n') +
        '\n# AgentMark local development config\n' +
        entry + '\n';

      fs.writeFileSync(gitignorePath, newContent, 'utf-8');
    }
  } catch {
    // Silently fail - not critical
  }
}

/**
 * Loads the local development configuration.
 * Creates a new config if none exists.
 * Results are cached to avoid repeated file I/O.
 */
export function loadLocalConfig(): LocalConfig {
  const configPath = getConfigPath();

  // Return cached config if path hasn't changed
  if (cachedConfig && cachedConfigPath === configPath) {
    return cachedConfig;
  }

  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data) as LocalConfig;

      // Check if config is older than expiration period
      if (config.createdAt) {
        const createdDate = new Date(config.createdAt);
        const daysSinceCreation = (Date.now() - createdDate.getTime()) / MS_PER_DAY;

        if (daysSinceCreation > CONFIG_EXPIRATION_DAYS) {
          console.log(`⚠️  Local config is older than ${CONFIG_EXPIRATION_DAYS} days, regenerating...`);
          const newConfig = createNewConfig();
          cachedConfig = newConfig;
          cachedConfigPath = configPath;
          return newConfig;
        }
      }

      cachedConfig = config;
      cachedConfigPath = configPath;
      return config;
    }
  } catch (error) {
    console.error('Error reading local config:', error);
  }

  const newConfig = createNewConfig();
  cachedConfig = newConfig;
  cachedConfigPath = configPath;
  return newConfig;
}

/**
 * Creates a new configuration
 */
function createNewConfig(): LocalConfig {
  const config: LocalConfig = {
    createdAt: new Date().toISOString(),
  };

  saveLocalConfig(config);
  return config;
}

/**
 * Saves the configuration to disk
 */
function saveLocalConfig(config: LocalConfig): void {
  const configPath = getConfigPath();

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving local config:', error);
  }
}

/**
 * Updates the app port in the config (called when dev server starts)
 */
export function setAppPort(port: number): void {
  const config = loadLocalConfig();
  config.appPort = port;
  saveLocalConfig(config);
  // Update cache
  cachedConfig = config;
}

/**
 * Gets the current app port from config (defaults to 3000)
 */
export function getAppPort(): number {
  const config = loadLocalConfig();
  return config.appPort ?? 3000;
}
