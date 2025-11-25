/**
 * Tunnel management for exposing local development servers publicly.
 * Uses localtunnel for free, no-auth public access.
 */

import localtunnel from 'localtunnel';

export interface TunnelInfo {
  url: string;
  provider: 'localtunnel';
  disconnect: () => Promise<void>;
}

// Error codes that should not be retried
const NON_RETRYABLE_ERRORS = [
  'EACCES',           // Permission denied
  'EADDRINUSE',       // Port already in use locally
  'ENOTFOUND',        // DNS resolution failed
  'ERR_INVALID_ARG',  // Invalid arguments
];

// Error messages that indicate auth/config issues (not retryable)
const NON_RETRYABLE_MESSAGES = [
  'unauthorized',
  'forbidden',
  'invalid subdomain',
  'subdomain is not available',
];

function isRetryableError(error: any): boolean {
  const errorCode = error.code || '';
  const errorMessage = (error.message || '').toLowerCase();

  // Check for non-retryable error codes
  if (NON_RETRYABLE_ERRORS.includes(errorCode)) {
    return false;
  }

  // Check for non-retryable error messages
  for (const msg of NON_RETRYABLE_MESSAGES) {
    if (errorMessage.includes(msg)) {
      return false;
    }
  }

  // Default to retryable (network issues, timeouts, etc.)
  return true;
}

/**
 * Creates a public tunnel using localtunnel (free, no auth required).
 * Optionally uses a subdomain for consistent URLs.
 */
async function createLocalTunnel(port: number, subdomain?: string): Promise<TunnelInfo> {
  try {
    const options: any = { port };

    // Try to use subdomain if provided (not guaranteed to be available)
    if (subdomain) {
      options.subdomain = subdomain;
    }

    const tunnel = await localtunnel(options);

    // Handle tunnel errors
    tunnel.on('error', (err: any) => {
      console.error('Localtunnel error:', err);
    });

    if (!tunnel.url) {
      throw new Error('Localtunnel did not return a URL');
    }

    return {
      url: tunnel.url,
      provider: 'localtunnel',
      disconnect: async () => {
        tunnel.close();
      }
    };
  } catch (error: any) {
    console.error('Localtunnel connection error:', error.message);
    throw error;
  }
}

/**
 * Creates a public tunnel to a local port using localtunnel.
 * Includes retry logic for transient errors.
 *
 * @param port - Local port to expose
 * @param subdomain - Optional subdomain to request (not guaranteed)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Tunnel information with URL and disconnect function
 */
export async function createTunnel(port: number, subdomain?: string, maxRetries: number = 3): Promise<TunnelInfo> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const tunnel = await createLocalTunnel(port, subdomain);
      return tunnel;
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || String(error);

      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        console.error('\n❌ Failed to create tunnel:', errorMsg);
        if (error.code === 'EADDRINUSE') {
          console.error(`Port ${port} is already in use. Stop the other process or use a different port.\n`);
        } else if (errorMsg.toLowerCase().includes('subdomain')) {
          console.error('The requested subdomain is not available. Try a different subdomain or omit it.\n');
        } else {
          console.error('This error cannot be resolved by retrying.\n');
        }
        throw error;
      }

      // Log retry attempt for retryable errors
      if (attempt < maxRetries) {
        console.warn(`Tunnel connection attempt ${attempt} failed: ${errorMsg}. Retrying...`);
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  // All retries exhausted
  const errorMsg = lastError?.message || String(lastError);
  console.error('\n❌ Failed to create tunnel after', maxRetries, 'attempts:', errorMsg);
  console.error('Localtunnel connection failed. This is usually temporary - try again in a moment.\n');
  throw lastError;
}

