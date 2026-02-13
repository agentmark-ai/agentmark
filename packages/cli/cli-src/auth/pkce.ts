import crypto from "crypto";
import { PKCEPair } from "./types";

/**
 * Encodes a buffer as a base64url string (RFC 7636 Appendix A).
 * Replaces `+` with `-`, `/` with `_`, and strips trailing `=` padding.
 */
function base64url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generates a PKCE code verifier and challenge pair for OAuth 2.0
 * Authorization Code flow with Proof Key for Code Exchange (RFC 7636).
 *
 * The verifier is a 43-character base64url-encoded random string (32 bytes).
 * The challenge is the SHA-256 hash of the verifier, base64url-encoded.
 */
export function generatePKCE(): PKCEPair {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest()
  );

  return { verifier, challenge };
}

/**
 * Generates a random state parameter for CSRF protection during OAuth flows.
 * Returns a 16-byte hex-encoded string (32 hex characters).
 */
export function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}
