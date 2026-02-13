import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForwardingStatusReporter } from '../../cli-src/forwarding/status';
import { TraceForwarder } from '../../cli-src/forwarding/forwarder';

/**
 * Unit tests for status reporter (T037)
 * Feature: 013-trace-tunnel
 *
 * Tests:
 * - First send prints message
 * - 10th send prints count
 * - Error prints warning
 * - Buffer flush prints summary
 * - Format matches [trace-forward] prefix spec
 */

// Mock console
const consoleMock = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.stubGlobal('console', consoleMock);

// Mock fetch globally
global.fetch = vi.fn();

describe('ForwardingStatusReporter', () => {
  const mockConfig = {
    apiKey: 'sk_test',
    baseUrl: 'https://gateway.example.com',
    appId: 'app-123',
    appName: 'Test App',
    tenantId: 'tenant-123',
    apiKeyId: 'key-123',
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
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

  describe('first send message', () => {
    it('should print message when first trace is sent', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      forwarder.enqueue({ id: 1 });

      // Process the trace and wait for polling
      await vi.advanceTimersByTimeAsync(2000);

      expect(consoleMock.log).toHaveBeenCalledWith(
        '[trace-forward] ✓ First trace sent successfully'
      );
    });

    it('should only print first send message once', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      forwarder.enqueue({ id: 1 });
      await vi.advanceTimersByTimeAsync(2000);

      consoleMock.log.mockClear();

      forwarder.enqueue({ id: 2 });
      await vi.advanceTimersByTimeAsync(2000);

      // Should NOT print first send message again
      expect(consoleMock.log).not.toHaveBeenCalledWith(
        '[trace-forward] ✓ First trace sent successfully'
      );
    });

    it('should not print first send message if first trace fails', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      forwarder.enqueue({ id: 1 });

      await vi.advanceTimersByTimeAsync(10000);

      expect(consoleMock.log).not.toHaveBeenCalledWith(
        '[trace-forward] ✓ First trace sent successfully'
      );
    });
  });

  describe('10th send count', () => {
    it('should print count every 10th trace sent', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      // Send 15 traces
      for (let i = 1; i <= 15; i++) {
        forwarder.enqueue({ id: i });
      }

      // Wait longer to ensure all traces are processed
      await vi.advanceTimersByTimeAsync(10000);

      // Should print at 10th trace
      expect(consoleMock.log).toHaveBeenCalledWith(
        '[trace-forward] ✓ 10 traces sent'
      );

      // Should not print at 11-14
      expect(consoleMock.log).not.toHaveBeenCalledWith(
        '[trace-forward] ✓ 11 traces sent'
      );
      expect(consoleMock.log).not.toHaveBeenCalledWith(
        '[trace-forward] ✓ 14 traces sent'
      );
    });

    it('should print count at 20, 30, etc.', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      // Send 25 traces
      for (let i = 1; i <= 25; i++) {
        forwarder.enqueue({ id: i });
      }

      await vi.advanceTimersByTimeAsync(10000);

      expect(consoleMock.log).toHaveBeenCalledWith(
        '[trace-forward] ✓ 10 traces sent'
      );
      expect(consoleMock.log).toHaveBeenCalledWith(
        '[trace-forward] ✓ 20 traces sent'
      );
      expect(consoleMock.log).not.toHaveBeenCalledWith(
        '[trace-forward] ✓ 25 traces sent'
      );
    });

    it('should not print count for non-multiple-of-10', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      // Send 7 traces
      for (let i = 1; i <= 7; i++) {
        forwarder.enqueue({ id: i });
      }

      await vi.advanceTimersByTimeAsync(5000);

      // Should only print first send message, not count
      expect(consoleMock.log).toHaveBeenCalledTimes(1);
      expect(consoleMock.log).toHaveBeenCalledWith(
        '[trace-forward] ✓ First trace sent successfully'
      );
    });
  });

  describe('prefix format', () => {
    it('should prefix all messages with [trace-forward]', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      forwarder.enqueue({ id: 1 });

      await vi.advanceTimersByTimeAsync(2000);

      expect(consoleMock.log).toHaveBeenCalledWith(
        expect.stringContaining('[trace-forward]')
      );
    });

    it('should use checkmark for success messages', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      forwarder.enqueue({ id: 1 });

      await vi.advanceTimersByTimeAsync(2000);

      expect(consoleMock.log).toHaveBeenCalledWith(
        expect.stringContaining('✓')
      );
    });
  });

  describe('polling interval', () => {
    it('should poll every second to check for changes', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      forwarder.enqueue({ id: 1 });

      // Advance timers by 500ms (less than 1 second)
      await vi.advanceTimersByTimeAsync(500);

      // Should not report yet
      expect(consoleMock.log).not.toHaveBeenCalled();

      // Advance to 1 second
      await vi.advanceTimersByTimeAsync(500);

      // Now should report
      expect(consoleMock.log).toHaveBeenCalledWith(
        '[trace-forward] ✓ First trace sent successfully'
      );
    });

    it('should continue polling after first report', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      // Send first batch
      for (let i = 1; i <= 5; i++) {
        forwarder.enqueue({ id: i });
      }

      await vi.advanceTimersByTimeAsync(1000);
      expect(consoleMock.log).toHaveBeenCalledWith(
        '[trace-forward] ✓ First trace sent successfully'
      );

      consoleMock.log.mockClear();

      // Send second batch to reach 10
      for (let i = 6; i <= 10; i++) {
        forwarder.enqueue({ id: i });
      }

      await vi.advanceTimersByTimeAsync(1000);

      expect(consoleMock.log).toHaveBeenCalledWith(
        '[trace-forward] ✓ 10 traces sent'
      );
    });
  });

  describe('multiple reporters', () => {
    it('should allow multiple reporters for same forwarder', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);
      new ForwardingStatusReporter(forwarder);

      forwarder.enqueue({ id: 1 });

      await vi.advanceTimersByTimeAsync(2000);

      // Both reporters should log (message appears twice)
      const calls = consoleMock.log.mock.calls.filter((call) =>
        call[0].includes('First trace sent successfully')
      );
      expect(calls.length).toBe(2);
    });
  });

  describe('reporter lifecycle', () => {
    it('should start monitoring on construction', () => {
      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      // Verify that setInterval was called (via timer count)
      const timerCount = vi.getTimerCount();
      expect(timerCount).toBeGreaterThan(0);
    });

    it('should continue monitoring even when no traces are sent', async () => {
      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      // Advance timers multiple seconds with no traces
      await vi.advanceTimersByTimeAsync(5000);

      // Should not crash or log anything
      expect(consoleMock.log).not.toHaveBeenCalled();
    });
  });

  describe('stats tracking', () => {
    it('should not report same count twice', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const forwarder = new TraceForwarder(mockConfig);
      new ForwardingStatusReporter(forwarder);

      // Send exactly 10 traces
      for (let i = 1; i <= 10; i++) {
        forwarder.enqueue({ id: i });
      }

      await vi.advanceTimersByTimeAsync(3000);

      const count10Calls = consoleMock.log.mock.calls.filter((call) =>
        call[0].includes('10 traces sent')
      );

      // Should only report "10 traces sent" once
      expect(count10Calls.length).toBe(1);

      // Poll again
      await vi.advanceTimersByTimeAsync(1000);

      const count10CallsAfter = consoleMock.log.mock.calls.filter((call) =>
        call[0].includes('10 traces sent')
      );

      // Should still be only once
      expect(count10CallsAfter.length).toBe(1);
    });
  });
});
