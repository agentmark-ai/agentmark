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
 *
 * @param port - Local port to expose
 * @param subdomain - Optional subdomain to request (not guaranteed)
 * @returns Tunnel information with URL and disconnect function
 */
export async function createTunnel(port: number, subdomain?: string): Promise<TunnelInfo> {
  try {
    const tunnel = await createLocalTunnel(port, subdomain);
    return tunnel;
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error('\n❌ Failed to create tunnel:', errorMsg);
    console.error('Localtunnel connection failed. This is usually temporary - try again in a moment.\n');
    throw error;
  }
}

