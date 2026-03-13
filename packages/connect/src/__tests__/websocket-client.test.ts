import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WebSocketClientOptions, WebSocketClientEvents } from '../types';

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
  // WebSocket.OPEN constant
  (MockWS as unknown as Record<string, number>).OPEN = 1;
  return { default: MockWS };
});

// Must import after vi.mock so the mock is in place
import WebSocket from 'ws';
import { WebSocketClient } from '../websocket-client';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeOptions(overrides?: Partial<WebSocketClientOptions>): WebSocketClientOptions {
  return {
    url: 'wss://test.example.com/ws',
    apiKey: 'test-api-key',
    appId: 'test-app-id',
    language: 'typescript',
    heartbeatIntervalMs: 50_000,
    reconnectMaxDelayMs: 30_000,
    ...overrides,
  };
}

function makeEvents(overrides?: Partial<WebSocketClientEvents>): WebSocketClientEvents {
  return {
    onConnected: vi.fn(),
    onDisconnected: vi.fn(),
    onJob: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('WebSocketClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should connect and fire onConnected', () => {
    const events = makeEvents();
    const client = new WebSocketClient(makeOptions(), events);

    client.connect();
    latestMockWs._trigger('open');

    expect(events.onConnected).toHaveBeenCalledOnce();
    expect(client.getStatus()).toBe('connected');
  });

  it('should pass auth headers when connecting', () => {
    const options = makeOptions({
      sdkVersion: '1.0.0',
      adapterType: 'custom',
      language: 'python',
    });
    const client = new WebSocketClient(options, makeEvents());

    client.connect();

    expect(WebSocket).toHaveBeenCalledWith('wss://test.example.com/ws', {
      headers: {
        Authorization: 'test-api-key',
        'X-Agentmark-App-Id': 'test-app-id',
        'X-Agentmark-SDK-Version': '1.0.0',
        'X-Agentmark-Adapter': 'custom',
        'X-Agentmark-Language': 'python',
      },
    });
  });

  it('should send heartbeat after interval', () => {
    const client = new WebSocketClient(
      makeOptions({ heartbeatIntervalMs: 100 }),
      makeEvents(),
    );

    client.connect();
    latestMockWs._trigger('open');

    // Heartbeat should not have been sent yet
    expect(latestMockWs.send).not.toHaveBeenCalled();

    // Advance past the heartbeat interval
    vi.advanceTimersByTime(100);

    expect(latestMockWs.send).toHaveBeenCalledOnce();
    const sent = JSON.parse(latestMockWs.send.mock.calls[0][0] as string);
    expect(sent.type).toBe('heartbeat');
    expect(sent.timestamp).toBeDefined();
  });

  it('should dispatch job messages to onJob', () => {
    const events = makeEvents();
    const client = new WebSocketClient(makeOptions(), events);

    client.connect();
    latestMockWs._trigger('open');

    const jobMessage = {
      type: 'job',
      jobId: 'j-123',
      request: {
        type: 'prompt-run',
        data: { ast: {} },
      },
    };

    latestMockWs._trigger('message', Buffer.from(JSON.stringify(jobMessage)));

    expect(events.onJob).toHaveBeenCalledWith(jobMessage);
  });

  it('should dispatch job-cancel messages to onJob', () => {
    const events = makeEvents();
    const client = new WebSocketClient(makeOptions(), events);

    client.connect();
    latestMockWs._trigger('open');

    const cancelMessage = {
      type: 'job-cancel',
      jobId: 'j-456',
      reason: 'timeout',
    };

    latestMockWs._trigger('message', Buffer.from(JSON.stringify(cancelMessage)));

    expect(events.onJob).toHaveBeenCalledWith(cancelMessage);
  });

  it('should reconnect with exponential backoff on close', () => {
    const events = makeEvents();
    const client = new WebSocketClient(
      makeOptions({ reconnectMaxDelayMs: 30_000 }),
      events,
    );

    client.connect();
    const firstWs = latestMockWs;
    firstWs._trigger('open');

    // Simulate unexpected close
    firstWs._trigger('close', 1006, Buffer.from('abnormal'));

    expect(events.onDisconnected).toHaveBeenCalledWith('abnormal');
    expect(client.getStatus()).toBe('disconnected');

    // After 1s (initial delay), it should reconnect
    vi.advanceTimersByTime(1_000);
    expect(WebSocket).toHaveBeenCalledTimes(2);
    expect(client.getReconnectionCount()).toBe(1);

    // Simulate second close WITHOUT a successful open in between,
    // so the backoff delay accumulates (1s -> 2s)
    const secondWs = latestMockWs;
    secondWs._trigger('close', 1006, Buffer.from(''));

    // Next delay should be 2s (exponential backoff)
    vi.advanceTimersByTime(1_999);
    expect(WebSocket).toHaveBeenCalledTimes(2); // not yet
    vi.advanceTimersByTime(1);
    expect(WebSocket).toHaveBeenCalledTimes(3);
    expect(client.getReconnectionCount()).toBe(2);
  });

  it('should NOT reconnect after close() is called', () => {
    const events = makeEvents();
    const client = new WebSocketClient(makeOptions(), events);

    client.connect();
    latestMockWs._trigger('open');

    // Graceful close
    client.close();

    expect(client.getStatus()).toBe('disconnected');

    // Advance well past any reconnect delay
    vi.advanceTimersByTime(60_000);

    // Should only have been constructed once (no reconnect)
    expect(WebSocket).toHaveBeenCalledTimes(1);
  });

  it('should send messages when connected', () => {
    const client = new WebSocketClient(makeOptions(), makeEvents());

    client.connect();
    latestMockWs._trigger('open');

    const msg = { type: 'job-result' as const, jobId: 'j-1', result: { type: 'text', result: 'ok', traceId: 't-1' } };
    client.send(msg);

    expect(latestMockWs.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('should not send messages when disconnected', () => {
    const client = new WebSocketClient(makeOptions(), makeEvents());

    // Not connected yet
    const msg = { type: 'job-result' as const, jobId: 'j-1', result: { type: 'text', result: 'ok', traceId: 't-1' } };
    client.send(msg);

    // No WebSocket exists, so no send call
    expect(WebSocket).not.toHaveBeenCalled();
  });

  it('should emit onError and transition to error status on ws error', () => {
    const events = makeEvents();
    const client = new WebSocketClient(makeOptions(), events);

    client.connect();
    const error = new Error('connection refused');
    latestMockWs._trigger('error', error);

    expect(events.onError).toHaveBeenCalledWith(error);
    expect(client.getStatus()).toBe('error');
  });

  it('should track in-flight jobs on disconnect and report them on reconnect', () => {
    const events = makeEvents();
    const client = new WebSocketClient(makeOptions(), events);

    client.setActiveJobsProvider(() => ['j-100', 'j-200']);

    client.connect();
    latestMockWs._trigger('open');

    const firstWs = latestMockWs;
    firstWs._trigger('close', 1006, Buffer.from('lost'));

    // Reconnect
    vi.advanceTimersByTime(1_000);
    const secondWs = latestMockWs;
    secondWs._trigger('open');

    // Should have sent job-error for each in-flight job
    const sentMessages = secondWs.send.mock.calls.map(
      (call: unknown[]) => JSON.parse(call[0] as string),
    );
    const jobErrors = sentMessages.filter(
      (m: Record<string, unknown>) => m.type === 'job-error',
    );

    expect(jobErrors).toHaveLength(2);
    expect(jobErrors[0].jobId).toBe('j-100');
    expect(jobErrors[1].jobId).toBe('j-200');
  });

  it('should emit proxy warning via onError after repeated failures', () => {
    const events = makeEvents();
    const client = new WebSocketClient(
      makeOptions({ reconnectMaxDelayMs: 10 }),
      events,
    );

    client.connect();

    // Simulate 6 consecutive failures (>5 triggers the warning)
    for (let i = 0; i < 6; i++) {
      latestMockWs._trigger('close', 1006, Buffer.from(''));
      vi.advanceTimersByTime(100_000); // advance past any backoff
    }

    // The proxy warning should have been emitted via onError
    const errorCalls = (events.onError as ReturnType<typeof vi.fn>).mock.calls;
    const proxyWarning = errorCalls.find(
      (call: unknown[]) => call[0] instanceof Error && (call[0] as Error).message.includes('proxy'),
    );
    expect(proxyWarning).toBeDefined();
  });
});
