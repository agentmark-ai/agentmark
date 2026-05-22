/**
 * CLI Link Command
 *
 * Binds the current project to an AgentMark Cloud app. Writes the binding
 * (appId, appName, tenantId, tenantName, baseUrl) to
 * `.agentmark/dev-config.json`. **No API key is minted here** — the trace
 * forwarder authenticates with the user's session bearer from
 * `~/.agentmark/auth.json` (written by `agentmark login`), matching the
 * pattern used by wrangler, vercel, gh, supabase, and aws.
 *
 * Per cli-commands.md contract:
 * - Verify user is logged in
 * - Fetch user's apps from platform
 * - Display interactive picker (or auto-select if single app)
 * - Save forwarding config to .agentmark/dev-config.json
 */

import {
  loadCredentials,
  isExpired,
  saveCredentials,
} from '../auth/credentials';
import { refreshAccessToken } from '../auth/token-refresh';
import {
  loadForwardingConfig,
  saveForwardingConfig,
} from '../forwarding/config';
import { PlatformApp } from '../auth/types';
import {
  DEFAULT_PLATFORM_URL,
  DEFAULT_API_URL,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
} from '../auth/constants';
import prompts from 'prompts';

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
    // Persist the refreshed credentials so subsequent CLI calls don't pay
    // the refresh round-trip again.
    saveCredentials(refreshed);
    credentials = refreshed;
  }

  let selectedApp: PlatformApp | undefined;

  // Step 2: Determine which app to link.
  // We always fetch the apps list (even when --app-id is provided) so the
  // saved config has a friendly display name + tenant context. With no key
  // mint to do, the round-trip cost is the only API call this command makes.
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

  if (options.appId) {
    selectedApp = apps.find((app) => app.id === options.appId);
    if (!selectedApp) {
      console.log(`✗ App "${options.appId}" not found on the platform.`);
      process.exit(1);
    }
  } else if (apps.length === 1) {
    // Auto-select the only app
    selectedApp = apps[0];
    console.log(
      `✓ Auto-linked to "${selectedApp.name}" (${selectedApp.tenant_name}) - only app found`
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

    selectedApp = apps.find((app) => app.id === response.appId);
    if (!selectedApp) {
      console.log('✗ Selected app could not be resolved.');
      process.exit(1);
    }
  }

  // Step 3: Save forwarding config.
  // Preserves any legacy `apiKey` / `apiKeyId` / `expiresAt` from a prior
  // link (older CLI versions wrote them). The forwarder prefers the
  // session bearer over the legacy key anyway, so leaving stale fields in
  // place is harmless and avoids surprising users who downgrade.
  const existing = loadForwardingConfig() ?? {};
  saveForwardingConfig({
    ...existing,
    appId: selectedApp.id,
    appName: selectedApp.name,
    tenantId: selectedApp.tenant_id,
    orgName: selectedApp.tenant_name,
    baseUrl: existing.baseUrl || process.env.AGENTMARK_API_URL || DEFAULT_API_URL,
  });

  console.log(
    `✓ Linked to "${selectedApp.name}". Traces will forward to this app using your login session.`
  );
}
