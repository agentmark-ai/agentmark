import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * The config module uses os.tmpdir() + '/.agentmark-dev-config.json' in test
 * environments (when VITEST env var is set). Both config.ts and
 * forwarding/config.ts share this same file path.
 *
 * loadLocalConfig() caches the parsed config in module-level variables
 * (cachedConfig / cachedConfigPath). To get clean state per test, we call
 * vi.resetModules() and dynamically import the forwarding config module so
 * that each test starts with an empty cache.
 *
 * isKeyExpired is a pure function with no file I/O or cache dependency,
 * so it is imported statically for convenience.
 */

import { isKeyExpired, type ForwardingConfig } from '../../cli-src/forwarding/config';

const CONFIG_PATH = path.join(os.tmpdir(), '.agentmark-dev-config.json');

function removeConfigFile(): void {
  try {
    fs.unlinkSync(CONFIG_PATH);
  } catch {
    // File may not exist — that's fine
  }
}

function readRawConfig(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function writeRawConfig(data: Record<string, unknown>): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Dynamically imports forwarding/config with fresh module state.
 * This resets the loadLocalConfig cache so each test starts clean.
 */
async function importFreshModule() {
  const mod = await import('../../cli-src/forwarding/config');
  return {
    loadForwardingConfig: mod.loadForwardingConfig,
    saveForwardingConfig: mod.saveForwardingConfig,
    clearForwardingConfig: mod.clearForwardingConfig,
  };
}

describe('forwarding/config', () => {
  beforeEach(() => {
    removeConfigFile();
    vi.resetModules();
  });

  describe('read/write round-trip', () => {
    it('should return the same forwarding config fields after save and load', async () => {
      const { saveForwardingConfig, loadForwardingConfig } = await importFreshModule();

      const forwarding: ForwardingConfig = {
        appId: 'app-123',
        appName: 'My App',
        tenantId: 'tenant-456',
        apiKey: 'sk-test-key-abc',
        apiKeyId: 'key-789',
        expiresAt: '2099-12-31T23:59:59.000Z',
        baseUrl: 'https://api.example.com',
      };

      saveForwardingConfig(forwarding);
      const loaded = loadForwardingConfig();

      expect(loaded).toEqual(forwarding);
    });
  });

  describe('loadForwardingConfig', () => {
    it('should return null when dev-config.json exists but has no forwarding field', async () => {
      // Write a config file that has other fields but no forwarding
      writeRawConfig({
        webhookSecret: 'some-secret',
        tunnelSubdomain: 'agentmark-abc123',
        createdAt: new Date().toISOString(),
      });

      const { loadForwardingConfig } = await importFreshModule();
      const result = loadForwardingConfig();

      expect(result).toBeNull();
    });

    it('should return null when dev-config.json does not exist', async () => {
      // Config file is already removed by beforeEach — loadForwardingConfig
      // will call loadLocalConfig which creates a new config without a
      // forwarding field.
      const { loadForwardingConfig } = await importFreshModule();
      const result = loadForwardingConfig();

      expect(result).toBeNull();
    });
  });

  describe('clearForwardingConfig', () => {
    it('should remove the forwarding field so load returns null', async () => {
      const { saveForwardingConfig, loadForwardingConfig, clearForwardingConfig } =
        await importFreshModule();

      const forwarding: ForwardingConfig = {
        appId: 'app-to-clear',
        apiKey: 'sk-clear-me',
      };

      saveForwardingConfig(forwarding);

      // Verify it was saved
      expect(loadForwardingConfig()).not.toBeNull();

      clearForwardingConfig();

      const afterClear = loadForwardingConfig();
      expect(afterClear).toBeNull();
    });

    it('should preserve other config fields when forwarding is removed', async () => {
      // Seed a config file with webhookSecret and other fields.
      // createdAt must be recent (within 30 days) to avoid loadLocalConfig()
      // regenerating the config due to expiration.
      writeRawConfig({
        webhookSecret: 'preserve-me-secret',
        tunnelSubdomain: 'agentmark-keep',
        createdAt: new Date().toISOString(),
        appPort: 4000,
      });

      const { saveForwardingConfig, clearForwardingConfig } = await importFreshModule();

      // Save forwarding on top of existing config
      saveForwardingConfig({
        appId: 'app-temp',
        apiKey: 'sk-temp-key',
      });

      // Verify forwarding was merged in
      const rawBeforeClear = readRawConfig();
      expect(rawBeforeClear.forwarding).toBeDefined();
      expect(rawBeforeClear.webhookSecret).toBe('preserve-me-secret');

      // Clear forwarding
      clearForwardingConfig();

      // Read the raw file to verify other fields survived
      const rawAfterClear = readRawConfig();
      expect(rawAfterClear.forwarding).toBeUndefined();
      expect(rawAfterClear.webhookSecret).toBe('preserve-me-secret');
      expect(rawAfterClear.tunnelSubdomain).toBe('agentmark-keep');
      expect(rawAfterClear.appPort).toBe(4000);
    });
  });

  describe('isKeyExpired', () => {
    it('should return true when expiresAt is in the past', () => {
      const config: ForwardingConfig = {
        apiKey: 'sk-expired',
        expiresAt: '2020-01-01T00:00:00.000Z',
      };

      expect(isKeyExpired(config)).toBe(true);
    });

    it('should return false when expiresAt is in the future', () => {
      const config: ForwardingConfig = {
        apiKey: 'sk-valid',
        expiresAt: '2099-12-31T23:59:59.000Z',
      };

      expect(isKeyExpired(config)).toBe(false);
    });

    it('should return false when expiresAt is not set', () => {
      const config: ForwardingConfig = {
        apiKey: 'sk-no-expiry',
      };

      expect(isKeyExpired(config)).toBe(false);
    });
  });
});
