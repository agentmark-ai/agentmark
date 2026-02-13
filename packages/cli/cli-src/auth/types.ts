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
  access_token: string;
  refresh_token: string;
  user_id: string;
  email: string;
  expires_at: string;
  state: string;
}

/** Platform app returned by /api/cli/apps */
export interface PlatformApp {
  id: string;
  name: string;
  tenant_id: string;
  tenant_name: string;
  created_at: string;
}

/** Dev key response returned by /api/cli/dev-key */
export interface DevKeyResponse {
  key: string;
  key_id: string;
  app_id: string;
  app_name: string;
  tenant_id: string;
  base_url: string;
  expires_at: string;
  scope: string;
}
