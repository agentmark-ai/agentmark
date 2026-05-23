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
  getPlatformUrl,
  getSupabaseUrl,
  getSupabaseAnonKey,
} from '../auth/constants';

export interface LoginOptions {
  baseUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /**
   * How long the local callback server should wait for the browser
   * handoff before failing the login with "timed out", in **seconds**.
   * Defaults to 120 (2 minutes), set in
   * `callback-server.ts::DEFAULT_TIMEOUT_MS`. Use a higher value for
   * agent-driven flows where the user reads a prompt, switches to a
   * browser, clicks the URL, and completes sign-in (or a lower value
   * for tightly-scripted CI tests).
   */
  timeoutSec?: number;
  /**
   * Print the auth URL instead of shelling to `open()`. Use this in
   * SSH'd shells, CI runners, IDE-embedded agents, or anywhere a
   * background spawn of the system browser doesn't make sense. The
   * user clicks the printed URL in their own browser; the local
   * callback server receives the tokens exactly as in the default
   * flow.
   */
  printUrl?: boolean;
  /**
   * Emit a single line of JSON on success instead of human text. The
   * line shape is `{ logged_in: true, user_id, email }`. Errors still
   * go to stderr / cause non-zero exit.
   */
  json?: boolean;
}

/**
 * Executes the login flow.
 */
export default async function login(options: LoginOptions = {}): Promise<void> {
  const platformUrl = getPlatformUrl(options.baseUrl);
  const supabaseUrl = getSupabaseUrl(options.supabaseUrl);
  const supabaseAnonKey = getSupabaseAnonKey(options.supabaseAnonKey);
  const json = options.json === true;
  const printUrl = options.printUrl === true;

  const out = (humanMsg: string, jsonObj?: Record<string, unknown>): void => {
    if (json) {
      if (jsonObj) console.log(JSON.stringify(jsonObj));
    } else {
      console.log(humanMsg);
    }
  };

  // Step 1: Check existing auth
  const existing = loadCredentials();
  if (existing) {
    if (!isExpired(existing)) {
      out(`✓ Already logged in as ${existing.email}`, {
        logged_in: true,
        already: true,
        user_id: existing.user_id,
        email: existing.email,
      });
      return;
    }

    // Try to refresh expired token
    if (!json) console.log('⚠️  Token expired, attempting refresh...');
    const refreshed = await refreshAccessToken(
      existing,
      supabaseUrl,
      supabaseAnonKey
    );
    if (refreshed) {
      out(`✓ Token refreshed. Logged in as ${refreshed.email}`, {
        logged_in: true,
        refreshed: true,
        user_id: refreshed.user_id,
        email: refreshed.email,
      });
      return;
    }

    if (!json) console.log('⚠️  Refresh failed. Starting new login...');
  }

  try {
    // Step 2: Generate state for CSRF protection
    const state = generateState();

    // Step 3: Start callback server
    // Convert seconds → milliseconds. Undefined ⇒ use the default
    // inside `startCallbackServer`.
    const timeoutMs =
      typeof options.timeoutSec === 'number' && Number.isFinite(options.timeoutSec)
        ? options.timeoutSec * 1000
        : undefined;
    const { port, waitForCallback, close } = await startCallbackServer(state, timeoutMs);

    // Step 4: Build auth URL
    const authUrl = new URL(`${platformUrl}/auth/cli`);
    authUrl.searchParams.set('redirect_port', port.toString());
    authUrl.searchParams.set('state', state);

    // Step 5: Either print the URL (headless / scripted contexts) or
    // shell to `open()` to launch the system browser (default).
    if (printUrl) {
      if (json) {
        // Emit a structured "awaiting" event so a wrapper can render
        // the URL however it wants. The CLI still blocks waiting for
        // the callback after this line.
        console.log(
          JSON.stringify({
            awaiting_auth: true,
            url: authUrl.toString(),
            port,
            state,
          }),
        );
      } else {
        console.log(
          `\nVisit this URL in your browser to authenticate:\n\n  ${authUrl.toString()}\n\nWaiting for sign-in...\n`,
        );
      }
    } else {
      if (!json) console.log('Opening browser to log in...\n');
      try {
        const open = (await import('open')).default;
        await open(authUrl.toString());
      } catch {
        // System `open` failed — fall back to printing the URL so the
        // user can complete sign-in manually. Matches `--print-url`.
        if (json) {
          console.log(
            JSON.stringify({
              awaiting_auth: true,
              url: authUrl.toString(),
              port,
              state,
              note: 'system open() failed; visit url manually',
            }),
          );
        } else {
          console.log(`✗ Failed to open browser automatically.`);
          console.log(`\nVisit this URL manually:\n${authUrl.toString()}\n`);
        }
      }
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

    out(`\n✓ Logged in as ${credentials.email}`, {
      logged_in: true,
      user_id: credentials.user_id,
      email: credentials.email,
    });

    close();
  } catch (error) {
    if ((error as Error).message.includes('timed out')) {
      if (json) {
        console.log(JSON.stringify({ logged_in: false, error: 'timed_out' }));
      } else {
        console.log('\n✗ Login timed out. Please try again.');
      }
      process.exit(1);
    }

    throw error;
  }
}
