/**
 * Trace Forwarding Service
 * Feature: 013-trace-tunnel
 *
 * Forwards locally-generated traces to the platform gateway in near-real-time.
 *
 * Per forwarding-protocol.md:
 * - In-memory FIFO queue (max 100)
 * - Async HTTP POST with Authorization and X-Agentmark-App-Id headers
 * - Retry policy: 3 retries with exponential backoff (1s, 2s, 4s)
 * - 10s timeout per request
 * - Handle 401 → stop forwarding, 429 → respect Retry-After
 * - Rate limiting: max 50 forwards/second
 */

import { ForwardingConfig } from './config';

interface ForwardingStats {
  sent: number;
  failed: number;
  buffered: number;
}

type TracePayload = Record<string, unknown>;

const MAX_QUEUE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000]; // Exponential backoff
const MAX_FORWARDS_PER_SECOND = 50;

export class TraceForwarder {
  private config: ForwardingConfig;
  private queue: TracePayload[] = [];
  private stats: ForwardingStats = { sent: 0, failed: 0, buffered: 0 };
  private isStopped = false;
  private processingPromise: Promise<void> | null = null;
  private forwardCount = 0;
  private forwardWindowStart = Date.now();

  constructor(config: ForwardingConfig) {
    if (!config.apiKey || !config.baseUrl || !config.appId) {
      throw new Error('Invalid forwarding config: missing required fields');
    }
    this.config = config;
  }

  /**
   * Enqueues a trace payload for forwarding.
   * Drops oldest trace if queue is full.
   * Never throws — forwarding failures are non-fatal by design.
   */
  enqueue(payload: TracePayload): void {
    try {
      if (this.isStopped) {
        return;
      }

      // Check rate limit
      if (!this.checkRateLimit()) {
        console.warn('[trace-forward] ⚠️  Rate limit exceeded, buffering trace');
      }

      // Add to queue
      this.queue.push(payload);

      // Drop oldest if queue exceeds max size
      if (this.queue.length > MAX_QUEUE_SIZE) {
        this.queue.shift();
        console.warn('[trace-forward] ⚠️  Queue full, dropped oldest trace');
      }

      this.stats.buffered = this.queue.length;

      // Start processing if not already running
      if (!this.processingPromise) {
        this.processingPromise = this.processQueue();
      }
    } catch {
      // Silently drop — caller (API server) must never be affected by forwarding issues
    }
  }

  /**
   * Checks if we're within the rate limit.
   * Resets the window every second.
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const elapsed = now - this.forwardWindowStart;

    // Reset window every second
    if (elapsed >= 1000) {
      this.forwardCount = 0;
      this.forwardWindowStart = now;
    }

    return this.forwardCount < MAX_FORWARDS_PER_SECOND;
  }

  /**
   * Processes queued traces asynchronously.
   */
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && !this.isStopped) {
      const payload = this.queue.shift();
      if (!payload) break;

      this.stats.buffered = this.queue.length;

      // Check rate limit before forwarding
      while (!this.checkRateLimit()) {
        await sleep(100); // Wait briefly before retrying
      }

      const success = await this.forwardWithRetry(payload);

      if (success) {
        this.stats.sent++;
        this.forwardCount++;
      } else {
        this.stats.failed++;
      }
    }

    this.processingPromise = null;
  }

  /**
   * Forwards a single trace with retry logic.
   */
  private async forwardWithRetry(payload: TracePayload): Promise<boolean> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const result = await this.forwardOnce(payload);

      if (result.success) {
        return true;
      }

      // Stop forwarding on 401 (auth failure)
      if (result.status === 401) {
        console.error(
          '[trace-forward] ✗ Auth expired. Run \'agentmark login\' to re-authenticate.'
        );
        this.stop();
        return false;
      }

      // Respect Retry-After on 429
      if (result.status === 429 && result.retryAfter) {
        const delay = result.retryAfter * 1000;
        console.warn(
          `[trace-forward] ⚠️  Rate limited, retrying after ${result.retryAfter}s`
        );
        await sleep(delay);
        continue;
      }

      // Retry on network error or 5xx
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt];
        await sleep(delay);
        continue;
      }

      // All retries exhausted
      console.error(
        `[trace-forward] ✗ Failed to forward trace after ${MAX_RETRIES + 1} attempts`
      );
      return false;
    }

    return false;
  }

  /**
   * Attempts to forward a trace once.
   */
  private async forwardOnce(
    payload: TracePayload
  ): Promise<{ success: boolean; status?: number; retryAfter?: number }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
      );

      const response = await fetch(`${this.config.baseUrl}/v1/traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.config.apiKey!,
          'X-Agentmark-App-Id': this.config.appId!,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok || response.status === 202) {
        return { success: true };
      }

      // Extract Retry-After header for 429
      let retryAfter: number | undefined;
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        if (retryAfterHeader) {
          retryAfter = parseInt(retryAfterHeader, 10);
        }
      }

      return { success: false, status: response.status, retryAfter };
    } catch (error) {
      // Network error or timeout
      return { success: false };
    }
  }

  /**
   * Flushes all buffered traces with a timeout.
   * Returns the number of traces that could not be flushed.
   */
  async flush(timeoutMs: number = 5000): Promise<number> {
    const startTime = Date.now();

    // Wait for current processing to finish or timeout
    while (this.queue.length > 0 && Date.now() - startTime < timeoutMs) {
      await sleep(100);
    }

    return this.queue.length;
  }

  /**
   * Stops the forwarder.
   * No more traces will be accepted after calling stop().
   */
  stop(): void {
    this.isStopped = true;
  }

  /**
   * Returns current forwarding statistics.
   */
  getStats(): ForwardingStats {
    return { ...this.stats };
  }
}

/**
 * Sleep helper for retry delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
