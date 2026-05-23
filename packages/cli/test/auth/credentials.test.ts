import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getAuthDir,
  getAuthFilePath,
  loadCredentials,
  saveCredentials,
  clearCredentials,
  isExpired,
} from '../../cli-src/auth/credentials';
import type { CliAuthCredentials } from '../../cli-src/auth/types';

/**
 * Returns a valid CliAuthCredentials object with sensible defaults.
 * Individual fields can be overridden via the partial parameter.
 */
function makeCredentials(
  overrides: Partial<CliAuthCredentials> = {}
): CliAuthCredentials {
  return {
    user_id: 'user-abc-123',
    email: 'test@example.com',
    access_token: 'at_test_token_value',
    refresh_token: 'rt_test_token_value',
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('credentials', () => {
  // Must mirror getAuthDir()'s per-worker suffix so the test sees the same
  // path the implementation writes/reads. Workers can't collide because the
  // suffix differs per worker process.
  const workerId = process.env.VITEST_POOL_ID || String(process.pid);
  const testAuthDir = path.join(os.tmpdir(), `.agentmark-test-${workerId}`, path.sep);

  beforeEach(() => {
    // Clean the test auth directory before each test to guarantee isolation.
    if (fs.existsSync(testAuthDir)) {
      fs.rmSync(testAuthDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Also clean up AFTER each test. The auth.json this suite writes lives
    // in the per-worker tmp dir; leaving it behind leaks into any test in
    // the same worker that calls `loadCredentials()` without mocking
    // (e.g. the forwarder tests, which expect "no credentials → apiKey
    // fallback"). Cleanup on both sides means downstream tests never see
    // residual state.
    if (fs.existsSync(testAuthDir)) {
      fs.rmSync(testAuthDir, { recursive: true, force: true });
    }
  });

  describe('getAuthDir', () => {
    it('should return a path under os.tmpdir() in test environment', () => {
      const dir = getAuthDir();
      expect(dir).toContain(os.tmpdir());
      expect(dir).toContain('.agentmark-test');
    });
  });

  describe('getAuthFilePath', () => {
    it('should return auth.json inside the auth directory', () => {
      const filePath = getAuthFilePath();
      expect(filePath).toBe(path.join(testAuthDir, 'auth.json'));
    });
  });

  describe('save/load round-trip', () => {
    it('should return identical credentials after save and load', () => {
      const creds = makeCredentials();

      saveCredentials(creds);
      const loaded = loadCredentials();

      expect(loaded).not.toBeNull();
      expect(loaded!.user_id).toBe(creds.user_id);
      expect(loaded!.email).toBe(creds.email);
      expect(loaded!.access_token).toBe(creds.access_token);
      expect(loaded!.refresh_token).toBe(creds.refresh_token);
      expect(loaded!.expires_at).toBe(creds.expires_at);
      expect(loaded!.created_at).toBe(creds.created_at);
    });
  });

  describe('loadCredentials', () => {
    it('should return null when no credentials file exists', () => {
      const result = loadCredentials();
      expect(result).toBeNull();
    });

    it('should return null when the file contains invalid JSON', () => {
      // Ensure the directory exists so we can write garbage into the file.
      fs.mkdirSync(testAuthDir, { recursive: true });
      fs.writeFileSync(getAuthFilePath(), '{{not-valid-json!!!', 'utf-8');

      const result = loadCredentials();
      expect(result).toBeNull();
    });
  });

  describe('clearCredentials', () => {
    it('should delete the credentials file so load returns null', () => {
      saveCredentials(makeCredentials());
      // Verify the file exists before clearing.
      expect(fs.existsSync(getAuthFilePath())).toBe(true);

      clearCredentials();

      expect(loadCredentials()).toBeNull();
      expect(fs.existsSync(getAuthFilePath())).toBe(false);
    });

    it('should not throw when no credentials file exists', () => {
      // The directory itself may not even exist yet -- calling clearCredentials
      // must succeed without errors.
      expect(() => clearCredentials()).not.toThrow();
    });
  });

  describe('isExpired', () => {
    it('should return true when expires_at is in the past', () => {
      const creds = makeCredentials({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      });

      expect(isExpired(creds)).toBe(true);
    });

    it('should return false when expires_at is in the future', () => {
      const creds = makeCredentials({
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

      expect(isExpired(creds)).toBe(false);
    });

    it('should return true when expires_at equals the current time', () => {
      // The implementation uses >= so exactly-equal counts as expired.
      const now = Date.now();
      const creds = makeCredentials({
        expires_at: new Date(now).toISOString(),
      });

      // Pin Date.now to the same value for a deterministic assertion.
      const originalNow = Date.now;
      Date.now = () => now;
      try {
        expect(isExpired(creds)).toBe(true);
      } finally {
        Date.now = originalNow;
      }
    });
  });

  describe('saveCredentials', () => {
    it('should create the auth directory if it does not exist', () => {
      // Ensure the directory does not exist (beforeEach already cleaned it).
      expect(fs.existsSync(testAuthDir)).toBe(false);

      saveCredentials(makeCredentials());

      expect(fs.existsSync(testAuthDir)).toBe(true);
      expect(fs.existsSync(getAuthFilePath())).toBe(true);
    });

    it.skipIf(process.platform === 'win32')('should set file permissions to owner-only read/write (0o600)', () => {
      saveCredentials(makeCredentials());

      const stats = fs.statSync(getAuthFilePath());
      // Mask with 0o777 to get the permission bits only.
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });
});
