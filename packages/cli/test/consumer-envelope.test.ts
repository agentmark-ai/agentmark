/**
 * Consumer-side envelope contract tests for the CLI's React API client
 * (`src/lib/api/*`).
 *
 * These pin the boundary translation between the canonical wire shape
 * (snake_case, OTLP-aligned) emitted by the api-server and the consumer's
 * domain shape (camelCase, with rich fields nested under `data`).
 *
 * Regression scope: trace detail Input/Output empty (B1), span tree NaN
 * latency (B2), trace-level vs span-level status drift (B4). These bugs
 * all stemmed from the consumer reading wire fields with the wrong key
 * or path; the tests below would have caught each one.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/config/api', () => ({
  API_URL: 'http://localhost:9418',
}));

// The UI-components type import is irrelevant to runtime behavior — stub
// it so the test doesn't need the full ui-components build.
vi.mock('@agentmark-ai/ui-components', () => ({}));

import { getSpanIO } from '../src/lib/api/spans';
import {
  getTraceById,
  wireSpanToSpanData,
  wireTraceDetailToTraceData,
} from '../src/lib/api/traces';

// ---------------------------------------------------------------------------
// getSpanIO — lazy-loaded per-span Input/Output translator (B1 root cause)
// ---------------------------------------------------------------------------

describe('getSpanIO — boundary translation', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  it('hits /v1/traces/:traceId/spans/:spanId on the API_URL', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          input: '[]',
          output: 'hi',
          output_object: null,
          tool_calls: null,
        },
      }),
    } as Response);

    await getSpanIO('trace-1', 'span-2');

    const calledUrl = String(fetchSpy.mock.calls[0]![0]);
    expect(calledUrl).toBe(
      'http://localhost:9418/v1/traces/trace-1/spans/span-2',
    );
  });

  it('encodes path segments so trace/span ids with reserved chars round-trip', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: { input: '', output: '', output_object: null, tool_calls: null },
      }),
    } as Response);

    await getSpanIO('a/b', 'c d');

    const calledUrl = String(fetchSpy.mock.calls[0]![0]);
    expect(calledUrl).toBe(
      'http://localhost:9418/v1/traces/a%2Fb/spans/c%20d',
    );
  });

  it('unwraps the canonical { data: SpanIO } envelope and renames to camelCase', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          input: '[{"role":"user","content":"hi"}]',
          output: 'hello back',
          output_object: '{"a":1}',
          tool_calls: '[{"toolName":"x"}]',
        },
      }),
    } as Response);

    const io = await getSpanIO('t1', 's1');

    expect(io).toEqual({
      input: '[{"role":"user","content":"hi"}]',
      output: 'hello back',
      // snake_case -> camelCase rename is the whole point.
      outputObject: '{"a":1}',
      toolCalls: '[{"toolName":"x"}]',
    });
    // Future-proofing: the consumer must NOT see the wire field names.
    expect(io).not.toHaveProperty('output_object');
    expect(io).not.toHaveProperty('tool_calls');
  });

  it('returns null on 404 (span not found) without throwing', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: { code: 'not_found' } }),
    } as Response);

    const io = await getSpanIO('t1', 'missing');
    expect(io).toBeNull();
  });

  it('returns null and logs on network error (does not crash the renderer)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const io = await getSpanIO('t1', 's1');
    expect(io).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('coerces null IO fields to empty/null per consumer contract', async () => {
    // The renderer's mergeSpanIO writes whatever shape we hand back into
    // SpanData. Null `input`/`output` would crash the JSON.parse path
    // in extractPromptsFromSpan; coerce to '' so the renderer can
    // safely fall through to its empty-string handling.
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: { input: null, output: null, output_object: null, tool_calls: null },
      }),
    } as Response);

    const io = await getSpanIO('t1', 's1');
    expect(io).toEqual({
      input: '',
      output: '',
      outputObject: null,
      toolCalls: null,
    });
  });
});

// ---------------------------------------------------------------------------
// wireSpanToSpanData — single span row translator (B2 + B4 root cause)
// ---------------------------------------------------------------------------

describe('wireSpanToSpanData', () => {
  it('places duration_ms at the TOP level so the tree renders inner-span latency (not NaNs)', () => {
    // B2: trace-tree.tsx reads `node.duration` (top-level on SpanData),
    // not `node.data.duration`. If the mapper buried duration only
    // under `.data` the tree shows "NaNs" for every inner span.
    const span = wireSpanToSpanData({
      id: 'inner',
      trace_id: 't1',
      parent_id: 'root',
      name: 'invoke_agent',
      duration_ms: 3550,
      timestamp: '2026-05-08T13:36:04.031Z',
      type: 'SPAN',
      status: 'OK',
    });

    expect(span.duration).toBe(3550);
  });

  it('maps canonical OTel string status to the numeric form trace-label.tsx requires', () => {
    // B4: the icon renderer in @agentmark-ai/ui-components reads
    // `data.status === "0" || "1"` to decide success vs error. Wire
    // emits "OK"/"UNSET"/"ERROR" post-snake_case sweep; the boundary
    // translator must produce "0"/"1"/"2" so the renderer matches.
    // Mirrors the dashboard's mapStatusToOtel utility — same renderer,
    // same input contract, both consumers must transform identically.
    expect(wireSpanToSpanData({ id: 's', name: 'x', duration_ms: 1, timestamp: 0, status: 'OK' }).data.status).toBe('1');
    expect(wireSpanToSpanData({ id: 's', name: 'x', duration_ms: 1, timestamp: 0, status: 'UNSET' }).data.status).toBe('0');
    expect(wireSpanToSpanData({ id: 's', name: 'x', duration_ms: 1, timestamp: 0, status: 'ERROR' }).data.status).toBe('2');
    // Unknown / missing status → "0" (UNSET, treated as success). This
    // matches the dashboard's mapStatusToOtel default branch.
    expect(wireSpanToSpanData({ id: 's', name: 'x', duration_ms: 1, timestamp: 0 }).data.status).toBe('0');
  });

  it('renames snake_case rich fields to camelCase under `data`', () => {
    const span = wireSpanToSpanData({
      id: 's1',
      trace_id: 't1',
      parent_id: null,
      name: 'chat',
      duration_ms: 1000,
      timestamp: '2026-01-01T00:00:00Z',
      type: 'GENERATION',
      model: 'claude-haiku',
      input_tokens: 100,
      output_tokens: 50,
      tokens: 150,
      reasoning_tokens: 10,
      cost: 0.001,
      input: '[]',
      output: 'hi',
      output_object: '{"a":1}',
      tool_calls: '[]',
      finish_reason: 'stop',
      session_id: 'sess-1',
      session_name: 'My session',
      user_id: 'u-1',
      prompt_name: 'p-1',
      span_kind: 'CLIENT',
      service_name: 'app',
      status: 'OK',
      status_message: '',
    });

    expect(span.data).toMatchObject({
      type: 'GENERATION',
      model: 'claude-haiku',
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      reasoningTokens: 10,
      cost: 0.001,
      input: '[]',
      output: 'hi',
      outputObject: '{"a":1}',
      toolCalls: '[]',
      finishReason: 'stop',
      sessionId: 'sess-1',
      sessionName: 'My session',
      userId: 'u-1',
      promptName: 'p-1',
      spanKind: 'CLIENT',
      serviceName: 'app',
      // Status mapped to OTel numeric form ("OK" → "1") to match the
      // renderer contract — see the dedicated mapStatusToOtel test
      // above.
      status: '1',
    });
  });

  it('maps parent_id=null to undefined (root span) for the tree builder', () => {
    // The tree builder treats parentId being absent / falsy as "root".
    // Carrying through `null` would still work, but undefined is the
    // domain shape (`SpanData.parentId?: string`).
    const span = wireSpanToSpanData({
      id: 's',
      trace_id: 't',
      parent_id: null,
      name: 'x',
      duration_ms: 1,
      timestamp: 0,
    });
    expect(span.parentId).toBeUndefined();
  });

  it('mirrors total tokens at BOTH data.tokens and data.totalTokens for the tree token+cost chips', () => {
    // The trace-drawer's `findCostAndTokens` (and the per-span Label
    // chips in `trace-label.tsx` that gate cost on `Boolean(Number(tokens))`)
    // read `data.tokens` directly — NOT `data.totalTokens`. If the
    // boundary translator only sets `data.totalTokens`, every per-span
    // token + cost chip silently disappears from the tree, even though
    // the wire carries the data. Pin both keys.
    const span = wireSpanToSpanData({
      id: 'gen',
      trace_id: 't',
      parent_id: 'root',
      name: 'chat',
      duration_ms: 1234,
      timestamp: 0,
      tokens: 150,
      input_tokens: 100,
      output_tokens: 50,
      cost: 0.0042,
    });
    expect(span.data.tokens).toBe(150);
    expect(span.data.totalTokens).toBe(150);
    expect(span.data.cost).toBe(0.0042);
  });

  it('falls back to camelCase totalTokens when wire emits the camelCase key', () => {
    // Defensive: if a fixture (or a future migration step) uses camelCase
    // `totalTokens` instead of snake_case `tokens`, both `data.tokens`
    // and `data.totalTokens` should still see the same value.
    const span = wireSpanToSpanData({
      id: 'gen',
      trace_id: 't',
      name: 'chat',
      duration_ms: 1,
      timestamp: 0,
      totalTokens: 200,
    });
    expect(span.data.tokens).toBe(200);
    expect(span.data.totalTokens).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// wireTraceDetailToTraceData + getTraceById — full trace envelope (B1 prereq)
// ---------------------------------------------------------------------------

describe('wireTraceDetailToTraceData', () => {
  it('wraps spans through wireSpanToSpanData and exposes latency_ms as data.latency', () => {
    // The synthetic-root wrapper in trace-drawer-provider.tsx reads
    // `trace.data.latency` to populate its outer "3.8s" badge. If the
    // translator drops latency, the outer wrapper renders NaNs too.
    const trace = wireTraceDetailToTraceData({
      id: 'trace-1',
      name: 'experiment',
      status: 'OK',
      latency_ms: 3802,
      cost: 0.003,
      tokens: 2173,
      spans: [
        {
          id: 'root',
          trace_id: 'trace-1',
          parent_id: null,
          name: 'experiment',
          duration_ms: 3802,
          timestamp: '2026-05-08T13:36:03.781Z',
          status: 'OK',
        },
      ],
    });

    expect(trace.id).toBe('trace-1');
    expect(trace.data.latency).toBe(3802);
    // Trace-level status maps to OTel numeric form too (same as spans).
    expect(trace.data.status).toBe('1');
    expect(trace.spans).toHaveLength(1);
    expect(trace.spans[0]!.duration).toBe(3802);
    // Span-level duration mirrored at .data.duration so renderers
    // reading `node.data.duration` (the dashboard pattern) work too.
    expect(trace.spans[0]!.data.duration).toBe(3802);
  });

  it('handles a trace with zero spans without crashing', () => {
    const trace = wireTraceDetailToTraceData({
      id: 't',
      name: 'empty',
      status: 'OK',
      latency_ms: 0,
      cost: 0,
      tokens: 0,
      spans: [],
    });
    expect(trace.spans).toEqual([]);
  });
});

describe('getTraceById', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  it('reads the canonical { data: TraceDetail } envelope (regression: was reading data.trace)', async () => {
    // Pre-fix the consumer read `data.trace` which was always undefined,
    // so the trace drawer always showed "Trace not found". This is the
    // load-bearing regression test for that bug.
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 't-1',
          name: 'My trace',
          status: 'OK',
          latency_ms: 1500,
          cost: 0,
          tokens: 0,
          spans: [],
        },
      }),
    } as Response);

    const trace = await getTraceById('t-1');
    expect(trace).not.toBeNull();
    expect(trace!.id).toBe('t-1');
    expect(trace!.name).toBe('My trace');
  });

  it('returns null on 404 (trace not found)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: { code: 'not_found' } }),
    } as Response);

    const trace = await getTraceById('missing');
    expect(trace).toBeNull();
  });

  it('tolerates the legacy { trace: ... } shape so older mocks keep working', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        trace: {
          id: 't-1',
          name: 'Legacy',
          status: 'OK',
          latency_ms: 1,
          cost: 0,
          tokens: 0,
          spans: [],
        },
      }),
    } as Response);

    const trace = await getTraceById('t-1');
    expect(trace).not.toBeNull();
    expect(trace!.id).toBe('t-1');
  });
});
