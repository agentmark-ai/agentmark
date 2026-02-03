/**
 * Cloudflared Tunneling Types
 *
 * TypeScript interfaces for cloudflared binary management and tunnel operations.
 */

/**
 * Information about an active tunnel connection.
 */
export interface TunnelInfo {
  /** Public tunnel URL (e.g., https://xyz.trycloudflare.com) */
  url: string;
  /** Tunnel provider identifier */
  provider: 'cloudflared';
  /** Cleanup function to disconnect the tunnel */
  disconnect: () => Promise<void>;
}

/**
 * Configuration for cloudflared binary management.
 */
export interface CloudflaredConfig {
  /** Binary cache directory */
  cacheDir: string;
  /** Version to use ('latest' or specific version) */
  version: string;
  /** Resolved binary path (null if not downloaded) */
  binaryPath: string | null;
}

/**
 * Platform detection information for binary selection.
 */
export interface PlatformInfo {
  /** Operating system */
  os: 'win32' | 'darwin' | 'linux';
  /** CPU architecture */
  arch: 'x64' | 'arm64' | 'arm' | 'ia32';
  /** Platform-specific binary filename */
  binaryName: string;
  /** True for .tgz files (macOS) */
  isArchive: boolean;
}

/**
 * Progress reporting during binary download.
 */
export interface DownloadProgress {
  /** Current download phase */
  phase: 'checking' | 'downloading' | 'extracting' | 'ready';
  /** Bytes downloaded so far */
  bytesDownloaded?: number;
  /** Total bytes to download */
  totalBytes?: number;
  /** Human-readable status message */
  message: string;
}
