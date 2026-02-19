/**
 * CLI Link Command
 * Feature: 013-trace-tunnel
 *
 * Implements `agentmark link` - links current project to a platform app for trace forwarding.
 *
 * Per cli-commands.md contract:
 * - Verify user is logged in
 * - Fetch user's apps from platform
 * - Display interactive picker (or auto-select if single app)
 * - Create dev API key for selected app
 * - Revoke old key if re-linking
 * - Save forwarding config to .agentmark/dev-config.json
 */

import {
  loadCredentials,
  isExpired,
} from '../auth/credentials';
import { refreshAccessToken } from '../auth/token-refresh';
import {
  loadForwardingConfig,
  saveForwardingConfig,
} from '../forwarding/config';
import { PlatformApp, DevKeyResponse } from '../auth/types';
import {
  DEFAULT_PLATFORM_URL,
  DEFAULT_API_URL,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
} from '../auth/constants';
import prompts from 'prompts';
import os from 'os';

export interface LinkOptions {
  appId?: string;
  baseUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

/**
 * Executes the link flow.
 */
export default async function link(options: LinkOptions = {}): Promise<void> {
  const platformUrl = options.baseUrl || DEFAULT_PLATFORM_URL;
  const supabaseUrl = options.supabaseUrl || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey = options.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY;

  // Step 1: Verify user is logged in
  let credentials = loadCredentials();
  if (!credentials) {
    console.log('✗ Not logged in. Run `agentmark login` first.');
    process.exit(1);
  }

  // Check if token is expired and refresh if needed
  if (isExpired(credentials)) {
    console.log('⚠️  Token expired, refreshing...');
    const refreshed = await refreshAccessToken(
      credentials,
      supabaseUrl,
      supabaseAnonKey
    );
    if (!refreshed) {
      console.log('✗ Token refresh failed. Run `agentmark login` again.');
      process.exit(1);
    }
    credentials = refreshed;
  }

  let selectedAppId: string;

  // Step 2: Determine which app to link
  if (options.appId) {
    selectedAppId = options.appId;
  } else {
    // Fetch apps from platform
    const appsUrl = `${platformUrl}/api/cli/apps`;
    const appsResponse = await fetch(appsUrl, {
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
      },
    });

    if (!appsResponse.ok) {
      console.log('✗ Failed to fetch apps from platform.');
      process.exit(1);
    }

    const appsData = (await appsResponse.json()) as { apps: PlatformApp[] };
    const apps = appsData.apps;

    if (apps.length === 0) {
      console.log('✗ No apps found. Create an app on the platform first.');
      process.exit(1);
    }

    if (apps.length === 1) {
      // Auto-select the only app
      selectedAppId = apps[0].id;
      console.log(
        `✓ Auto-linked to "${apps[0].name}" (${apps[0].tenant_name}) - only app found`
      );
    } else {
      // Interactive picker
      const choices = apps.map((app) => ({
        title: `${app.name} (${app.tenant_name})`,
        value: app.id,
      }));

      const response = await prompts({
        type: 'select',
        name: 'appId',
        message: 'Select an app to link:',
        choices,
      });

      if (!response.appId) {
        console.log('✗ No app selected.');
        process.exit(1);
      }

      selectedAppId = response.appId;
    }
  }

  // Step 3: Revoke old key if re-linking
  const existingConfig = loadForwardingConfig();
  if (existingConfig?.apiKeyId) {
    try {
      const revokeUrl = `${platformUrl}/api/cli/dev-key/${existingConfig.apiKeyId}`;
      const revokeResponse = await fetch(revokeUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${credentials.access_token}`,
        },
      });

      if (revokeResponse.ok || revokeResponse.status === 404) {
        console.log('✓ Previous dev API key revoked');
      }
    } catch {
      // Best effort - continue even if revocation fails
    }
  }

  // Step 4: Create new dev key
  const deviceName = `CLI - ${os.hostname()}`;
  const createKeyUrl = `${platformUrl}/api/cli/dev-key`;
  const createKeyResponse = await fetch(createKeyUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: selectedAppId,
      device_name: deviceName,
    }),
  });

  if (!createKeyResponse.ok) {
    const errorText = await createKeyResponse.text();
    console.log(`✗ Failed to create dev API key: ${errorText}`);
    process.exit(1);
  }

  const keyData = (await createKeyResponse.json()) as DevKeyResponse;

  // Step 5: Save forwarding config
  saveForwardingConfig({
    appId: keyData.app_id,
    appName: keyData.app_name,
    orgName: keyData.org_name ?? undefined,
    tenantId: keyData.tenant_id,
    apiKey: keyData.key,
    apiKeyId: keyData.key_id,
    expiresAt: keyData.expires_at,
    baseUrl: keyData.base_url || DEFAULT_API_URL,
  });

  console.log(
    `✓ Linked to "${keyData.app_name}". Traces will forward to this app.`
  );
}
