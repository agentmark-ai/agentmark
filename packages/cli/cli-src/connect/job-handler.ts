/**
 * Job handler for the AgentMark Connect protocol.
 *
 * Receives job messages from the platform via the WebSocketClient,
 * proxies execution to the local webhook server (which runs in a
 * separate child process), and streams results back through the
 * WebSocket connection.
 */

import type { WebSocketClient } from '@agentmark-ai/connect';
import type { JobMessage, JobCancelMessage } from '@agentmark-ai/connect';

interface ActiveJob {
  abortController: AbortController;
}

export class JobHandler {
  private wsClient: WebSocketClient;
  private webhookUrl: string;
  private activeJobs = new Map<string, ActiveJob>();

  constructor(wsClient: WebSocketClient, webhookUrl: string) {
    this.wsClient = wsClient;
    this.webhookUrl = webhookUrl;
  }

  /** Returns the IDs of all currently active (in-progress) jobs. */
  getActiveJobIds(): string[] {
    return Array.from(this.activeJobs.keys());
  }

  /** Dispatches an incoming platform message to the appropriate handler. */
  handleMessage(message: JobMessage | JobCancelMessage): void {
    if (message.type === 'job-cancel') {
      this.handleCancel(message);
      return;
    }
    // Fire-and-forget; errors are sent back over the socket
    this.handleJob(message).catch((err: unknown) => {
      console.error('[connect] Unexpected error in job handler:', err instanceof Error ? err.message : String(err));
    });
  }

  // ── Job execution ─────────────────────────────────────────────────────────

  private async handleJob(message: JobMessage): Promise<void> {
    const { jobId, request } = message;
    const abortController = new AbortController();
    this.activeJobs.set(jobId, { abortController });

    try {
      console.log(`  [connect] Received ${request.type} job (${jobId.slice(0, 8)}...)`);

      // Forward as an HTTP POST to the local webhook server, matching the
      // same WebhookRequest shape that handleWebhookRequest expects.
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: request.type,
          data: request.data,
        }),
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) return;

      // Check if response is streaming
      const isStreaming = response.headers.get('AgentMark-Streaming') === 'true';

      if (!response.ok && !isStreaming) {
        const errorBody = await response.text();
        let errorMessage: string;
        try {
          const parsed = JSON.parse(errorBody);
          errorMessage = parsed.message || parsed.error || errorBody;
        } catch {
          errorMessage = errorBody || `HTTP ${response.status}`;
        }

        this.wsClient.send({
          type: 'job-error',
          jobId,
          error: errorMessage,
          details: `Webhook server returned ${response.status}`,
        });
        return;
      }

      if (isStreaming && response.body) {
        await this.streamResponse(jobId, response.body, abortController.signal);
      } else {
        // Non-streaming JSON response
        const data = await response.json();
        this.wsClient.send({
          type: 'job-result',
          jobId,
          result: {
            type: data.type || 'text',
            result: data.result,
            traceId: data.traceId || '',
            usage: data.usage as Record<string, number> | undefined,
          },
        });
        console.log(`  [connect] Job complete (${jobId.slice(0, 8)}...)`);
      }
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.wsClient.send({
        type: 'job-error',
        jobId,
        error: message,
        details: stack,
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  // ── Stream reading ────────────────────────────────────────────────────────

  private async streamResponse(
    jobId: string,
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let lastTraceId = '';

    try {
      while (true) {
        if (signal.aborted) {
          reader.cancel();
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });

        // Filter out "done" events (extract traceId) and forward remaining lines
        const lines = text.split('\n');
        const forwardLines: string[] = [];

        for (const line of lines) {
          if (!line.trim()) {
            forwardLines.push(line);
            continue;
          }
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'done' && parsed.traceId) {
              lastTraceId = parsed.traceId;
              continue; // Strip the "done" event from forwarded data
            }
          } catch {
            // Not valid JSON — forward as-is
          }
          forwardLines.push(line);
        }

        const filtered = forwardLines.join('\n');
        if (filtered.trim()) {
          this.wsClient.send({
            type: 'job-stream-chunk',
            jobId,
            chunk: filtered,
          });
        }
      }

      this.wsClient.send({
        type: 'job-stream-end',
        jobId,
        traceId: lastTraceId,
      });
      console.log(`  [connect] Stream complete (${jobId.slice(0, 8)}...)`);
    } finally {
      reader.releaseLock();
    }
  }

  // ── Cancellation ──────────────────────────────────────────────────────────

  private handleCancel(message: JobCancelMessage): void {
    const active = this.activeJobs.get(message.jobId);
    if (active) {
      console.log(`  [connect] Cancelling job ${message.jobId.slice(0, 8)}... (${message.reason})`);
      active.abortController.abort();
    }
  }
}
