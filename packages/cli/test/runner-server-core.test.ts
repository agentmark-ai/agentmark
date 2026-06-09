import { describe, it, expect, vi, beforeEach } from 'vitest';
// @ts-expect-error — @agentmark-ai/conformance-vectors is a JS data package
import { loadVector } from '@agentmark-ai/conformance-vectors';
import { handleWebhookRequest } from '../cli-src/runner-server/core';
import type { ControlPlaneClient, WebhookHandler, WebhookRequest } from '../cli-src/runner-server/types';

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

// ---------------------------------------------------------------------------
// Control-plane `get-evals` dispatch.
//
// This is the path the Vercel adapters route through (their handler has no
// per-adapter eval logic — the CLIENT owns it). The core must answer the job
// by sourcing eval names from the client (not the handler) via the shared
// `buildEvalsResponse`, and emit the canonical envelope. Asserted against the
// SAME conformance-vectors/control-plane.json the prompt-core + Python suites
// use, so the TS dispatch can't drift from the cross-language wire contract.
// ---------------------------------------------------------------------------
interface ControlPlaneCase {
  name: string;
  evalNames: string[];
  expected: { type: 'evals'; result: string; traceId: string };
}
const { cases: controlPlaneCases } = loadVector('control-plane') as {
  cases: ControlPlaneCase[];
};

describe('handleWebhookRequest — get-evals control-plane dispatch', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // A handler with no control-plane logic — proves the names come from the
  // client, never the handler.
  const inertHandler: WebhookHandler = {
    runPrompt: vi.fn(),
    runExperiment: vi.fn(),
  };
  // No cast needed: `data.ast` is optional, so a get-evals request type-checks.
  const getEvalsRequest: WebhookRequest = { type: 'get-evals', data: {} };

  for (const c of controlPlaneCases) {
    it(`returns the canonical envelope: ${c.name}`, async () => {
      const client: ControlPlaneClient = { getEvalNames: () => c.evalNames };

      const result = await handleWebhookRequest(getEvalsRequest, inertHandler, client);

      expect(result).toEqual({ type: 'json', data: c.expected, status: 200 });
    });
  }

  it('sources the client from the handler when no explicit client is passed (zero-config)', async () => {
    // The Vercel-style path: the handler is built from a client and surfaces it,
    // so a consumer calling createWebhookServer({ handler }) gets get-evals with
    // no extra wiring. Names arrive unsorted; the helper canonicalizes them.
    const handlerWithClient: WebhookHandler = {
      runPrompt: vi.fn(),
      runExperiment: vi.fn(),
      client: { getEvalNames: () => ['safety', 'accuracy'] },
    };

    const result = await handleWebhookRequest(getEvalsRequest, handlerWithClient);

    expect(result).toEqual({
      type: 'json',
      data: { type: 'evals', result: '["accuracy","safety"]', traceId: '' },
      status: 200,
    });
  });

  it('prefers an explicit client override over the handler client', async () => {
    const handlerWithClient: WebhookHandler = {
      runPrompt: vi.fn(),
      runExperiment: vi.fn(),
      client: { getEvalNames: () => ['from_handler'] },
    };
    const override: ControlPlaneClient = { getEvalNames: () => ['from_override'] };

    const result = await handleWebhookRequest(getEvalsRequest, handlerWithClient, override);

    expect(result).toEqual({
      type: 'json',
      data: { type: 'evals', result: '["from_override"]', traceId: '' },
      status: 200,
    });
  });

  it('degrades gracefully to an empty eval list when no client is available anywhere', async () => {
    const result = await handleWebhookRequest(getEvalsRequest, inertHandler);

    expect(result).toEqual({
      type: 'json',
      data: { type: 'evals', result: '[]', traceId: '' },
      status: 200,
    });
  });
});
