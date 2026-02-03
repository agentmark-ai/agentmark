import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// Mock modules before importing
vi.mock('os');
vi.mock('fs');

import { getPlatformInfo, getCacheDir, getBinaryPath } from '../../cli-src/cloudflared/platform';

describe('cloudflared platform detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear environment variable
    delete process.env.CLOUDFLARED_CACHE_DIR;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlatformInfo', () => {
    it('returns correct info for Windows x64', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.arch).mockReturnValue('x64');

      const info = getPlatformInfo();

      expect(info.os).toBe('win32');
      expect(info.arch).toBe('x64');
      expect(info.binaryName).toBe('cloudflared-windows-amd64.exe');
      expect(info.isArchive).toBe(false);
    });

    it('returns correct info for macOS arm64', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.arch).mockReturnValue('arm64');

      const info = getPlatformInfo();

      expect(info.os).toBe('darwin');
      expect(info.arch).toBe('arm64');
      expect(info.binaryName).toBe('cloudflared-darwin-arm64.tgz');
      expect(info.isArchive).toBe(true);
    });

    it('returns correct info for Linux x64', () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.arch).mockReturnValue('x64');

      const info = getPlatformInfo();

      expect(info.os).toBe('linux');
      expect(info.arch).toBe('x64');
      expect(info.binaryName).toBe('cloudflared-linux-amd64');
      expect(info.isArchive).toBe(false);
    });

    it('returns correct info for Linux arm64', () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.arch).mockReturnValue('arm64');

      const info = getPlatformInfo();

      expect(info.os).toBe('linux');
      expect(info.arch).toBe('arm64');
      expect(info.binaryName).toBe('cloudflared-linux-arm64');
      expect(info.isArchive).toBe(false);
    });

    it('throws error for unsupported platform', () => {
      vi.mocked(os.platform).mockReturnValue('freebsd' as any);
      vi.mocked(os.arch).mockReturnValue('x64');

      expect(() => getPlatformInfo()).toThrow('Unsupported platform');
    });

    it('throws error for unsupported architecture', () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.arch).mockReturnValue('mips' as any);

      expect(() => getPlatformInfo()).toThrow('Unsupported architecture');
    });
  });

  describe('getCacheDir', () => {
    it('uses CLOUDFLARED_CACHE_DIR if set', () => {
      process.env.CLOUDFLARED_CACHE_DIR = '/custom/cache';

      expect(getCacheDir()).toBe('/custom/cache');
    });

    it('uses default cache directory on Windows', () => {
      delete process.env.CLOUDFLARED_CACHE_DIR;
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.homedir).mockReturnValue('C:\\Users\\TestUser');

      const cacheDir = getCacheDir();

      expect(cacheDir).toBe(path.join('C:\\Users\\TestUser', '.cache', 'agentmark-cloudflared'));
    });

    it('uses default cache directory on macOS', () => {
      delete process.env.CLOUDFLARED_CACHE_DIR;
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/testuser');

      const cacheDir = getCacheDir();

      expect(cacheDir).toBe(path.join('/Users/testuser', '.cache', 'agentmark-cloudflared'));
    });

    it('uses default cache directory on Linux', () => {
      delete process.env.CLOUDFLARED_CACHE_DIR;
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');

      const cacheDir = getCacheDir();

      expect(cacheDir).toBe(path.join('/home/testuser', '.cache', 'agentmark-cloudflared'));
    });
  });

  describe('getBinaryPath', () => {
    it('returns correct path for Windows', () => {
      delete process.env.CLOUDFLARED_CACHE_DIR;
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.arch).mockReturnValue('x64');
      vi.mocked(os.homedir).mockReturnValue('C:\\Users\\TestUser');

      const binaryPath = getBinaryPath();

      expect(binaryPath).toContain('cloudflared-windows-amd64.exe');
      expect(binaryPath).toContain('agentmark-cloudflared');
    });

    it('returns correct path for macOS (extracted binary name)', () => {
      delete process.env.CLOUDFLARED_CACHE_DIR;
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.arch).mockReturnValue('arm64');
      vi.mocked(os.homedir).mockReturnValue('/Users/testuser');

      const binaryPath = getBinaryPath();

      // macOS uses tgz, so binary name is just 'cloudflared'
      expect(binaryPath).toContain('cloudflared');
      expect(binaryPath).toContain('agentmark-cloudflared');
    });

    it('returns correct path for Linux', () => {
      delete process.env.CLOUDFLARED_CACHE_DIR;
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.arch).mockReturnValue('x64');
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');

      const binaryPath = getBinaryPath();

      expect(binaryPath).toContain('cloudflared-linux-amd64');
      expect(binaryPath).toContain('agentmark-cloudflared');
    });
  });
});
