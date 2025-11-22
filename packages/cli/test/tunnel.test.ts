import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localtunnel before importing the module
const mockTunnel = {
  url: 'https://test.loca.lt',
  on: vi.fn(),
  close: vi.fn()
};

vi.mock('localtunnel', () => ({
  default: vi.fn()
}));

import localtunnel from 'localtunnel';
import { createTunnel } from '../cli-src/tunnel';

describe('tunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createTunnel', () => {
    it('creates tunnel successfully on first attempt', async () => {
      (localtunnel as any).mockResolvedValueOnce(mockTunnel);

      const result = await createTunnel(9417, 'test-subdomain');

      expect(result.url).toBe('https://test.loca.lt');
      expect(result.provider).toBe('localtunnel');
      expect(localtunnel).toHaveBeenCalledWith({ port: 9417, subdomain: 'test-subdomain' });
    });

    it('creates tunnel without subdomain', async () => {
      (localtunnel as any).mockResolvedValueOnce(mockTunnel);

      const result = await createTunnel(9417);

      expect(result.url).toBe('https://test.loca.lt');
      expect(localtunnel).toHaveBeenCalledWith({ port: 9417 });
    });

    it('retries on retryable network errors', async () => {
      const networkError = new Error('Connection refused');
      (networkError as any).code = 'ECONNREFUSED';

      (localtunnel as any)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockTunnel);

      const result = await createTunnel(9417, undefined, 3);

      expect(result.url).toBe('https://test.loca.lt');
      expect(localtunnel).toHaveBeenCalledTimes(3);
    }, 10000);

    it('does not retry on EADDRINUSE error', async () => {
      const portError = new Error('Port already in use');
      (portError as any).code = 'EADDRINUSE';

      (localtunnel as any).mockRejectedValueOnce(portError);

      await expect(createTunnel(9417)).rejects.toThrow('Port already in use');
      expect(localtunnel).toHaveBeenCalledTimes(1);
    });

    it('does not retry on EACCES error', async () => {
      const permError = new Error('Permission denied');
      (permError as any).code = 'EACCES';

      (localtunnel as any).mockRejectedValueOnce(permError);

      await expect(createTunnel(9417)).rejects.toThrow('Permission denied');
      expect(localtunnel).toHaveBeenCalledTimes(1);
    });

    it('does not retry on subdomain unavailable error', async () => {
      const subdomainError = new Error('Subdomain is not available');

      (localtunnel as any).mockRejectedValueOnce(subdomainError);

      await expect(createTunnel(9417, 'taken-subdomain')).rejects.toThrow('Subdomain is not available');
      expect(localtunnel).toHaveBeenCalledTimes(1);
    });

    it('does not retry on unauthorized error', async () => {
      const authError = new Error('Unauthorized access');

      (localtunnel as any).mockRejectedValueOnce(authError);

      await expect(createTunnel(9417)).rejects.toThrow('Unauthorized');
      expect(localtunnel).toHaveBeenCalledTimes(1);
    });

    it('throws after max retries exhausted', async () => {
      const networkError = new Error('Connection timeout');

      (localtunnel as any)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      await expect(createTunnel(9417, undefined, 3)).rejects.toThrow('Connection timeout');
      expect(localtunnel).toHaveBeenCalledTimes(3);
    }, 15000);

    it('disconnect function closes the tunnel', async () => {
      (localtunnel as any).mockResolvedValueOnce(mockTunnel);

      const result = await createTunnel(9417);
      await result.disconnect();

      expect(mockTunnel.close).toHaveBeenCalled();
    });
  });
});
