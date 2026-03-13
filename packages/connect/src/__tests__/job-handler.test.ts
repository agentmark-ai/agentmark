import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebSocketClient } from '../websocket-client';
import type { JobMessage, JobCancelMessage, WorkerMessage } from '../types';
import { JobHandler } from '../job-handler';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockWsClient(): { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn() };
}

function makeJobMessage(overrides?: Partial<JobMessage>): JobMessage {
  return {
    type: 'job',
    jobId: 'j-1',
    request: {
      type: 'prompt-run',
      data: { ast: { prompt: 'hello' } },
    },
    ...overrides,
  };
}

function makeCancelMessage(overrides?: Partial<JobCancelMessage>): JobCancelMessage {
  return {
    type: 'job-cancel',
    jobId: 'j-1',
    reason: 'timeout',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('JobHandler', () => {
  let mockWs: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockWs = createMockWsClient();
  });

  it('should call handler with job request and send result via wsClient.send', async () => {
    const handler = vi.fn().mockResolvedValue({
      type: 'text',
      result: 'Hello world',
      traceId: 't-1',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const jobHandler = new JobHandler(mockWs as unknown as WebSocketClient, handler);
    const message = makeJobMessage();

    await jobHandler.handleJob(message);

    expect(handler).toHaveBeenCalledWith(message.request);
    expect(mockWs.send).toHaveBeenCalledWith({
      type: 'job-result',
      jobId: 'j-1',
      result: {
        type: 'text',
        result: 'Hello world',
        traceId: 't-1',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    });
  });

  it('should send job-error when handler throws', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Model unavailable'));

    const jobHandler = new JobHandler(mockWs as unknown as WebSocketClient, handler);
    const message = makeJobMessage({ jobId: 'j-err' });

    await jobHandler.handleJob(message);

    expect(mockWs.send).toHaveBeenCalledOnce();
    const sent = mockWs.send.mock.calls[0][0] as WorkerMessage;
    expect(sent).toMatchObject({
      type: 'job-error',
      jobId: 'j-err',
      error: 'Model unavailable',
    });
    // Should include stack trace in details
    expect((sent as { details?: string }).details).toBeDefined();
  });

  it('should handle streaming results by sending chunks and stream-end', async () => {
    const chunks = [
      new TextEncoder().encode('Hello '),
      new TextEncoder().encode('world'),
    ];

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    const handler = vi.fn().mockResolvedValue({
      stream,
      traceId: 't-stream',
    });

    const jobHandler = new JobHandler(mockWs as unknown as WebSocketClient, handler);
    await jobHandler.handleJob(makeJobMessage({ jobId: 'j-stream' }));

    const sentMessages = mockWs.send.mock.calls.map(
      (call: unknown[]) => call[0],
    ) as WorkerMessage[];

    // Should have 2 chunk messages + 1 stream-end
    expect(sentMessages).toHaveLength(3);

    expect(sentMessages[0]).toEqual({
      type: 'job-stream-chunk',
      jobId: 'j-stream',
      chunk: 'Hello ',
    });
    expect(sentMessages[1]).toEqual({
      type: 'job-stream-chunk',
      jobId: 'j-stream',
      chunk: 'world',
    });
    expect(sentMessages[2]).toEqual({
      type: 'job-stream-end',
      jobId: 'j-stream',
      traceId: 't-stream',
    });
  });

  it('should track active jobs and support cancellation', async () => {
    let resolveHandler!: (value: { type: string; result: string; traceId: string }) => void;
    const handlerPromise = new Promise<{ type: string; result: string; traceId: string }>(
      (resolve) => { resolveHandler = resolve; },
    );
    const handler = vi.fn().mockReturnValue(handlerPromise);

    const jobHandler = new JobHandler(mockWs as unknown as WebSocketClient, handler);
    const message = makeJobMessage({ jobId: 'j-cancel' });

    // Start the job (don't await — it's in progress)
    const jobPromise = jobHandler.handleJob(message);

    // Job should be tracked
    expect(jobHandler.getActiveJobIds()).toContain('j-cancel');

    // Cancel the job
    jobHandler.handleCancel(makeCancelMessage({ jobId: 'j-cancel' }));

    // Resolve the handler (but result should be suppressed since cancelled)
    resolveHandler({ type: 'text', result: 'too late', traceId: 't-1' });
    await jobPromise;

    // Should NOT have sent a result (aborted)
    expect(mockWs.send).not.toHaveBeenCalled();

    // Job should be cleaned up
    expect(jobHandler.getActiveJobIds()).not.toContain('j-cancel');
  });

  it('should dispatch to handleJob for job messages via handleMessage', async () => {
    const handler = vi.fn().mockResolvedValue({
      type: 'text',
      result: 'ok',
      traceId: 't-1',
    });

    const jobHandler = new JobHandler(mockWs as unknown as WebSocketClient, handler);
    const message = makeJobMessage({ jobId: 'j-dispatch' });

    jobHandler.handleMessage(message);

    // Wait for the async handleJob to complete
    await vi.waitFor(() => {
      expect(mockWs.send).toHaveBeenCalled();
    });

    expect(mockWs.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'job-result',
        jobId: 'j-dispatch',
      }),
    );
  });

  it('should dispatch to handleCancel for job-cancel messages via handleMessage', () => {
    const handler = vi.fn();
    const jobHandler = new JobHandler(mockWs as unknown as WebSocketClient, handler);

    // No job to cancel, but should not throw
    jobHandler.handleMessage(makeCancelMessage({ jobId: 'j-nonexistent' }));

    // Handler should NOT have been called (cancel doesn't invoke the handler)
    expect(handler).not.toHaveBeenCalled();
  });

  it('should remove job from active jobs after completion', async () => {
    const handler = vi.fn().mockResolvedValue({
      type: 'text',
      result: 'done',
      traceId: 't-1',
    });

    const jobHandler = new JobHandler(mockWs as unknown as WebSocketClient, handler);
    await jobHandler.handleJob(makeJobMessage({ jobId: 'j-cleanup' }));

    expect(jobHandler.getActiveJobIds()).toHaveLength(0);
  });

  it('should remove job from active jobs after error', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));

    const jobHandler = new JobHandler(mockWs as unknown as WebSocketClient, handler);
    await jobHandler.handleJob(makeJobMessage({ jobId: 'j-err-cleanup' }));

    expect(jobHandler.getActiveJobIds()).toHaveLength(0);
  });

  it('should handle streaming with default empty traceId when not provided', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data'));
        controller.close();
      },
    });

    const handler = vi.fn().mockResolvedValue({ stream });

    const jobHandler = new JobHandler(mockWs as unknown as WebSocketClient, handler);
    await jobHandler.handleJob(makeJobMessage({ jobId: 'j-no-trace' }));

    const sentMessages = mockWs.send.mock.calls.map(
      (call: unknown[]) => call[0],
    ) as WorkerMessage[];

    const streamEnd = sentMessages.find(
      (m) => m.type === 'job-stream-end',
    );
    expect(streamEnd).toEqual({
      type: 'job-stream-end',
      jobId: 'j-no-trace',
      traceId: '',
    });
  });
});
