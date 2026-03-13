import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConnectServerOptions, JobResult } from '../types';

// ── Mock WebSocket ──────────────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

interface MockWebSocket {
  on: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
  _handlers: Record<string, EventHandler[]>;
  _trigger: (event: string, ...args: unknown[]) => void;
}

function createMockWebSocket(): MockWebSocket {
  const handlers: Record<string, EventHandler[]> = {};
  const mock: MockWebSocket = {
    on: vi.fn((event: string, handler: EventHandler) => {
      handlers[event] ??= [];
      handlers[event].push(handler);
    }),
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1, // OPEN
    _handlers: handlers,
    _trigger: (event: string, ...args: unknown[]) => {
      for (const handler of handlers[event] ?? []) {
        handler(...args);
      }
    },
  };
  return mock;
}

let latestMockWs: MockWebSocket;

vi.mock('ws', () => {
  const MockWS = vi.fn(() => {
    latestMockWs = createMockWebSocket();
    return latestMockWs;
  });
  (MockWS as unknown as Record<string, number>).OPEN = 1;
  return { default: MockWS };
});

// Must import after vi.mock so the mock is in place
import WebSocket from 'ws';
import { createConnectServer } from '../server';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeOptions(overrides?: Partial<ConnectServerOptions>): ConnectServerOptions {
  return {
    apiKey: 'test-api-key',
    appId: 'test-app-id',
    handler: vi.fn().mockResolvedValue({
      type: 'text',
      result: 'ok',
      traceId: 't-1',
    } satisfies JobResult),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createConnectServer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create server with disconnected status', () => {
    const server = createConnectServer(makeOptions());

    expect(server.getStatus()).toBe('disconnected');
  });

  it('should connect on start()', () => {
    const server = createConnectServer(makeOptions());

    server.start();

    expect(WebSocket).toHaveBeenCalledTimes(1);
    expect(server.getStatus()).toBe('connecting');
  });

  it('should report connected status after WebSocket opens', () => {
    const server = createConnectServer(makeOptions());

    server.start();
    latestMockWs._trigger('open');

    expect(server.getStatus()).toBe('connected');
  });

  it('should use default URL when not provided', () => {
    const server = createConnectServer(makeOptions());

    server.start();

    expect(WebSocket).toHaveBeenCalledWith(
      'wss://api.agentmark.co/v1/connect',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'test-api-key',
        }),
      }),
    );
  });

  it('should use custom URL when provided', () => {
    const server = createConnectServer(
      makeOptions({ url: 'wss://custom.example.com/ws' }),
    );

    server.start();

    expect(WebSocket).toHaveBeenCalledWith(
      'wss://custom.example.com/ws',
      expect.any(Object),
    );
  });

  it('should invoke onConnected callback', () => {
    const onConnected = vi.fn();
    const server = createConnectServer(makeOptions({ onConnected }));

    server.start();
    latestMockWs._trigger('open');

    expect(onConnected).toHaveBeenCalledOnce();
  });

  it('should invoke onError callback', () => {
    const onError = vi.fn();
    const server = createConnectServer(makeOptions({ onError }));

    server.start();
    const error = new Error('connection refused');
    latestMockWs._trigger('error', error);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('should invoke onDisconnected callback', () => {
    const onDisconnected = vi.fn();
    const server = createConnectServer(makeOptions({ onDisconnected }));

    server.start();
    latestMockWs._trigger('open');
    latestMockWs._trigger('close', 1006, Buffer.from('lost connection'));

    expect(onDisconnected).toHaveBeenCalledWith('lost connection');
  });

  it('should process jobs end-to-end', async () => {
    const handler = vi.fn().mockResolvedValue({
      type: 'text',
      result: 'Hello world',
      traceId: 't-42',
      usage: { input_tokens: 10 },
    } satisfies JobResult);

    const server = createConnectServer(makeOptions({ handler }));

    server.start();
    latestMockWs._trigger('open');

    // Platform sends a job message
    const jobMessage = {
      type: 'job',
      jobId: 'j-e2e',
      request: {
        type: 'prompt-run',
        data: { ast: { prompt: 'hello' } },
      },
    };
    latestMockWs._trigger('message', Buffer.from(JSON.stringify(jobMessage)));

    // Let the async handler complete
    await vi.advanceTimersByTimeAsync(10);

    // Handler should have been called with the request
    expect(handler).toHaveBeenCalledWith(jobMessage.request);

    // Result should have been sent back
    const sentMessages = latestMockWs.send.mock.calls.map(
      (call: unknown[]) => JSON.parse(call[0] as string),
    );
    const jobResult = sentMessages.find(
      (m: Record<string, unknown>) => m.type === 'job-result',
    );

    expect(jobResult).toEqual({
      type: 'job-result',
      jobId: 'j-e2e',
      result: {
        type: 'text',
        result: 'Hello world',
        traceId: 't-42',
        usage: { input_tokens: 10 },
      },
    });
  });

  it('should stop cleanly', () => {
    const server = createConnectServer(makeOptions());

    server.start();
    latestMockWs._trigger('open');

    server.stop();

    expect(server.getStatus()).toBe('disconnected');

    // Should not reconnect after stop
    vi.advanceTimersByTime(60_000);
    expect(WebSocket).toHaveBeenCalledTimes(1);
  });
});
