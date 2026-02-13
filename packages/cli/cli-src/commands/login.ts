/**
 * CLI Login Command
 * Feature: 013-trace-tunnel
 *
 * Implements `agentmark login` - authenticates the CLI with the platform using
 * browser-based PKCE OAuth flow.
 *
 * Per cli-commands.md contract:
 * - Check existing auth (skip if valid)
 * - Start callback server on random port
 * - Generate PKCE challenge
 * - Open browser to platform /auth/cli
 * - Wait for callback with auth code
 * - Exchange code for Supabase tokens
 * - Save credentials to ~/.agentmark/auth.json
 */

import { generatePKCE, generateState } from '../auth/pkce';
import { startCallbackServer } from '../auth/callback-server';
import {
  loadCredentials,
  saveCredentials,
  isExpired,
} from '../auth/credentials';
import { refreshAccessToken } from '../auth/token-refresh';
import { CliAuthCredentials } from '../auth/types';
import open from 'open';

// Default platform URLs
const DEFAULT_PLATFORM_URL = 'https://app.agentmark.co';
const DEFAULT_SUPABASE_URL = 'https://glxktydhywvrgobkgezp.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseGt0eWRoeXd2cmdvYmtnZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjQ5NTM1MTEsImV4cCI6MjA0MDUyOTUxMX0.jYF8gP8vKCOePdR9sTzUiQ8H5YU1jJYBx77HGAoKdUU';

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
    // Step 2: Start callback server
    const { port, waitForCallback, close } = await startCallbackServer(
      generateState()
    );

    // Step 3: Generate PKCE challenge
    const { challenge, verifier } = generatePKCE();
    const state = generateState();

    // Step 4: Build auth URL
    const authUrl = new URL(`${platformUrl}/auth/cli`);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('redirect_port', port.toString());
    authUrl.searchParams.set('state', state);

    console.log('Opening browser to log in...\n');

    // Step 5: Open browser
    try {
      await open(authUrl.toString());
    } catch (error) {
      console.log(`✗ Failed to open browser automatically.`);
      console.log(`\nVisit this URL manually:\n${authUrl.toString()}\n`);
    }

    // Step 6: Wait for callback (with 30s timeout)
    const { code } = await waitForCallback();

    // Step 7: Exchange code for session tokens
    const tokenUrl = `${supabaseUrl}/auth/v1/token?grant_type=pkce`;
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_code: code,
        code_verifier: verifier,
      }),
    });

    if (!response.ok) {
      close();
      const errorText = await response.text();
      throw new Error(
        `Failed to exchange auth code: ${response.status} ${errorText}`
      );
    }

    const data = await response.json();

    // Step 8: Save credentials
    const expiresAt = new Date(
      Date.now() + data.expires_in * 1000
    ).toISOString();

    const credentials: CliAuthCredentials = {
      user_id: data.user.id,
      email: data.user.email,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
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
