import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process before importing the module
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Mock the download module to avoid actual cloudflared downloads
vi.mock('../../cli-src/cloudflared/download', () => ({
  ensureCloudflared: vi.fn().mockResolvedValue('/mock/path/to/cloudflared')
}));

import { spawn } from 'child_process';
import { createTunnel } from '../../cli-src/cloudflared/tunnel';

const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

// Helper to create a mock child process
function createMockProcess(): ChildProcess & EventEmitter {
  const proc = new EventEmitter() as ChildProcess & EventEmitter;
  proc.stdout = new EventEmitter() as any;
  proc.stderr = new EventEmitter() as any;
  proc.pid = 12345;
  proc.killed = false;
  proc.kill = vi.fn().mockImplementation(() => {
    proc.killed = true;
    // Don't emit close synchronously - let the test control when close happens
    // This prevents race conditions with fake timers
    return true;
  });
  return proc;
}

describe('cloudflared tunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('createTunnel', () => {
    it('creates tunnel successfully when URL is emitted on stdout', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const tunnelPromise = createTunnel(9417);

      // Emit tunnel URL on stdout
      process.nextTick(() => {
        mockProcess.stdout?.emit('data', Buffer.from('INF +tunnel connector url=https://test-words-here.trycloudflare.com'));
      });

      await vi.runAllTimersAsync();
      const result = await tunnelPromise;

      expect(result.url).toBe('https://test-words-here.trycloudflare.com');
      expect(result.provider).toBe('cloudflared');
      expect(typeof result.disconnect).toBe('function');
      expect(mockSpawn).toHaveBeenCalledWith(
        '/mock/path/to/cloudflared',
        ['tunnel', '--url', 'http://localhost:9417'],
        expect.any(Object)
      );
    });

    it('creates tunnel successfully when URL is emitted on stderr', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const tunnelPromise = createTunnel(9417);

      // Emit tunnel URL on stderr (cloudflared may output to either)
      process.nextTick(() => {
        mockProcess.stderr?.emit('data', Buffer.from('https://another-test.trycloudflare.com is now live'));
      });

      await vi.runAllTimersAsync();
      const result = await tunnelPromise;

      expect(result.url).toBe('https://another-test.trycloudflare.com');
      expect(result.provider).toBe('cloudflared');
    });

    it('ignores subdomain parameter (trycloudflare.com generates random URLs)', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const tunnelPromise = createTunnel(9417, 'ignored-subdomain');

      process.nextTick(() => {
        mockProcess.stdout?.emit('data', Buffer.from('https://random-generated.trycloudflare.com'));
      });

      await vi.runAllTimersAsync();
      const result = await tunnelPromise;

      // Should still work, subdomain is ignored for trycloudflare.com
      expect(result.url).toBe('https://random-generated.trycloudflare.com');
    });

    it('retries on connection failure', async () => {
      let attemptCount = 0;

      mockSpawn.mockImplementation(() => {
        attemptCount++;
        const proc = createMockProcess();

        if (attemptCount < 3) {
          // First two attempts fail
          process.nextTick(() => {
            proc.emit('close', 1);
          });
        } else {
          // Third attempt succeeds
          process.nextTick(() => {
            proc.stdout?.emit('data', Buffer.from('https://success.trycloudflare.com'));
          });
        }

        return proc;
      });

      const tunnelPromise = createTunnel(9417);
      await vi.runAllTimersAsync();
      const result = await tunnelPromise;

      expect(result.url).toBe('https://success.trycloudflare.com');
      expect(attemptCount).toBe(3);
    });

    it('throws after max retries exhausted', async () => {
      mockSpawn.mockImplementation(() => {
        const proc = createMockProcess();
        process.nextTick(() => {
          proc.emit('close', 1);
        });
        return proc;
      });

      const tunnelPromise = createTunnel(9417);

      // Attach rejection handler immediately to prevent unhandled rejection
      let error: Error | null = null;
      tunnelPromise.catch((e) => { error = e; });

      await vi.runAllTimersAsync();

      // Wait for the promise to settle
      try {
        await tunnelPromise;
      } catch (e) {
        // Expected
      }

      expect(error).toBeTruthy();
      expect(error?.message).toContain('Failed to establish tunnel after 3 attempts');
    });

    it('disconnect function kills the tunnel process', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const tunnelPromise = createTunnel(9417);

      process.nextTick(() => {
        mockProcess.stdout?.emit('data', Buffer.from('https://test.trycloudflare.com'));
      });

      await vi.runAllTimersAsync();
      const result = await tunnelPromise;

      const disconnectPromise = result.disconnect();

      // Simulate process closing after kill
      process.nextTick(() => {
        mockProcess.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      await disconnectPromise;

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('times out if no URL received within timeout period', async () => {
      // Create mock processes for each retry attempt
      const mockProcesses: (ChildProcess & EventEmitter)[] = [];
      mockSpawn.mockImplementation(() => {
        const proc = createMockProcess();
        mockProcesses.push(proc);
        return proc;
      });

      const tunnelPromise = createTunnel(9417);

      // Attach rejection handler immediately to prevent unhandled rejection
      let error: Error | null = null;
      tunnelPromise.catch((e) => { error = e; });

      // For each retry attempt, advance past timeout and emit close after kill
      for (let i = 0; i < 3; i++) {
        // Advance past the 30 second timeout
        await vi.advanceTimersByTimeAsync(31000);

        // The process should have been killed, emit close
        if (mockProcesses[i]) {
          mockProcesses[i].emit('close', 0);
        }

        // Advance past the retry delay
        if (i < 2) {
          await vi.advanceTimersByTimeAsync(3000);
        }
      }

      // Wait for the promise to settle
      try {
        await tunnelPromise;
      } catch (e) {
        // Expected
      }

      expect(error).toBeTruthy();
      expect(error?.message).toContain('Failed to establish tunnel');
    }, 10000);

    it('handles process error events', async () => {
      // Create mock processes that all fail with errors
      mockSpawn.mockImplementation(() => {
        const proc = createMockProcess();
        process.nextTick(() => {
          proc.emit('error', new Error('spawn ENOENT'));
        });
        return proc;
      });

      const tunnelPromise = createTunnel(9417);

      // Attach rejection handler immediately to prevent unhandled rejection
      let error: Error | null = null;
      tunnelPromise.catch((e) => { error = e; });

      // Run through all retry attempts
      await vi.runAllTimersAsync();

      // Wait for the promise to settle
      try {
        await tunnelPromise;
      } catch (e) {
        // Expected
      }

      // The error gets wrapped in retry logic, so check for the final error message
      expect(error).toBeTruthy();
      expect(error?.message).toContain('Failed to establish tunnel');
    });
  });
});
