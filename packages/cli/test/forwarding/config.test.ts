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

  describe('concurrent access', () => {
    it('should handle concurrent loadForwardingConfig calls', async () => {
      // Write initial config
      const initialConfig: ForwardingConfig = {
        appId: 'app-concurrent-read',
        apiKey: 'sk-read-test',
        tenantId: 'tenant-read',
      };

      const { saveForwardingConfig } = await importFreshModule();
      saveForwardingConfig(initialConfig);

      // Reset module cache to start fresh for concurrent loads
      vi.resetModules();

      // Launch multiple concurrent reads
      const [mod1, mod2, mod3] = await Promise.all([
        importFreshModule(),
        importFreshModule(),
        importFreshModule(),
      ]);

      const [result1, result2, result3] = [
        mod1.loadForwardingConfig(),
        mod2.loadForwardingConfig(),
        mod3.loadForwardingConfig(),
      ];

      // All reads should succeed and return the same data
      expect(result1).toEqual(initialConfig);
      expect(result2).toEqual(initialConfig);
      expect(result3).toEqual(initialConfig);
    });

    it('should handle concurrent saveForwardingConfig calls', async () => {
      const { saveForwardingConfig } = await importFreshModule();

      const config1: ForwardingConfig = {
        appId: 'app-write-1',
        apiKey: 'sk-write-1',
      };
      const config2: ForwardingConfig = {
        appId: 'app-write-2',
        apiKey: 'sk-write-2',
      };
      const config3: ForwardingConfig = {
        appId: 'app-write-3',
        apiKey: 'sk-write-3',
      };

      // Launch concurrent writes (race condition — last write wins)
      await Promise.all([
        saveForwardingConfig(config1),
        saveForwardingConfig(config2),
        saveForwardingConfig(config3),
      ]);

      // Read the final state — it should be one of the three configs
      const raw = readRawConfig();
      const final = raw.forwarding as ForwardingConfig;

      expect(final).toBeDefined();
      // The final state should be one of the three written configs
      const possibleResults = [config1, config2, config3];
      expect(possibleResults).toContainEqual(final);
    });

    it('should handle loadForwardingConfig called during saveForwardingConfig', async () => {
      const { saveForwardingConfig } = await importFreshModule();

      // Write initial config
      const initialConfig: ForwardingConfig = {
        appId: 'app-initial',
        apiKey: 'sk-initial',
      };
      saveForwardingConfig(initialConfig);

      vi.resetModules();

      // Start a write operation
      const newConfig: ForwardingConfig = {
        appId: 'app-new',
        apiKey: 'sk-new',
      };

      const { saveForwardingConfig: save2, loadForwardingConfig: load2 } =
        await importFreshModule();

      // Launch read and write concurrently
      const [, readResult] = await Promise.all([
        save2(newConfig),
        load2(), // Reads during write
      ]);

      // Read result should be either initial or new config (race condition)
      expect(readResult).toBeDefined();
      expect([initialConfig, newConfig]).toContainEqual(readResult);
    });

    it('should handle clearForwardingConfig during concurrent reads', async () => {
      const { saveForwardingConfig } = await importFreshModule();

      // Write initial config
      const initialConfig: ForwardingConfig = {
        appId: 'app-to-clear',
        apiKey: 'sk-to-clear',
      };
      saveForwardingConfig(initialConfig);

      vi.resetModules();

      const { loadForwardingConfig, clearForwardingConfig } = await importFreshModule();

      // Launch clear and multiple reads concurrently
      const [, read1, read2] = await Promise.all([
        clearForwardingConfig(),
        loadForwardingConfig(),
        loadForwardingConfig(),
      ]);

      // Reads may see either the config (before clear) or null (after clear)
      expect([initialConfig, null]).toContainEqual(read1);
      expect([initialConfig, null]).toContainEqual(read2);

      // After all operations settle, forwarding should be cleared
      vi.resetModules();
      const { loadForwardingConfig: loadFinal } = await importFreshModule();
      expect(loadFinal()).toBeNull();
    });

    it('should handle file system errors when directory does not exist', async () => {
      // Remove the config file to start clean
      removeConfigFile();

      // Mock fs.writeFileSync to throw ENOENT (directory doesn't exist)
      const originalWriteFileSync = fs.writeFileSync;
      vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
        const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      });

      const { saveForwardingConfig } = await importFreshModule();

      const config: ForwardingConfig = {
        appId: 'app-no-dir',
        apiKey: 'sk-no-dir',
      };

      // Should not throw — error is caught and logged
      expect(() => saveForwardingConfig(config)).not.toThrow();

      // Restore original implementation
      fs.writeFileSync = originalWriteFileSync;
    });

    it('should handle file system errors when permission is denied', async () => {
      const { saveForwardingConfig } = await importFreshModule();

      // Mock fs.writeFileSync to throw EACCES (permission denied)
      const originalWriteFileSync = fs.writeFileSync;
      vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
        const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      });

      const config: ForwardingConfig = {
        appId: 'app-no-perm',
        apiKey: 'sk-no-perm',
      };

      // Should not throw — error is caught and logged
      expect(() => saveForwardingConfig(config)).not.toThrow();

      // Restore original implementation
      fs.writeFileSync = originalWriteFileSync;
    });

    it('should handle file system errors when disk is full', async () => {
      const { saveForwardingConfig } = await importFreshModule();

      // Mock fs.writeFileSync to throw ENOSPC (disk full)
      const originalWriteFileSync = fs.writeFileSync;
      vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
        const error = new Error('ENOSPC: no space left on device') as NodeJS.ErrnoException;
        error.code = 'ENOSPC';
        throw error;
      });

      const config: ForwardingConfig = {
        appId: 'app-no-space',
        apiKey: 'sk-no-space',
      };

      // Should not throw — error is caught and logged
      expect(() => saveForwardingConfig(config)).not.toThrow();

      // Restore original implementation
      fs.writeFileSync = originalWriteFileSync;
    });

    it('should handle corrupted config file during load', async () => {
      // Write invalid JSON to the config file
      fs.writeFileSync(CONFIG_PATH, 'not valid json{', 'utf-8');

      const { loadForwardingConfig } = await importFreshModule();

      // loadLocalConfig will catch JSON parse error and create new config
      // Since new config has no forwarding field, load should return null
      const result = loadForwardingConfig();

      expect(result).toBeNull();
    });

    it('should handle race between concurrent save and clear operations', async () => {
      const { saveForwardingConfig } = await importFreshModule();

      // Write initial config
      const initialConfig: ForwardingConfig = {
        appId: 'app-race',
        apiKey: 'sk-race',
      };
      saveForwardingConfig(initialConfig);

      vi.resetModules();

      const { saveForwardingConfig: save2, clearForwardingConfig } = await importFreshModule();

      const newConfig: ForwardingConfig = {
        appId: 'app-race-new',
        apiKey: 'sk-race-new',
      };

      // Launch save and clear concurrently
      await Promise.all([save2(newConfig), clearForwardingConfig()]);

      // Final state should be either newConfig (if save won) or null (if clear won)
      const raw = readRawConfig();
      const final = raw.forwarding as ForwardingConfig | undefined;

      // Accept either outcome as valid
      expect([newConfig, null, undefined]).toContainEqual(final);
    });
  });
});
