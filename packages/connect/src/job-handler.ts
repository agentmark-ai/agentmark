/**
 * JobHandler — processes incoming job messages by calling the user's handler
 * function directly (no HTTP hop, unlike the CLI version).
 *
 * Responsibilities:
 * - Dispatches job/cancel messages to the appropriate handler
 * - Tracks active jobs with AbortControllers for cancellation
 * - Streams results chunk-by-chunk back through the WebSocket
 * - Reports errors back to the platform on handler failure
 */

import type { WebSocketClient } from './websocket-client';
import type {
  JobMessage,
  JobCancelMessage,
  JobHandlerFn,
  JobResult,
  JobStreamResult,
} from './types';

interface ActiveJob {
  abortController: AbortController;
}

function isStreamResult(result: JobResult | JobStreamResult): result is JobStreamResult {
  return 'stream' in result;
}

export class JobHandler {
  private wsClient: WebSocketClient;
  private handler: JobHandlerFn;
  private activeJobs = new Map<string, ActiveJob>();

  constructor(wsClient: WebSocketClient, handler: JobHandlerFn) {
    this.wsClient = wsClient;
    this.handler = handler;
  }

  /** Returns the IDs of all currently executing jobs. */
  getActiveJobIds(): string[] {
    return Array.from(this.activeJobs.keys());
  }

  /** Routes an incoming platform message to the correct handler. */
  handleMessage(message: JobMessage | JobCancelMessage): void {
    if (message.type === 'job-cancel') {
      this.handleCancel(message);
      return;
    }
    // Fire-and-forget — errors are reported via the WebSocket
    this.handleJob(message).catch((err: unknown) => {
      console.error('[connect] Unexpected error in job handler:', err instanceof Error ? err.message : String(err));
    });
  }

  /** Executes the user's handler for a job and sends the result back. */
  async handleJob(message: JobMessage): Promise<void> {
    const { jobId, request } = message;
    const abortController = new AbortController();
    this.activeJobs.set(jobId, { abortController });

    try {
      const result = await this.handler(request);

      if (abortController.signal.aborted) return;

      if (isStreamResult(result)) {
        await this.streamResponse(
          jobId,
          result.stream,
          result.traceId ?? '',
          abortController.signal,
        );
      } else {
        this.wsClient.send({
          type: 'job-result',
          jobId,
          result: {
            type: result.type,
            result: result.result,
            traceId: result.traceId,
            usage: result.usage,
          },
        });
      }
    } catch (err: unknown) {
      if (abortController.signal.aborted) return;

      const errMessage = err instanceof Error ? err.message : String(err);
      this.wsClient.send({
        type: 'job-error',
        jobId,
        error: errMessage,
        details: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /** Aborts an in-flight job. */
  handleCancel(message: JobCancelMessage): void {
    const active = this.activeJobs.get(message.jobId);
    if (active) {
      active.abortController.abort();
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async streamResponse(
    jobId: string,
    stream: ReadableStream<Uint8Array>,
    traceId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        if (signal.aborted) {
          reader.cancel();
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        this.wsClient.send({
          type: 'job-stream-chunk',
          jobId,
          chunk: decoder.decode(value, { stream: true }),
        });
      }

      this.wsClient.send({
        type: 'job-stream-end',
        jobId,
        traceId,
      });
    } finally {
      reader.releaseLock();
    }
  }
}
