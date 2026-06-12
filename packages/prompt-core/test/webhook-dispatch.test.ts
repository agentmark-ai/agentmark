import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadVector } from '@agentmark-ai/conformance-vectors';
// Import through the public subpath entry, not the source file, so this suite
// also locks the export surface deployed handlers rely on:
// `@agentmark-ai/prompt-core/webhook-runner`.
import { handleWebhookRequest } from '../src/webhook-runner';
import type {
  ControlPlaneClient,
  WebhookHandler,
  WebhookRequest,
} from '../src/webhook-runner';

// ---------------------------------------------------------------------------
// Dataset-run concurrency glue (issue #2326)
//
// handleWebhookRequest is the platform-agnostic core that every adapter's
// server (dev server, managed deploy) routes `dataset-run` requests through.
// For a dataset-run it calls:
//   handler.runExperiment(data.ast, experimentId, {
//     datasetPath, sampling, concurrency, experimentKey, sourceTreeHash })
// The options bag is the 3rd argument. Each field is optional, so a dropped
// passthrough here would not fail typecheck — this suite is the guard for that
// hop of the wire (CLI flag → request body → dispatch → adapter).
// ---------------------------------------------------------------------------
describe('handleWebhookRequest — dataset-run concurrency forwarding', () => {
  // Silence the dispatch's progress console.log calls.
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

  it('should forward data.concurrency to runExperiment in the options bag', async () => {
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
    // proves the dispatch passes the caller's literal value, not a substituted default.
    const { handler, calls } = makeSpyHandler();

    await handleWebhookRequest(
      datasetRunRequest({ experimentId: 'exp-1', concurrency: 1 }),
      handler,
    );

    expect(calls[0][2].concurrency).toBe(1);
  });

  it('should call runExperiment with an undefined concurrency when the request omits it', async () => {
    // No concurrency in the request body → dispatch forwards undefined → the
    // adapter / pool applies its own default. The dispatch must not invent a value.
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
// This is the path the adapters route through (their handler has no per-adapter
// eval logic — the CLIENT owns it). The dispatch must answer the job by sourcing
// eval names from the client (not the handler) via the shared
// `buildEvalsResponse`, and emit the canonical envelope. Asserted against the
// SAME conformance-vectors/control-plane.json the control-plane + Python suites
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
    // The adapter path: the handler is built from a client and surfaces it,
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

// ---------------------------------------------------------------------------
// prompt-run dispatch + request validation. Covers the branches the cloud
// path actually exercises: streaming vs JSON prompt responses, the options
// the dispatch forwards to runPrompt, and every validation/error envelope a
// malformed request produces (these are the contract the dashboard branches on).
// ---------------------------------------------------------------------------
describe('handleWebhookRequest — prompt-run', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  const ast = { type: 'root', children: [] };

  it('streaming response → stream envelope carrying the handler stream, headers, and traceId', async () => {
    const stream = new ReadableStream({ start(c) { c.close(); } });
    const handler: WebhookHandler = {
      runPrompt: vi.fn(async () => ({
        type: 'stream',
        stream,
        streamHeader: { 'AgentMark-Streaming': 'true' },
        traceId: 'trace-1',
      })) as any,
      runExperiment: vi.fn(),
    };

    const res = await handleWebhookRequest(
      { type: 'prompt-run', data: { ast, options: { shouldStream: true } } },
      handler,
    );

    expect(res.type).toBe('stream');
    expect((res as { stream: ReadableStream }).stream).toBe(stream);
    expect((res as { headers: Record<string, string> }).headers).toEqual({
      'Content-Type': 'application/x-ndjson',
      'AgentMark-Streaming': 'true',
    });
    expect((res as { traceId?: string }).traceId).toBe('trace-1');
    // shouldStream + customProps are threaded through verbatim.
    expect(handler.runPrompt).toHaveBeenCalledWith(ast, { shouldStream: true, customProps: undefined });
  });

  it('streaming response with no streamHeader → falls back to the default streaming headers', async () => {
    const stream = new ReadableStream({ start(c) { c.close(); } });
    const handler: WebhookHandler = {
      runPrompt: vi.fn(async () => ({ type: 'stream', stream, traceId: 't' })) as any,
      runExperiment: vi.fn(),
    };

    const res = await handleWebhookRequest({ type: 'prompt-run', data: { ast } }, handler);

    expect((res as { headers: Record<string, string> }).headers).toEqual({
      'Content-Type': 'application/x-ndjson',
      'AgentMark-Streaming': 'true',
    });
  });

  it('non-streaming response → wrapped verbatim in a json envelope (status 200)', async () => {
    const response = { type: 'text', result: 'hi', usage: { totalTokens: 5 } };
    const handler: WebhookHandler = {
      runPrompt: vi.fn(async () => response) as any,
      runExperiment: vi.fn(),
    };

    const res = await handleWebhookRequest(
      { type: 'prompt-run', data: { ast, customProps: { name: 'Alice' } } },
      handler,
    );

    expect(res).toEqual({ type: 'json', data: response, status: 200 });
    expect(handler.runPrompt).toHaveBeenCalledWith(ast, { shouldStream: undefined, customProps: { name: 'Alice' } });
  });

  it('handler throwing → 500 "Webhook handler error" with the thrown message (outer catch)', async () => {
    const handler: WebhookHandler = {
      runPrompt: vi.fn(async () => { throw new Error('kaboom'); }) as any,
      runExperiment: vi.fn(),
    };

    const res = await handleWebhookRequest({ type: 'prompt-run', data: { ast } }, handler);

    expect(res).toEqual({ type: 'error', error: 'Webhook handler error', details: 'kaboom', status: 500 });
  });
});

describe('handleWebhookRequest — request validation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  const inert: WebhookHandler = { runPrompt: vi.fn(), runExperiment: vi.fn() };
  const ast = { type: 'root', children: [] };

  it('missing type → 400 Missing event type, without touching the handler', async () => {
    const res = await handleWebhookRequest({ data: {} } as unknown as WebhookRequest, inert);
    expect(res).toEqual({ type: 'error', error: 'Missing event type', details: expect.any(String), status: 400 });
    expect(inert.runPrompt).not.toHaveBeenCalled();
    expect(inert.runExperiment).not.toHaveBeenCalled();
  });

  it('unknown type → 400 Unknown event type', async () => {
    const res = await handleWebhookRequest({ type: 'bogus', data: { ast } } as unknown as WebhookRequest, inert);
    expect(res).toEqual({ type: 'error', error: 'Unknown event type', details: expect.any(String), status: 400 });
  });

  it('prompt-run with no data → 400 Missing data object', async () => {
    const res = await handleWebhookRequest({ type: 'prompt-run' } as unknown as WebhookRequest, inert);
    expect(res).toEqual({ type: 'error', error: 'Missing data object', details: expect.any(String), status: 400 });
  });

  it('prompt-run missing data.ast → 400 Missing AST object', async () => {
    const res = await handleWebhookRequest({ type: 'prompt-run', data: {} }, inert);
    expect(res).toEqual({ type: 'error', error: 'Missing AST object', details: expect.any(String), status: 400 });
  });

  it('prompt-run with a non-object ast → 400 Invalid AST type', async () => {
    const res = await handleWebhookRequest(
      { type: 'prompt-run', data: { ast: 'not-an-object' } } as unknown as WebhookRequest,
      inert,
    );
    expect(res).toEqual({ type: 'error', error: 'Invalid AST type', details: expect.any(String), status: 400 });
  });

  it('dataset-run whose handler throws → 500 surfacing the experiment error', async () => {
    const handler: WebhookHandler = {
      runPrompt: vi.fn(),
      runExperiment: vi.fn(async () => { throw new Error('bad dataset'); }) as any,
    };
    const res = await handleWebhookRequest({ type: 'dataset-run', data: { ast, experimentId: 'e' } }, handler);
    expect(res).toEqual({ type: 'error', error: 'bad dataset', details: expect.any(String), status: 500 });
  });

  it('dataset-run that returns no stream → 500 Expected stream from dataset-run', async () => {
    const handler: WebhookHandler = {
      runPrompt: vi.fn(),
      runExperiment: vi.fn(async () => ({})) as any,
    };
    const res = await handleWebhookRequest({ type: 'dataset-run', data: { ast, experimentId: 'e' } }, handler);
    expect(res).toEqual({ type: 'error', error: 'Expected stream from dataset-run', details: expect.any(String), status: 500 });
  });
});

// ---------------------------------------------------------------------------
// HTTP wire contract (conformance-vectors/webhook-http.json)
//
// The dispatch's stream envelope carries the headers the local dev server
// writes verbatim. Runners only set the AgentMark-Streaming marker, so the
// dispatch must default Content-Type — the managed servers already send both,
// and Python's serve_webhook_runner asserts the same vector, so neither local
// server can drift from the cloud or from the other language.
// ---------------------------------------------------------------------------
describe('handleWebhookRequest — HTTP wire contract (webhook-http.json)', () => {
  const VECTOR = loadVector('webhook-http');

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  const emptyStream = () =>
    new ReadableStream({ start(controller) { controller.close(); } }) as any;

  function handlerWith(overrides: Partial<WebhookHandler>): WebhookHandler {
    return {
      runPrompt: vi.fn(),
      runExperiment: vi.fn(),
      ...overrides,
    } as WebhookHandler;
  }

  it('prompt-run streams carry the required headers even when the runner only sets the streaming marker', async () => {
    const handler = handlerWith({
      runPrompt: vi.fn(async () => ({
        type: 'stream',
        stream: emptyStream(),
        streamHeader: { 'AgentMark-Streaming': 'true' },
        traceId: 't-1',
      })) as any,
    });

    const result = await handleWebhookRequest(
      { type: 'prompt-run', data: { ast: {} } } as any,
      handler,
    );

    expect(result.type).toBe('stream');
    expect((result as any).headers).toEqual(VECTOR.streamResponse.requiredHeaders);
  });

  it('dataset-run streams carry the required headers', async () => {
    const handler = handlerWith({
      runExperiment: vi.fn(async () => ({
        stream: emptyStream(),
        streamHeaders: { 'AgentMark-Streaming': 'true' },
      })) as any,
    });

    const result = await handleWebhookRequest(
      { type: 'dataset-run', data: { ast: {}, experimentId: 'e' } } as any,
      handler,
    );

    expect(result.type).toBe('stream');
    expect((result as any).headers).toEqual(VECTOR.streamResponse.requiredHeaders);
  });

  it('runner-supplied stream headers survive the default merge', async () => {
    const handler = handlerWith({
      runPrompt: vi.fn(async () => ({
        type: 'stream',
        stream: emptyStream(),
        streamHeader: { 'AgentMark-Streaming': 'true', 'X-Custom': '1' },
      })) as any,
    });

    const result = await handleWebhookRequest(
      { type: 'prompt-run', data: { ast: {} } } as any,
      handler,
    );

    expect((result as any).headers).toEqual({
      ...VECTOR.streamResponse.requiredHeaders,
      'X-Custom': '1',
    });
  });

  it('unknown job types map to the vector status', async () => {
    const result = await handleWebhookRequest(
      { type: 'bogus', data: {} } as any,
      handlerWith({}),
    );

    expect(result.type).toBe('error');
    expect((result as any).status).toBe(VECTOR.errorResponse.statuses.unknownJobType);
  });

  it('execution failures map to the vector status', async () => {
    const handler = handlerWith({
      runPrompt: vi.fn(async () => { throw new Error('provider exploded'); }) as any,
    });

    const result = await handleWebhookRequest(
      { type: 'prompt-run', data: { ast: {} } } as any,
      handler,
    );

    expect(result.type).toBe('error');
    expect((result as any).status).toBe(VECTOR.errorResponse.statuses.executionFailure);
  });

  it('non-stream success maps to the vector json status', async () => {
    const handler = handlerWith({
      runPrompt: vi.fn(async () => ({ type: 'text', result: 'hi' })) as any,
    });

    const result = await handleWebhookRequest(
      { type: 'prompt-run', data: { ast: {} } } as any,
      handler,
    );

    expect(result.type).toBe('json');
    expect((result as any).status).toBe(VECTOR.jsonResponse.status);
  });
});
