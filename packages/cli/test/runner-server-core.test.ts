import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWebhookRequest } from '../cli-src/runner-server/core';
import type { WebhookHandler, WebhookRequest } from '../cli-src/runner-server/types';

// ---------------------------------------------------------------------------
// Runner-server concurrency glue (issue #2326)
//
// handleWebhookRequest is the platform-agnostic core that every adapter's
// server (dev server, runner-server) routes `dataset-run` requests through.
// For a dataset-run it calls:
//   handler.runExperiment(data.ast, experimentId, {
//     datasetPath, sampling, concurrency, experimentKey, sourceTreeHash })
// The options bag is the 3rd argument. Each field is optional, so a dropped
// passthrough here would not fail typecheck — this suite is the guard for that
// hop of the wire (CLI flag → request body → core.ts → adapter).
// ---------------------------------------------------------------------------
describe('handleWebhookRequest — dataset-run concurrency forwarding', () => {
  // Silence the core handler's progress console.log calls.
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  /**
   * Build a spy WebhookHandler. runExperiment records its argument list and
   * returns a minimal valid streaming response so handleWebhookRequest
   * completes the dataset-run branch cleanly.
   */
  function makeSpyHandler(): { handler: WebhookHandler; calls: any[][] } {
    const calls: any[][] = [];
    const handler: WebhookHandler = {
      runPrompt: vi.fn(),
      runExperiment: vi.fn(async (...args: any[]) => {
        calls.push(args);
        return {
          stream: new ReadableStream({
            start(controller) { controller.close(); },
          }) as any,
          streamHeaders: { 'AgentMark-Streaming': 'true' },
        } as any;
      }),
    };
    return { handler, calls };
  }

  function datasetRunRequest(data: Partial<WebhookRequest['data']>): WebhookRequest {
    return { type: 'dataset-run', data: { ast: { type: 'root', children: [] }, ...data } };
  }

  it('should forward data.concurrency as the 5th argument to runExperiment', async () => {
    const { handler, calls } = makeSpyHandler();

    await handleWebhookRequest(
      datasetRunRequest({ experimentId: 'exp-1', concurrency: 6 }),
      handler,
    );

    expect(calls).toHaveLength(1);
    // runExperiment(ast, experimentId, { ...options })
    expect(calls[0][2].concurrency).toBe(6);
  });

  it('should forward a concurrency of 1 verbatim, distinct from the pool default', async () => {
    // 1 is a boundary value distinct from DEFAULT_EXPERIMENT_CONCURRENCY (20):
    // proves core.ts passes the caller's literal value, not a substituted default.
    const { handler, calls } = makeSpyHandler();

    await handleWebhookRequest(
      datasetRunRequest({ experimentId: 'exp-1', concurrency: 1 }),
      handler,
    );

    expect(calls[0][2].concurrency).toBe(1);
  });

  it('should call runExperiment with an undefined concurrency when the request omits it', async () => {
    // No concurrency in the request body → core.ts forwards undefined → the
    // adapter / pool applies its own default. core.ts must not invent a value.
    const { handler, calls } = makeSpyHandler();

    await handleWebhookRequest(
      datasetRunRequest({ experimentId: 'exp-1' }),
      handler,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0][2].concurrency).toBeUndefined();
  });

  it('should forward concurrency alongside datasetPath and sampling in the options bag', async () => {
    // Verify every field lands in the options object, not just concurrency.
    const { handler, calls } = makeSpyHandler();

    await handleWebhookRequest(
      datasetRunRequest({
        experimentId: 'exp-1',
        datasetPath: './data.jsonl',
        sampling: { rows: [0, 1] },
        concurrency: 9,
      }),
      handler,
    );

    expect(calls[0][2]).toMatchObject({
      datasetPath: './data.jsonl',
      sampling: { rows: [0, 1] },
      concurrency: 9,
    });
  });
});
