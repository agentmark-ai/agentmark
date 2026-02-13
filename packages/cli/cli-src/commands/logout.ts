/**
 * CLI Logout Command
 * Feature: 013-trace-tunnel
 *
 * Implements `agentmark logout` - clears CLI authentication and revokes dev API keys.
 *
 * Per cli-commands.md contract:
 * - Load credentials from ~/.agentmark/auth.json
 * - Load forwarding config from .agentmark/dev-config.json
 * - Revoke dev API key via platform API
 * - Delete auth credentials file
 * - Clear forwarding config
 */

import {
  loadCredentials,
  clearCredentials,
} from '../auth/credentials';
import {
  loadForwardingConfig,
  clearForwardingConfig,
} from '../forwarding/config';

// Default platform URL
const DEFAULT_PLATFORM_URL = 'https://app.agentmark.co';

export interface LogoutOptions {
  baseUrl?: string;
}

/**
 * Executes the logout flow.
 */
export default async function logout(
  options: LogoutOptions = {}
): Promise<void> {
  const platformUrl = options.baseUrl || DEFAULT_PLATFORM_URL;

  // Step 1: Load credentials
  const credentials = loadCredentials();
  if (!credentials) {
    console.log('Not logged in.');
    return;
  }

  // Step 2: Load forwarding config
  const forwardingConfig = loadForwardingConfig();

  // Step 3: Revoke dev API key if it exists
  if (forwardingConfig?.apiKeyId) {
    try {
      const revokeUrl = `${platformUrl}/api/cli/dev-key/${forwardingConfig.apiKeyId}`;
      const response = await fetch(revokeUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${credentials.access_token}`,
        },
      });

      if (response.ok) {
        console.log('✓ Dev API key revoked');
      } else if (response.status === 404) {
        // Key already revoked or doesn't exist - that's fine
      } else {
        console.log('⚠️  Failed to revoke dev API key (continuing anyway)');
      }
    } catch (error) {
      console.log('⚠️  Failed to revoke dev API key (continuing anyway)');
    }
  }

  // Step 4: Clear credentials file
  clearCredentials();

  // Step 5: Clear forwarding config
  clearForwardingConfig();

  console.log('✓ Logged out. Dev API keys revoked.');
}
