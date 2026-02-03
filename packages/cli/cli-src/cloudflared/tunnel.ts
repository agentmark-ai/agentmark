/**
 * Cloudflared Tunnel Management Module
 *
 * Handles creating and managing cloudflared tunnel connections with retry logic.
 */

import { spawn, ChildProcess } from 'child_process';
import { ensureCloudflared } from './download';
import type { TunnelInfo } from './types';

/** Maximum time to wait for tunnel URL (milliseconds) */
const TUNNEL_TIMEOUT = 30000;

/** Number of retry attempts for connection failures */
const MAX_RETRIES = 3;

/** Delay between retry attempts (milliseconds) */
const RETRY_DELAY = 2000;

/**
 * Regex pattern to extract tunnel URL from cloudflared output.
 * Matches URLs like: https://random-words.trycloudflare.com
 */
const URL_REGEX = /https:\/\/([\w-]+)\.trycloudflare\.com/;

/**
 * Creates a cloudflared tunnel to the specified local port.
 * Includes retry logic for connection failures (FR-007).
 *
 * @param port Local port to tunnel to
 * @param subdomain Optional subdomain (not used for trycloudflare.com, kept for API compatibility)
 * @returns TunnelInfo with URL and disconnect function
 * @throws Error if tunnel cannot be established after retries
 */
export async function createTunnel(port: number, _subdomain?: string): Promise<TunnelInfo> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await attemptTunnel(port);
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_RETRIES) {
        console.log(`Tunnel connection failed (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${RETRY_DELAY / 1000}s...`);
        await delay(RETRY_DELAY);
      }
    }
  }

  throw new Error(`Failed to establish tunnel after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

/**
 * Single attempt to create a tunnel connection.
 */
async function attemptTunnel(port: number): Promise<TunnelInfo> {
  const binaryPath = await ensureCloudflared();

  return new Promise((resolve, reject) => {
    const tunnel = spawn(binaryPath, ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let urlFound = false;
    const tunnelProcess: ChildProcess = tunnel;

    const handleOutput = (data: Buffer) => {
      const output = data.toString();
      const match = output.match(URL_REGEX);

      if (match && !urlFound) {
        urlFound = true;
        resolve({
          url: match[0],
          provider: 'cloudflared',
          disconnect: async () => {
            return new Promise<void>((res) => {
              if (tunnelProcess.killed) {
                res();
                return;
              }

              tunnelProcess.on('close', () => res());

              // Use SIGTERM for graceful shutdown
              tunnelProcess.kill('SIGTERM');

              // Force kill after 5 seconds if still running
              setTimeout(() => {
                if (!tunnelProcess.killed) {
                  tunnelProcess.kill('SIGKILL');
                }
                res();
              }, 5000);
            });
          }
        });
      }
    };

    // URL may appear in stdout or stderr depending on cloudflared version
    tunnel.stdout?.on('data', handleOutput);
    tunnel.stderr?.on('data', handleOutput);

    tunnel.on('error', (error) => {
      if (!urlFound) {
        reject(new Error(`Failed to start cloudflared: ${error.message}`));
      }
    });

    tunnel.on('close', (code) => {
      if (!urlFound) {
        reject(new Error(`Cloudflared exited with code ${code} before establishing tunnel`));
      }
    });

    // Timeout if URL not found within time limit
    setTimeout(() => {
      if (!urlFound) {
        tunnel.kill('SIGTERM');
        reject(new Error('Tunnel connection timeout - no URL received within 30 seconds'));
      }
    }, TUNNEL_TIMEOUT);
  });
}

/**
 * Utility function for delays.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
