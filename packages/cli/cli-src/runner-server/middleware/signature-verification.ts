/**
 * Webhook signature verification middleware for securing webhook endpoints.
 * Uses HMAC-SHA256 signatures to verify requests are from trusted sources.
 */

import { verifySignature } from '@agentmark/shared-utils';

export interface SignatureVerificationOptions {
  /**
   * The secret key used to verify webhook signatures.
   * Should match the secret used by the sender to create the signature.
   */
  secret: string;

  /**
   * The name of the header containing the signature.
   * Defaults to 'x-agentmark-signature-256'
   */
  headerName?: string;

  /**
   * Whether to skip verification (useful for local development).
   * Defaults to false.
   */
  skipVerification?: boolean;
}

/**
 * Verifies the webhook signature from the request.
 *
 * @param body - The request body as a string
 * @param signature - The signature from the request header
 * @param secret - The webhook secret
 * @returns True if signature is valid, false otherwise
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    return await verifySignature(secret, signature, body);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Checks if signature verification should be enforced based on environment.
 *
 * @param options - Signature verification options
 * @returns True if verification should be skipped
 */
export function shouldSkipVerification(options: SignatureVerificationOptions): boolean {
  // Skip if explicitly disabled
  if (options.skipVerification) {
    return true;
  }

  // Skip if no secret is provided (local dev without secret)
  if (!options.secret || options.secret === 'DEFAULT') {
    return true;
  }

  return false;
}

/**
 * Gets the webhook secret from environment or options.
 *
 * @param envVarName - Environment variable name (defaults to AGENTMARK_WEBHOOK_SECRET)
 * @param fallbackSecret - Optional fallback secret
 * @returns The webhook secret or undefined
 */
export function getWebhookSecret(
  envVarName: string = 'AGENTMARK_WEBHOOK_SECRET',
  fallbackSecret?: string
): string | undefined {
  return process.env[envVarName] || fallbackSecret;
}
