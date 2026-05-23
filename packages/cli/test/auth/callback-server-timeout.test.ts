import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startCallbackServer } from '../../cli-src/auth/callback-server';

/**
 * Tests for the configurable timeout on the OAuth callback server.
 *
 * Catches the regression class where the 30s → 120s bump (or any future
 * override-via-arg refactor) reverts to a hardcoded constant and breaks
 * the agent-driven login flow. Bumping the default but leaving the arg
 * unused would silently pass static analysis; the rejection-timing
 * assertion below pins it.
 */

describe('startCallbackServer timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects with "Login timed out" after the explicit timeout when no callback arrives', async () => {
    const { waitForCallback, close } = await startCallbackServer('expected_state', 500);

    const callbackPromise = waitForCallback();
    // Advance timers past the 500ms window.
    vi.advanceTimersByTime(600);

    await expect(callbackPromise).rejects.toThrow('Login timed out');
    close();
  });

  it('honors the timeout argument over the default (different values produce different windows)', async () => {
    // Sanity: with a 100ms timeout, rejection happens after 100ms but NOT after 50ms.
    const { waitForCallback, close } = await startCallbackServer('s', 100);
    const p = waitForCallback();

    vi.advanceTimersByTime(50);
    // Promise should still be pending — give microtasks a chance to settle.
    let settled = false;
    p.catch(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    vi.advanceTimersByTime(60);
    await expect(p).rejects.toThrow('Login timed out');
    close();
  });

  it('uses the default of 120 seconds (2 minutes) when no timeout argument is given', async () => {
    const { waitForCallback, close } = await startCallbackServer('s');
    const p = waitForCallback();

    // Should still be pending at 30s (the old hardcoded value).
    vi.advanceTimersByTime(30_000);
    let settled = false;
    p.catch(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    // Still pending at 119s.
    vi.advanceTimersByTime(89_000);
    await Promise.resolve();
    expect(settled).toBe(false);

    // Rejects right after the 120s boundary.
    vi.advanceTimersByTime(2_000);
    await expect(p).rejects.toThrow('Login timed out');
    close();
  });
});
