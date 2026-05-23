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
  getPlatformUrl,
  getApiUrl,
  getSupabaseUrl,
  getSupabaseAnonKey,
} from './constants';
import prompts from 'prompts';

/**
 * Attempts to auto-link the current project during dev startup.
 * Returns true if linking succeeded, false otherwise.
 * Silently returns false if user is not logged in (don't interrupt dev startup).
 *
 * If `AGENTMARK_APP_ID` env var is set, that app id is used directly —
 * the interactive picker is skipped. Useful for CI / scripted onboarding.
 */
export async function attemptAutoLink(options: {
  platformUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
} = {}): Promise<boolean> {
  const platformUrl = getPlatformUrl(options.platformUrl);
  const supabaseUrl = getSupabaseUrl(options.supabaseUrl);
  const supabaseAnonKey = getSupabaseAnonKey(options.supabaseAnonKey);

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

    // `AGENTMARK_APP_ID` env var fast-path — skips the picker entirely.
    // Used by CI / scripted onboarding that already knows which app to
    // link to. Resolves against the fetched list so display name +
    // tenant context still populate dev-config.json (and so we fail
    // loudly if the env points at an app the user can't see).
    const envAppId = process.env.AGENTMARK_APP_ID;
    if (envAppId) {
      const matched = apps.find((a) => a.id === envAppId);
      if (!matched) {
        console.log(
          `⚠️  AGENTMARK_APP_ID="${envAppId}" not found among your apps. Continuing without trace forwarding.\n`,
        );
        return false;
      }
      selectedApp = matched;
      console.log(
        `\n✓ Auto-linked to "${selectedApp.name}" (${selectedApp.tenant_name}) via AGENTMARK_APP_ID`,
      );
    } else if (apps.length === 1) {
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
      baseUrl: existingConfig?.baseUrl || getApiUrl(),
    });

    console.log('✓ Trace forwarding active\n');
    return true;
  } catch {
    // Silently fail on any error - don't interrupt dev startup
    return false;
  }
}
