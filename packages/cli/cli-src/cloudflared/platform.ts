/**
 * Platform Detection Module
 *
 * Handles OS and architecture detection for cloudflared binary selection.
 */

import os from 'os';
import path from 'path';
import type { PlatformInfo } from './types';

/**
 * Binary name mapping by platform and architecture.
 */
const BINARY_MAP: Record<string, Record<string, { name: string; archive: boolean }>> = {
  win32: {
    x64: { name: 'cloudflared-windows-amd64.exe', archive: false },
    ia32: { name: 'cloudflared-windows-386.exe', archive: false }
  },
  darwin: {
    x64: { name: 'cloudflared-darwin-amd64.tgz', archive: true },
    arm64: { name: 'cloudflared-darwin-arm64.tgz', archive: true }
  },
  linux: {
    x64: { name: 'cloudflared-linux-amd64', archive: false },
    arm64: { name: 'cloudflared-linux-arm64', archive: false },
    arm: { name: 'cloudflared-linux-arm', archive: false }
  }
};

/**
 * Detects the current platform and returns binary information.
 * @throws Error if the platform/architecture combination is not supported
 */
export function getPlatformInfo(): PlatformInfo {
  const platform = os.platform();
  const arch = os.arch();

  const platformBinaries = BINARY_MAP[platform];
  if (!platformBinaries) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const info = platformBinaries[arch];
  if (!info) {
    throw new Error(`Unsupported architecture: ${arch} on ${platform}`);
  }

  return {
    os: platform as PlatformInfo['os'],
    arch: arch as PlatformInfo['arch'],
    binaryName: info.name,
    isArchive: info.archive
  };
}

/**
 * Returns the cache directory for cloudflared binaries.
 * Can be overridden with CLOUDFLARED_CACHE_DIR environment variable.
 */
export function getCacheDir(): string {
  if (process.env.CLOUDFLARED_CACHE_DIR) {
    return process.env.CLOUDFLARED_CACHE_DIR;
  }
  return path.join(os.homedir(), '.cache', 'agentmark-cloudflared');
}

/**
 * Returns the full path to the cloudflared binary.
 */
export function getBinaryPath(): string {
  const cacheDir = getCacheDir();
  const { binaryName, isArchive } = getPlatformInfo();

  // For archives (macOS .tgz), the extracted binary is named 'cloudflared'
  // For direct downloads (Windows .exe, Linux), use the original name
  if (isArchive) {
    return path.join(cacheDir, 'cloudflared');
  }

  return path.join(cacheDir, binaryName);
}
