import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { loadVector } from '@agentmark-ai/conformance-vectors';
import { createWebhookServer } from '../cli-src/runner-server';
import type { WebhookHandler } from '../cli-src/runner-server/types';

/**
 * End-to-end HTTP contract of the LOCAL dev webhook server, pinned to
 * conformance-vectors/webhook-http.json — the same vector
 * prompt-core-python's test_serve_webhook_runner.py asserts, so the TS and
 * Python dev servers cannot drift from each other (or from the managed
 * servers, which already conform). This is the layer `run-prompt`,
 * `run-experiment`, and the dashboard actually consume: the streaming
 * headers, the trailing done event, and the error body shape.
 */

const VECTOR = loadVector('webhook-http');

function ndjsonStream(lines: string[]): ReadableStream {
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(line);
      controller.close();
    },
  });
}

describe('createWebhookServer — HTTP wire contract (webhook-http.json)', () => {
  let server: Server;
  let url: string;
  let promptResult: any;

  const handler: WebhookHandler = {
    runPrompt: vi.fn(async () => promptResult),
    runExperiment: vi.fn(),
  } as any;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    server = await createWebhookServer({ port: 0, handler });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  const post = (body: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('streaming responses carry the required headers and the trailing done event', async () => {
    promptResult = {
      type: 'stream',
      stream: ndjsonStream([
        JSON.stringify({ type: 'text', result: 'he' }) + '\n',
        JSON.stringify({ type: 'text', result: 'llo' }) + '\n',
      ]),
      streamHeader: { 'AgentMark-Streaming': 'true' },
      traceId: 'trace-42',
    };

    const res = await post({ type: 'prompt-run', data: { ast: {} } });

    expect(res.status).toBe(200);
    for (const [name, value] of Object.entries(
      VECTOR.streamResponse.requiredHeaders as Record<string, string>,
    )) {
      expect(res.headers.get(name)).toBe(value);
    }
    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toEqual([
      { type: 'text', result: 'he' },
      { type: 'text', result: 'llo' },
      { type: 'done', traceId: 'trace-42' },
    ]);
  });

  it('omits the done event when the result has no traceId', async () => {
    promptResult = {
      type: 'stream',
      stream: ndjsonStream([JSON.stringify({ type: 'text', result: 'x' }) + '\n']),
      streamHeader: { 'AgentMark-Streaming': 'true' },
    };

    const res = await post({ type: 'prompt-run', data: { ast: {} } });

    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toEqual([{ type: 'text', result: 'x' }]);
  });

  it('non-stream success returns the vector json status with the flat body', async () => {
    promptResult = { type: 'text', result: 'hi', usage: { totalTokens: 5 } };

    const res = await post({ type: 'prompt-run', data: { ast: {} } });

    expect(res.status).toBe(VECTOR.jsonResponse.status);
    expect(await res.json()).toEqual(promptResult);
  });

  it('unknown job types map to the vector status with a message body', async () => {
    const res = await post({ type: 'bogus', data: {} });

    expect(res.status).toBe(VECTOR.errorResponse.statuses.unknownJobType);
    const body = await res.json();
    expect(typeof body[VECTOR.errorResponse.bodyKey]).toBe('string');
  });

  it('execution failures map to the vector status with a message body', async () => {
    promptResult = undefined;
    (handler.runPrompt as any).mockImplementationOnce(async () => {
      throw new Error('provider exploded');
    });

    const res = await post({ type: 'prompt-run', data: { ast: {} } });

    expect(res.status).toBe(VECTOR.errorResponse.statuses.executionFailure);
    const body = await res.json();
    expect(body[VECTOR.errorResponse.bodyKey]).toBe('provider exploded');
  });
});
