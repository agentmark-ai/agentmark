/**
 * Tunnel management for exposing local development servers publicly.
 * Uses cloudflared for reliable, no-auth public access via trycloudflare.com.
 */

// Re-export from cloudflared module for backward compatibility
export { createTunnel } from './cloudflared';
export type { TunnelInfo } from './cloudflared';
