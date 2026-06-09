import { describe, it, expect, vi, beforeEach } from 'vitest';
// Back-compat guard. The dispatch implementation moved to
// `@agentmark-ai/prompt-core/webhook-runner`; `../cli-src/runner-server/core`
// and `.../types` are now re-export shims kept so existing deployed handlers
// that import from `@agentmark-ai/cli/runner-server` keep working. This suite
// imports through those shims and proves they forward to the real, working
// implementation. Full behavior coverage lives in prompt-core's
// `test/webhook-dispatch.test.ts`.
import { handleWebhookRequest } from '../cli-src/runner-server/core';
import type { ControlPlaneClient, WebhookHandler, WebhookRequest } from '../cli-src/runner-server/types';

describe('@agentmark-ai/cli/runner-server back-compat shim', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('re-exports a callable handleWebhookRequest (not undefined)', () => {
    expect(typeof handleWebhookRequest).toBe('function');
  });

  it('forwards a dataset-run concurrency through to the handler via the shim', async () => {
    const calls: any[][] = [];
    const handler: WebhookHandler = {
      runPrompt: vi.fn(),
      runExperiment: vi.fn(async (...args: any[]) => {
        calls.push(args);
        return {
          stream: new ReadableStream({ start(c) { c.close(); } }) as any,
          streamHeaders: { 'AgentMark-Streaming': 'true' },
        } as any;
      }),
    };

    await handleWebhookRequest(
      { type: 'dataset-run', data: { ast: { type: 'root', children: [] }, experimentId: 'exp-1', concurrency: 7 } } as WebhookRequest,
      handler,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0][2].concurrency).toBe(7);
  });

  it('answers get-evals via the shim, sourcing names from the client', async () => {
    const inertHandler: WebhookHandler = { runPrompt: vi.fn(), runExperiment: vi.fn() };
    const client: ControlPlaneClient = { getEvalNames: () => ['safety', 'accuracy'] };

    const result = await handleWebhookRequest(
      { type: 'get-evals', data: {} } as WebhookRequest,
      inertHandler,
      client,
    );

    expect(result).toEqual({
      type: 'json',
      data: { type: 'evals', result: '["accuracy","safety"]', traceId: '' },
      status: 200,
    });
  });
});
