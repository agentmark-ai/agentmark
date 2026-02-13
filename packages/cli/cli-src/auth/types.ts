/**
 * CLI authentication types for platform pairing.
 */

/** Stored credentials from browser-based PKCE login */
export interface CliAuthCredentials {
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO 8601
  created_at: string; // ISO 8601
}

/** PKCE challenge pair for OAuth flow */
export interface PKCEPair {
  verifier: string;
  challenge: string;
}

/** Callback result from localhost OAuth server */
export interface CallbackResult {
  code: string;
  state: string;
}
