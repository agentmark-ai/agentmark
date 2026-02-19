/**
 * CLI Login Command
 * Feature: 013-trace-tunnel
 *
 * Implements `agentmark login` - authenticates the CLI with the platform using
 * browser-based OAuth with localhost token relay.
 *
 * Flow:
 * - Check existing auth (skip if valid)
 * - Start callback server on random port
 * - Open browser to platform /auth/cli
 * - Platform handles OAuth (Google/GitHub) via Supabase
 * - Platform redirects to localhost callback with session tokens
 * - Save credentials to ~/.agentmark/auth.json
 */

import { generateState } from '../auth/pkce';
import { startCallbackServer } from '../auth/callback-server';
import {
  loadCredentials,
  saveCredentials,
  isExpired,
} from '../auth/credentials';
import { refreshAccessToken } from '../auth/token-refresh';
import { CliAuthCredentials } from '../auth/types';
import {
  DEFAULT_PLATFORM_URL,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
} from '../auth/constants';

export interface LoginOptions {
  baseUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

/**
 * Executes the login flow.
 */
export default async function login(options: LoginOptions = {}): Promise<void> {
  const platformUrl = options.baseUrl || DEFAULT_PLATFORM_URL;
  const supabaseUrl = options.supabaseUrl || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey = options.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY;

  // Step 1: Check existing auth
  const existing = loadCredentials();
  if (existing) {
    if (!isExpired(existing)) {
      console.log(`✓ Already logged in as ${existing.email}`);
      return;
    }

    // Try to refresh expired token
    console.log('⚠️  Token expired, attempting refresh...');
    const refreshed = await refreshAccessToken(
      existing,
      supabaseUrl,
      supabaseAnonKey
    );
    if (refreshed) {
      console.log(`✓ Token refreshed. Logged in as ${refreshed.email}`);
      return;
    }

    console.log('⚠️  Refresh failed. Starting new login...');
  }

  try {
    // Step 2: Generate state for CSRF protection
    const state = generateState();

    // Step 3: Start callback server
    const { port, waitForCallback, close } = await startCallbackServer(state);

    // Step 4: Build auth URL
    const authUrl = new URL(`${platformUrl}/auth/cli`);
    authUrl.searchParams.set('redirect_port', port.toString());
    authUrl.searchParams.set('state', state);

    console.log('Opening browser to log in...\n');

    // Step 5: Open browser
    try {
      const open = (await import('open')).default;
      await open(authUrl.toString());
    } catch {
      console.log(`✗ Failed to open browser automatically.`);
      console.log(`\nVisit this URL manually:\n${authUrl.toString()}\n`);
    }

    // Step 6: Wait for callback with session tokens (30s timeout)
    const result = await waitForCallback();

    // Step 7: Save credentials
    const credentials: CliAuthCredentials = {
      user_id: result.user_id,
      email: result.email,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_at: result.expires_at,
      created_at: new Date().toISOString(),
    };

    saveCredentials(credentials);

    console.log(`\n✓ Logged in as ${credentials.email}`);

    close();
  } catch (error) {
    if ((error as Error).message.includes('timed out')) {
      console.log('\n✗ Login timed out. Please try again.');
      process.exit(1);
    }

    throw error;
  }
}
