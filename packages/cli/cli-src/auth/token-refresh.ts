import { CliAuthCredentials } from "./types";
import { saveCredentials } from "./credentials";

/**
 * Supabase token-refresh response shape (subset we consume).
 * Matches the GoTrueClient `/auth/v1/token?grant_type=refresh_token` response.
 */
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email: string };
}

/**
 * Exchanges a refresh token for a new access/refresh token pair via
 * the Supabase Auth REST API. Persists the updated credentials on
 * success and returns them; returns `null` on any failure.
 */
export async function refreshAccessToken(
  credentials: CliAuthCredentials,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<CliAuthCredentials | null> {
  try {
    const url = `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: credentials.refresh_token }),
    });

    if (response.status !== 200) {
      return null;
    }

    const data = (await response.json()) as TokenResponse;

    const expiresAt = new Date(
      Date.now() + data.expires_in * 1000
    ).toISOString();

    const updated: CliAuthCredentials = {
      user_id: data.user.id,
      email: data.user.email,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      created_at: credentials.created_at,
    };

    saveCredentials(updated);

    return updated;
  } catch {
    return null;
  }
}
