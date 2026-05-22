/**
 * Auto-link helper for dev command
 *
 * Checks if the user is logged in but the project isn't linked yet, and
 * triggers interactive app selection. Writes the project↔app binding to
 * `.agentmark/dev-config.json` (no API key minted — the trace forwarder
 * authenticates with the session bearer from `agentmark login`).
 */

import {
  loadCredentials,
  isExpired,
  saveCredentials,
} from './credentials';
import { refreshAccessToken } from './token-refresh';
import {
  loadForwardingConfig,
  saveForwardingConfig,
} from '../forwarding/config';
import { PlatformApp } from './types';
import {
  DEFAULT_PLATFORM_URL,
  DEFAULT_API_URL,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
} from './constants';
import prompts from 'prompts';

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

  // Check if already linked. "Linked" means we have an appId — the apiKey
  // field is no longer written by new links, but legacy configs that
  // still carry one are also fine.
  const existingConfig = loadForwardingConfig();
  if (existingConfig?.appId) {
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
    saveCredentials(refreshed);
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

    const appsData = (await appsResponse.json()) as { apps: PlatformApp[] };
    const apps = appsData.apps;

    if (apps.length === 0) {
      console.log(
        '\n⚠️  No platform apps found. Create an app on the platform to enable trace forwarding.\n'
      );
      return false;
    }

    let selectedApp: PlatformApp;

    if (apps.length === 1) {
      // Auto-select the only app
      selectedApp = apps[0];
      console.log(
        `\n✓ Auto-linked to "${selectedApp.name}" (${selectedApp.tenant_name}) - only app found`
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

      const picked = apps.find((a) => a.id === response.appId);
      if (!picked) {
        console.log('⚠️  Selected app could not be resolved. Continuing without trace forwarding.\n');
        return false;
      }
      selectedApp = picked;
      console.log(`✓ Linked to "${selectedApp.name}" (${selectedApp.tenant_name})`);
    }

    // Save forwarding config (binding only — no key mint).
    saveForwardingConfig({
      ...existingConfig,
      appId: selectedApp.id,
      appName: selectedApp.name,
      tenantId: selectedApp.tenant_id,
      orgName: selectedApp.tenant_name,
      baseUrl: existingConfig?.baseUrl || process.env.AGENTMARK_API_URL || DEFAULT_API_URL,
    });

    console.log('✓ Trace forwarding active\n');
    return true;
  } catch {
    // Silently fail on any error - don't interrupt dev startup
    return false;
  }
}
