import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localtunnel before importing the module
vi.mock('localtunnel', () => {
  return {
    default: vi.fn()
  };
});

import localtunnel from 'localtunnel';
import { createTunnel } from '../cli-src/tunnel';

// Get a typed reference to the mocked localtunnel
const mockLocaltunnel = localtunnel as unknown as ReturnType<typeof vi.fn>;

// Helper to create a mock tunnel object
function createMockTunnel(url: string | null) {
  return {
    url,
    close: vi.fn(),
    on: vi.fn() // localtunnel returns an EventEmitter-like object
  };
}

describe('tunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock implementation - successful tunnel by default
    mockLocaltunnel.mockResolvedValue(createMockTunnel('https://test-subdomain.loca.lt'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createTunnel', () => {
    it('creates tunnel successfully on first attempt', async () => {
      const result = await createTunnel(9417, 'test-subdomain');

      expect(result.url).toBe('https://test-subdomain.loca.lt');
      expect(result.provider).toBe('localtunnel');
      expect(mockLocaltunnel).toHaveBeenCalledWith({ port: 9417, subdomain: 'test-subdomain' });
    });

    it('creates tunnel without subdomain', async () => {
      mockLocaltunnel.mockResolvedValue(createMockTunnel('https://random-slug.loca.lt'));

      const result = await createTunnel(9417);

      expect(result.url).toBe('https://random-slug.loca.lt');
      expect(mockLocaltunnel).toHaveBeenCalledWith({ port: 9417 });
    });

    it('retries on retryable network errors', async () => {
      const networkError = new Error('Connection refused');
      (networkError as any).code = 'ECONNREFUSED';

      mockLocaltunnel
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(createMockTunnel('https://test-subdomain.loca.lt'));

      const result = await createTunnel(9417, 'test-subdomain', 3);

      expect(result.url).toBe('https://test-subdomain.loca.lt');
      expect(mockLocaltunnel).toHaveBeenCalledTimes(3);
    }, 15000);

    it('does not retry on EADDRINUSE error', async () => {
      const error = new Error('Port already in use');
      (error as any).code = 'EADDRINUSE';

      mockLocaltunnel.mockRejectedValue(error);

      await expect(createTunnel(9417)).rejects.toThrow('Port already in use');
      expect(mockLocaltunnel).toHaveBeenCalledTimes(1);
    });

    it('does not retry on EACCES error', async () => {
      const error = new Error('Permission denied');
      (error as any).code = 'EACCES';

      mockLocaltunnel.mockRejectedValue(error);

      await expect(createTunnel(9417)).rejects.toThrow('Permission denied');
      expect(mockLocaltunnel).toHaveBeenCalledTimes(1);
    });

    it('does not retry on unauthorized error', async () => {
      mockLocaltunnel.mockRejectedValue(new Error('Unauthorized access'));

      await expect(createTunnel(9417)).rejects.toThrow('Unauthorized');
      expect(mockLocaltunnel).toHaveBeenCalledTimes(1);
    });

    it('does not retry on subdomain not available error', async () => {
      mockLocaltunnel.mockRejectedValue(new Error('subdomain is not available'));

      await expect(createTunnel(9417, 'taken-subdomain')).rejects.toThrow('subdomain is not available');
      expect(mockLocaltunnel).toHaveBeenCalledTimes(1);
    });

    it('throws after max retries exhausted', async () => {
      mockLocaltunnel.mockRejectedValue(new Error('Connection timeout'));

      await expect(createTunnel(9417, undefined, 3)).rejects.toThrow('Connection timeout');
      expect(mockLocaltunnel).toHaveBeenCalledTimes(3);
    }, 15000);

    it('disconnect function closes the tunnel', async () => {
      const mockTunnel = createMockTunnel('https://test-subdomain.loca.lt');
      mockLocaltunnel.mockResolvedValue(mockTunnel);

      const result = await createTunnel(9417);
      await result.disconnect();

      expect(mockTunnel.close).toHaveBeenCalled();
    });

    it('throws if localtunnel returns no URL', async () => {
      mockLocaltunnel.mockResolvedValue(createMockTunnel(null));

      await expect(createTunnel(9417, undefined, 1)).rejects.toThrow('did not return a URL');
    });
  });
});
