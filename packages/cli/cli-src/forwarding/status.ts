/**
 * Forwarding Status Reporter
 * Feature: 013-trace-tunnel
 *
 * Subscribes to TraceForwarder events and formats console output.
 *
 * Per forwarding-protocol.md:
 * - Print on first send
 * - Print every 10th send
 * - Print on every error
 * - Print on buffer flush
 * - All messages prefixed with [trace-forward]
 */

import type { TraceForwarder } from './forwarder';

export class ForwardingStatusReporter {
  private forwarder: TraceForwarder;
  private lastReportedSent = 0;

  constructor(forwarder: TraceForwarder) {
    this.forwarder = forwarder;
    this.startMonitoring();
  }

  /**
   * Starts monitoring the forwarder and reporting status.
   * Uses polling since we don't have an event system in TraceForwarder.
   */
  private startMonitoring(): void {
    // Poll every second to check for changes
    setInterval(() => {
      const stats = this.forwarder.getStats();

      // Report on first send
      if (stats.sent === 1 && this.lastReportedSent === 0) {
        console.log('[trace-forward] ✓ First trace sent successfully');
        this.lastReportedSent = stats.sent;
      }

      // Report every 10th send
      if (stats.sent > this.lastReportedSent && stats.sent % 10 === 0) {
        console.log(`[trace-forward] ✓ ${stats.sent} traces sent`);
        this.lastReportedSent = stats.sent;
      }

      // Note: Errors and buffer flushes are logged directly in TraceForwarder
      // We don't need to poll for those events here
    }, 1000);
  }
}
