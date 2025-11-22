import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  verifyWebhookSignature,
  shouldSkipVerification,
  getWebhookSecret
} from '../cli-src/runner-server/middleware/signature-verification';

// Mock the shared-utils module
vi.mock('@agentmark/shared-utils', () => ({
  verifySignature: vi.fn()
}));

import { verifySignature } from '@agentmark/shared-utils';

describe('signature-verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyWebhookSignature', () => {
    it('returns true for valid signature', async () => {
      (verifySignature as any).mockResolvedValueOnce(true);

      const result = await verifyWebhookSignature('body', 'signature', 'secret');

      expect(result).toBe(true);
      expect(verifySignature).toHaveBeenCalledWith('secret', 'signature', 'body');
    });

    it('returns false for invalid signature', async () => {
      (verifySignature as any).mockResolvedValueOnce(false);

      const result = await verifyWebhookSignature('body', 'signature', 'wrong-secret');

      expect(result).toBe(false);
    });

    it('returns false when verification throws', async () => {
      (verifySignature as any).mockRejectedValueOnce(new Error('Crypto error'));

      const result = await verifyWebhookSignature('body', 'signature', 'secret');

      expect(result).toBe(false);
    });
  });

  describe('shouldSkipVerification', () => {
    it('returns true when skipVerification is true', () => {
      const result = shouldSkipVerification({
        secret: 'secret',
        skipVerification: true
      });
      expect(result).toBe(true);
    });

    it('returns true when secret is empty', () => {
      const result = shouldSkipVerification({
        secret: ''
      });
      expect(result).toBe(true);
    });

    it('returns true when secret is DEFAULT', () => {
      const result = shouldSkipVerification({
        secret: 'DEFAULT'
      });
      expect(result).toBe(true);
    });

    it('returns false when secret is provided and skipVerification is false', () => {
      const result = shouldSkipVerification({
        secret: 'my-secret',
        skipVerification: false
      });
      expect(result).toBe(false);
    });

    it('returns false when only secret is provided', () => {
      const result = shouldSkipVerification({
        secret: 'my-secret'
      });
      expect(result).toBe(false);
    });
  });

  describe('getWebhookSecret', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('returns env var value when set', () => {
      process.env.AGENTMARK_WEBHOOK_SECRET = 'env-secret';
      const result = getWebhookSecret();
      expect(result).toBe('env-secret');
    });

    it('returns fallback when env var not set', () => {
      delete process.env.AGENTMARK_WEBHOOK_SECRET;
      const result = getWebhookSecret('AGENTMARK_WEBHOOK_SECRET', 'fallback-secret');
      expect(result).toBe('fallback-secret');
    });

    it('returns undefined when neither env nor fallback available', () => {
      delete process.env.AGENTMARK_WEBHOOK_SECRET;
      const result = getWebhookSecret();
      expect(result).toBeUndefined();
    });

    it('uses custom env var name', () => {
      process.env.CUSTOM_SECRET = 'custom-secret';
      const result = getWebhookSecret('CUSTOM_SECRET');
      expect(result).toBe('custom-secret');
    });
  });
});
