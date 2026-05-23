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
import { getPlatformUrl } from '../auth/constants';

export interface LogoutOptions {
  baseUrl?: string;
  /**
   * Emit a single line of JSON on success instead of human text.
   * Shape: `{ logged_out: true, was_logged_in: boolean, revoked_dev_key: boolean }`.
   */
  json?: boolean;
}

/**
 * Executes the logout flow.
 */
export default async function logout(
  options: LogoutOptions = {}
): Promise<void> {
  const platformUrl = getPlatformUrl(options.baseUrl);
  const json = options.json === true;

  // Step 1: Load credentials
  const credentials = loadCredentials();
  if (!credentials) {
    if (json) {
      console.log(
        JSON.stringify({ logged_out: true, was_logged_in: false, revoked_dev_key: false }),
      );
    } else {
      console.log('Not logged in.');
    }
    return;
  }

  // Step 2: Load forwarding config
  const forwardingConfig = loadForwardingConfig();

  // Step 3: Revoke dev API key if it exists (legacy configs only;
  // current `link` no longer mints these).
  let revokedDevKey = false;
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
        revokedDevKey = true;
        if (!json) console.log('✓ Dev API key revoked');
      } else if (response.status === 404) {
        // Key already revoked or doesn't exist - that's fine
      } else {
        if (!json) console.log('⚠️  Failed to revoke dev API key (continuing anyway)');
      }
    } catch {
      if (!json) console.log('⚠️  Failed to revoke dev API key (continuing anyway)');
    }
  }

  // Step 4: Clear credentials file
  clearCredentials();

  // Step 5: Clear forwarding config
  clearForwardingConfig();

  if (json) {
    console.log(
      JSON.stringify({ logged_out: true, was_logged_in: true, revoked_dev_key: revokedDevKey }),
    );
  } else {
    console.log('✓ Logged out.');
  }
}
