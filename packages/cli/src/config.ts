/**
 * Local development configuration management.
 * Stores persistent settings like webhook secrets and tunnel preferences.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface LocalConfig {
  webhookSecret?: string;
  tunnelSubdomain?: string;
  createdAt?: string;
}

function getConfigPath(): string {
  // Use .agentmark directory in project root for config
  try {
    const cwd = process.cwd();
    const configDir = path.join(cwd, '.agentmark');

    // Create .agentmark directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Ensure .gitignore exists and includes dev-config.json
    ensureGitignoreEntry(cwd);

    return path.join(configDir, 'dev-config.json');
  } catch {
    // Fallback to temp directory if can't write to project
    const tmpDir = process.env.TMPDIR || '/tmp';
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
        '\n# AgentMark local development config (contains webhook secrets)\n' +
        entry + '\n';

      fs.writeFileSync(gitignorePath, newContent, 'utf-8');
    }
  } catch (error) {
    // Silently fail - not critical
  }
}

/**
 * Generates a secure random webhook secret
 */
function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates a random subdomain for tunneling
 */
function generateSubdomain(): string {
  // Use a memorable format: agentmark-{random}
  const randomPart = crypto.randomBytes(4).toString('hex');
  return `agentmark-${randomPart}`;
}

/**
 * Loads the local development configuration.
 * Creates a new config with generated secrets if none exists.
 */
export function loadLocalConfig(): LocalConfig {
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data) as LocalConfig;

      // Check if config is older than 30 days
      if (config.createdAt) {
        const createdDate = new Date(config.createdAt);
        const daysSinceCreation = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceCreation > 30) {
          console.log('⚠️  Local config is older than 30 days, regenerating...');
          return createNewConfig();
        }
      }

      return config;
    }
  } catch (error) {
    console.error('Error reading local config:', error);
  }

  return createNewConfig();
}

/**
 * Creates a new configuration with generated secrets
 */
function createNewConfig(): LocalConfig {
  const config: LocalConfig = {
    webhookSecret: generateWebhookSecret(),
    tunnelSubdomain: generateSubdomain(),
    createdAt: new Date().toISOString(),
  };

  saveLocalConfig(config);
  return config;
}

/**
 * Saves the configuration to disk
 */
export function saveLocalConfig(config: LocalConfig): void {
  const configPath = getConfigPath();

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving local config:', error);
  }
}

/**
 * Gets the webhook secret, using local config or env var
 */
export function getWebhookSecret(): string {
  // First check if user has set their own secret
  if (process.env.AGENTMARK_WEBHOOK_SECRET) {
    return process.env.AGENTMARK_WEBHOOK_SECRET;
  }

  // Otherwise use the locally generated one
  const config = loadLocalConfig();
  return config.webhookSecret!;
}

/**
 * Gets the tunnel subdomain preference
 */
export function getTunnelSubdomain(): string | undefined {
  const config = loadLocalConfig();
  return config.tunnelSubdomain;
}

/**
 * Display configuration info to the user
 */
export function displayConfigInfo(config: LocalConfig): void {
  const configPath = getConfigPath();
  const daysRemaining = config.createdAt
    ? Math.ceil(30 - (Date.now() - new Date(config.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 30;

  console.log('\n' + '═'.repeat(70));
  console.log('🔐 Local Development Security');
  console.log('═'.repeat(70));
  console.log(`\n  Webhook Secret: ${config.webhookSecret}`);
  console.log(`  Config Location: ${configPath}`);
  console.log(`  Valid for: ${daysRemaining} more days`);
  console.log('\n  This secret is automatically used for webhook signature verification.');
  console.log('  It\'s stored locally and regenerates every 30 days for security.');

  if (!process.env.AGENTMARK_WEBHOOK_SECRET) {
    console.log('\n  💡 To use a custom secret, set: AGENTMARK_WEBHOOK_SECRET=your-secret');
  }

  console.log('═'.repeat(70) + '\n');
}
