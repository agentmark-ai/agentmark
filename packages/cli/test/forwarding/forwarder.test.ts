import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TraceForwarder } from '../../cli-src/forwarding/forwarder';

/**
 * Unit tests for TraceForwarder (T030)
 * Feature: 013-trace-tunnel
 *
 * Tests:
 * - Enqueue adds to queue
 * - Successful forward sends HTTP POST with correct headers
 * - Retry on network error (3 attempts with backoff)
 * - Stop on 401
 * - Respect 429 Retry-After
 * - Buffer max 100 (oldest evicted)
 * - Flush sends all buffered traces
 * - Flush timeout returns unflushed count
 * - getStats tracks sent/failed/buffered
 */

// Mock console to avoid test output clutter
const consoleMock = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.stubGlobal('console', consoleMock);

// Mock fetch globally
global.fetch = vi.fn();

describe('TraceForwarder', () => {
  const validConfig = {
    apiKey: 'sk_agentmark_dev_test123',
    baseUrl: 'https://gateway.example.com',
    appId: 'app-test-123',
    appName: 'Test App',
    tenantId: 'tenant-123',
    apiKeyId: 'key-id-123',
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  };

  const sampleTrace = {
    resourceSpans: [
      {
        resource: { attributes: [] },
        scopeSpans: [{ scope: { name: 'test' }, spans: [] }],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    consoleMock.log.mockClear();
    consoleMock.warn.mockClear();
    consoleMock.error.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should throw error when config is missing required fields', () => {
      expect(() => new TraceForwarder({} as any)).toThrow(
        'Invalid forwarding config: missing required fields'
      );
    });

    it('should accept valid config without throwing', () => {
      expect(() => new TraceForwarder(validConfig)).not.toThrow();
    });
  });

  describe('enqueue', () => {
    it('should add trace to queue', () => {
      const forwarder = new TraceForwarder(validConfig);

      forwarder.enqueue(sampleTrace);

      const stats = forwarder.getStats();
      expect(stats.buffered).toBe(1);
    });

    it('should not enqueue after forwarder is stopped', () => {
      const forwarder = new TraceForwarder(validConfig);

      forwarder.stop();
      forwarder.enqueue(sampleTrace);

      const stats = forwarder.getStats();
      expect(stats.buffered).toBe(0);
    });

    it('should evict oldest trace when queue exceeds 100', () => {
      const forwarder = new TraceForwarder(validConfig);

      // Fill queue beyond max size
      for (let i = 0; i < 105; i++) {
        forwarder.enqueue({ id: i });
      }

      const stats = forwarder.getStats();
      expect(stats.buffered).toBe(100);
      expect(consoleMock.warn).toHaveBeenCalledWith(
        '[trace-forward] ⚠️  Queue full, dropped oldest trace'
      );
    });
  });

  describe('successful forward', () => {
    it('should send HTTP POST with correct headers', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(validConfig);
      forwarder.enqueue(sampleTrace);

      await vi.runAllTimersAsync();

      expect(global.fetch).toHaveBeenCalledWith(
        `${validConfig.baseUrl}/v1/traces`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: validConfig.apiKey,
            'X-Agentmark-App-Id': validConfig.appId,
          }),
          body: JSON.stringify(sampleTrace),
        })
      );

      const stats = forwarder.getStats();
      expect(stats.sent).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.buffered).toBe(0);
    });

    it('should treat 202 response as success', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 202,
      });

      const forwarder = new TraceForwarder(validConfig);
      forwarder.enqueue(sampleTrace);

      await vi.runAllTimersAsync();

      const stats = forwarder.getStats();
      expect(stats.sent).toBe(1);
      expect(stats.failed).toBe(0);
    });
  });

  describe('retry on network error', () => {
    it('should retry 3 times with exponential backoff', async () => {
      let attemptCount = 0;
      (global.fetch as any).mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ ok: true, status: 200 });
      });

      const forwarder = new TraceForwarder(validConfig);
      forwarder.enqueue(sampleTrace);

      await vi.runAllTimersAsync();

      // Should retry 3 times: initial + 3 retries = 4 total attempts
      expect(attemptCount).toBe(4);

      const stats = forwarder.getStats();
      expect(stats.sent).toBe(1);
      expect(stats.failed).toBe(0);
    });

    it('should fail after 3 retries with no success', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const forwarder = new TraceForwarder(validConfig);
      forwarder.enqueue(sampleTrace);

      await vi.runAllTimersAsync();

      // Should attempt 4 times (initial + 3 retries)
      expect(global.fetch).toHaveBeenCalledTimes(4);

      const stats = forwarder.getStats();
      expect(stats.sent).toBe(0);
      expect(stats.failed).toBe(1);
      expect(consoleMock.error).toHaveBeenCalledWith(
        '[trace-forward] ✗ Failed to forward trace after 4 attempts'
      );
    });

    it('should use exponential backoff delays (1s, 2s, 4s)', async () => {
      let attemptCount = 0;
      (global.fetch as any).mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ ok: true });
      });

      const forwarder = new TraceForwarder(validConfig);
      forwarder.enqueue(sampleTrace);

      // Initial attempt
      await vi.advanceTimersByTimeAsync(0);
      expect(attemptCount).toBe(1);

      // First retry (1s delay)
      await vi.advanceTimersByTimeAsync(1000);
      expect(attemptCount).toBe(2);

      // Second retry (2s delay)
      await vi.advanceTimersByTimeAsync(2000);
      expect(attemptCount).toBe(3);

      // Third retry (4s delay)
      await vi.advanceTimersByTimeAsync(4000);
      expect(attemptCount).toBe(4);
    });
  });

  describe('stop on 401', () => {
    it('should stop forwarding and log error on 401 response', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
      });

      const forwarder = new TraceForwarder(validConfig);
      forwarder.enqueue(sampleTrace);

      await vi.runAllTimersAsync();

      expect(consoleMock.error).toHaveBeenCalledWith(
        "[trace-forward] ✗ Auth expired. Run 'agentmark login' to re-authenticate."
      );

      const stats = forwarder.getStats();
      expect(stats.sent).toBe(0);
      expect(stats.failed).toBe(1);

      // Should not retry
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should not process more traces after 401', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
      });

      const forwarder = new TraceForwarder(validConfig);
      forwarder.enqueue({ id: 1 });
      forwarder.enqueue({ id: 2 });

      await vi.runAllTimersAsync();

      // Should only attempt to send first trace
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const stats = forwarder.getStats();
      expect(stats.failed).toBe(1);
      // Second trace should remain buffered
      expect(stats.buffered).toBeGreaterThan(0);
    });
  });

  describe('respect 429 Retry-After', () => {
    it('should wait for Retry-After seconds before retrying', async () => {
      let attemptCount = 0;
      (global.fetch as any).mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: new Map([['Retry-After', '5']]),
            get: (key: string) => (key === 'Retry-After' ? '5' : null),
          });
        }
        return Promise.resolve({ ok: true });
      });

      const forwarder = new TraceForwarder(validConfig);
      forwarder.enqueue(sampleTrace);

      // Initial attempt
      await vi.advanceTimersByTimeAsync(0);
      expect(attemptCount).toBe(1);
      expect(consoleMock.warn).toHaveBeenCalledWith(
        '[trace-forward] ⚠️  Rate limited, retrying after 5s'
      );

      // Should wait 5 seconds before retry
      await vi.advanceTimersByTimeAsync(5000);
      expect(attemptCount).toBe(2);

      const stats = forwarder.getStats();
      expect(stats.sent).toBe(1);
    });

    it('should handle 429 without Retry-After header', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map(),
          get: () => null,
        })
        .mockResolvedValueOnce({ ok: true });

      const forwarder = new TraceForwarder(validConfig);
      forwarder.enqueue(sampleTrace);

      await vi.runAllTimersAsync();

      // Should use regular retry logic (1s delay)
      expect(global.fetch).toHaveBeenCalledTimes(2);

      const stats = forwarder.getStats();
      expect(stats.sent).toBe(1);
    });
  });

  describe('rate limiting', () => {
    it('should not exceed 50 forwards per second', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(validConfig);

      // Enqueue 60 traces rapidly
      for (let i = 0; i < 60; i++) {
        forwarder.enqueue({ id: i });
      }

      // Advance by 1 second
      await vi.advanceTimersByTimeAsync(1000);

      const stats = forwarder.getStats();
      // Should only send 50 in the first second
      expect(stats.sent).toBeLessThanOrEqual(50);

      // Advance by another second to process remaining
      await vi.advanceTimersByTimeAsync(1000);

      const finalStats = forwarder.getStats();
      expect(finalStats.sent).toBe(60);
    });

    it('should log warning when rate limit is hit', () => {
      const forwarder = new TraceForwarder(validConfig);

      // Enqueue 60 traces
      for (let i = 0; i < 60; i++) {
        forwarder.enqueue({ id: i });
      }

      expect(consoleMock.warn).toHaveBeenCalledWith(
        '[trace-forward] ⚠️  Rate limit exceeded, buffering trace'
      );
    });
  });

  describe('flush', () => {
    it('should send all buffered traces', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(validConfig);

      forwarder.enqueue({ id: 1 });
      forwarder.enqueue({ id: 2 });
      forwarder.enqueue({ id: 3 });

      const unflushed = await forwarder.flush();

      expect(unflushed).toBe(0);

      const stats = forwarder.getStats();
      expect(stats.sent).toBe(3);
      expect(stats.buffered).toBe(0);
    });

    it('should return unflushed count when timeout is reached', async () => {
      // Mock slow network - never resolves
      (global.fetch as any).mockImplementation(
        () =>
          new Promise((resolve) => {
            // Never resolve within timeout
          })
      );

      const forwarder = new TraceForwarder(validConfig);

      forwarder.enqueue({ id: 1 });
      forwarder.enqueue({ id: 2 });
      forwarder.enqueue({ id: 3 });

      // Start flush with 100ms timeout
      const flushPromise = forwarder.flush(100);

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(200);

      const unflushed = await flushPromise;

      expect(unflushed).toBeGreaterThan(0);
    });

    it('should handle partial flush within timeout', async () => {
      let callCount = 0;
      (global.fetch as any).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({ ok: true });
        }
        // Third call never resolves
        return new Promise(() => {});
      });

      const forwarder = new TraceForwarder(validConfig);

      forwarder.enqueue({ id: 1 });
      forwarder.enqueue({ id: 2 });
      forwarder.enqueue({ id: 3 });

      const flushPromise = forwarder.flush(500);
      await vi.advanceTimersByTimeAsync(600);

      const unflushed = await flushPromise;

      expect(unflushed).toBe(1);

      const stats = forwarder.getStats();
      expect(stats.sent).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should track sent, failed, and buffered counts', async () => {
      let callCount = 0;
      (global.fetch as any).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({ ok: true });
        }
        return Promise.reject(new Error('Network error'));
      });

      const forwarder = new TraceForwarder(validConfig);

      forwarder.enqueue({ id: 1 });
      forwarder.enqueue({ id: 2 });
      forwarder.enqueue({ id: 3 });

      const initialStats = forwarder.getStats();
      expect(initialStats.buffered).toBeGreaterThanOrEqual(1);
      expect(initialStats.sent).toBe(0);
      expect(initialStats.failed).toBe(0);

      await vi.advanceTimersByTimeAsync(20000);

      const finalStats = forwarder.getStats();
      expect(finalStats.sent).toBe(2);
      expect(finalStats.failed).toBe(1);
      expect(finalStats.buffered).toBe(0);
    });

    it('should return a copy of stats, not a reference', () => {
      const forwarder = new TraceForwarder(validConfig);

      const stats1 = forwarder.getStats();
      const stats2 = forwarder.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe('request timeout', () => {
    it('should timeout request after 10 seconds', async () => {
      (global.fetch as any).mockImplementation(
        () =>
          new Promise(() => {
            // Never resolves - simulates hanging request
          })
      );

      const forwarder = new TraceForwarder(validConfig);
      forwarder.enqueue(sampleTrace);

      // Advance to process and timeout (10s timeout + retries)
      await vi.advanceTimersByTimeAsync(50000);

      const stats = forwarder.getStats();
      expect(stats.failed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('concurrent processing', () => {
    it('should process traces sequentially, not in parallel', async () => {
      let activeRequests = 0;
      let maxConcurrent = 0;

      (global.fetch as any).mockImplementation(async () => {
        activeRequests++;
        maxConcurrent = Math.max(maxConcurrent, activeRequests);

        await new Promise((resolve) => setTimeout(resolve, 10));

        activeRequests--;
        return { ok: true };
      });

      const forwarder = new TraceForwarder(validConfig);

      forwarder.enqueue({ id: 1 });
      forwarder.enqueue({ id: 2 });
      forwarder.enqueue({ id: 3 });

      await vi.advanceTimersByTimeAsync(2000);

      // Should process one at a time
      expect(maxConcurrent).toBe(1);

      const stats = forwarder.getStats();
      expect(stats.sent).toBe(3);
    });
  });
});
