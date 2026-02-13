/**
 * Auto-link helper for dev command
 * Feature: 013-trace-tunnel
 *
 * Checks if user is logged in but not linked, and triggers interactive app selection.
 */

import {
  loadCredentials,
  isExpired,
} from './credentials';
import { refreshAccessToken } from './token-refresh';
import {
  loadForwardingConfig,
  saveForwardingConfig,
} from '../forwarding/config';
import prompts from 'prompts';
import os from 'os';

// Default platform URLs
const DEFAULT_PLATFORM_URL = 'https://app.agentmark.co';
const DEFAULT_SUPABASE_URL = 'https://glxktydhywvrgobkgezp.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseGt0eWRoeXd2cmdvYmtnZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQ5NTM1MTEsImV4cCI6MjA0MDUyOTUxMX0.jYF8gP8vKCOePdR9sTzUiQ8H5YU1jJYBx77HGAoKdUU';

interface App {
  id: string;
  name: string;
  tenant_id: string;
  tenant_name: string;
  created_at: string;
}

interface DevKeyResponse {
  key: string;
  key_id: string;
  app_id: string;
  app_name: string;
  tenant_id: string;
  base_url: string;
  expires_at: string;
  scope: string;
}

/**
 * Attempts to auto-link the current project during dev startup.
 * Returns true if linking succeeded, false otherwise.
 * Silently returns false if user is not logged in (don't interrupt dev startup).
 */
export async function attemptAutoLink(options: {
  platformUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
} = {}): Promise<boolean> {
  const platformUrl = options.platformUrl || DEFAULT_PLATFORM_URL;
  const supabaseUrl = options.supabaseUrl || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey = options.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY;

  // Check if already linked
  const existingConfig = loadForwardingConfig();
  if (existingConfig?.apiKey) {
    return true; // Already linked
  }

  // Check if user is logged in
  let credentials = loadCredentials();
  if (!credentials) {
    return false; // Not logged in - skip silently
  }

  // Check if token is expired and refresh if needed
  if (isExpired(credentials)) {
    const refreshed = await refreshAccessToken(
      credentials,
      supabaseUrl,
      supabaseAnonKey
    );
    if (!refreshed) {
      return false; // Refresh failed - skip silently
    }
    credentials = refreshed;
  }

  // Fetch apps from platform
  try {
    const appsUrl = `${platformUrl}/api/cli/apps`;
    const appsResponse = await fetch(appsUrl, {
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
      },
    });

    if (!appsResponse.ok) {
      return false; // Failed to fetch apps - skip silently
    }

    const appsData = (await appsResponse.json()) as { apps: App[] };
    const apps = appsData.apps;

    if (apps.length === 0) {
      console.log(
        '\n⚠️  No platform apps found. Create an app on the platform to enable trace forwarding.\n'
      );
      return false;
    }

    let selectedAppId: string;

    if (apps.length === 1) {
      // Auto-select the only app
      selectedAppId = apps[0].id;
      console.log(
        `\n✓ Auto-linked to "${apps[0].name}" (${apps[0].tenant_name}) - only app found`
      );
    } else {
      // Interactive picker
      console.log('\nNo platform app linked. Let\'s set that up!\n');
      const choices = apps.map((app) => ({
        title: `${app.name} (${app.tenant_name})`,
        value: app.id,
      }));

      const response = await prompts({
        type: 'select',
        name: 'appId',
        message: 'Select an app for trace forwarding:',
        choices,
      });

      if (!response.appId) {
        console.log('⚠️  No app selected. Continuing without trace forwarding.\n');
        return false;
      }

      selectedAppId = response.appId;
      const selectedApp = apps.find((a) => a.id === selectedAppId);
      if (selectedApp) {
        console.log(`✓ Linked to "${selectedApp.name}" (${selectedApp.tenant_name})`);
      }
    }

    // Create dev key
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
      console.log('⚠️  Failed to create dev API key. Continuing without trace forwarding.\n');
      return false;
    }

    const keyData = (await createKeyResponse.json()) as DevKeyResponse;

    // Save forwarding config
    saveForwardingConfig({
      appId: keyData.app_id,
      appName: keyData.app_name,
      tenantId: keyData.tenant_id,
      apiKey: keyData.key,
      apiKeyId: keyData.key_id,
      expiresAt: keyData.expires_at,
      baseUrl: keyData.base_url,
    });

    console.log('✓ Trace forwarding active\n');
    return true;
  } catch (error) {
    // Silently fail on any error - don't interrupt dev startup
    return false;
  }
}
