import { describe, it, expect, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { runSmoke, bootDevServer, SMOKE_GROUP, type SmokeOptions, type BootOptions } from '../cli-src/commands/doctor-smoke';
import type { CheckResult, CheckStatus } from '../cli-src/commands/doctor';

const statusOf = (rs: CheckResult[], id: string): CheckStatus | undefined => rs.find((r) => r.id === id)?.status;
const detailOf = (rs: CheckResult[], id: string): string | undefined => rs.find((r) => r.id === id)?.detail;
const titleOf = (rs: CheckResult[], id: string): string | undefined => rs.find((r) => r.id === id)?.title;

const tmpDirs: string[] = [];
function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-smoke-'));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

interface MockResponseSpec {
  ok: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
  throwErr?: unknown;
}

function makeRes(spec: MockResponseSpec) {
  return {
    ok: spec.ok,
    status: spec.status ?? (spec.ok ? 200 : 404),
    statusText: spec.statusText ?? '',
    json: async () => spec.body,
    text: async () => (typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body ?? '')),
  };
}

/**
 * Routes requests the way the dev server does: prompt-run POSTs to `webhook`,
 * get-evals POSTs to `evals` (the control-plane job), and GETs to `trace` (by
 * poll index). The two POST jobs are told apart by request body `type` — exactly
 * how the real server distinguishes them — so a handler can answer one and not
 * the other (the empty-dialog bug: prompt-run works, get-evals doesn't). `evals`
 * defaults to a well-formed empty registry so existing tests don't have to know
 * about the new check.
 */
function mockFetch(handlers: {
  webhook: () => MockResponseSpec;
  evals?: () => MockResponseSpec;
  trace?: (callIndex: number) => MockResponseSpec;
}): typeof fetch {
  let traceCalls = 0;
  return (async (_url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') {
      let jobType: string | undefined;
      try {
        jobType = (JSON.parse(init.body ?? '{}') as { type?: string }).type;
      } catch {
        /* leave undefined → treated as the prompt-run path */
      }
      const defaultEvals = (): MockResponseSpec => ({ ok: true, body: { type: 'evals', result: '[]', traceId: '' } });
      const spec = jobType === 'get-evals' ? (handlers.evals ?? defaultEvals)() : handlers.webhook();
      if (spec.throwErr) throw spec.throwErr;
      return makeRes(spec);
    }
    const spec = handlers.trace ? handlers.trace(traceCalls++) : { ok: false, status: 404 };
    return makeRes(spec);
  }) as unknown as typeof fetch;
}

/** Defaults that keep tests offline + fast: fake AST, no real sleeping. */
function opts(over: Partial<SmokeOptions>): SmokeOptions {
  return {
    cwd: '/proj',
    promptPath: 'agentmark/greeting.prompt.mdx',
    loadAstImpl: async () => ({ ast: { type: 'root', children: [] }, promptName: 'greeting' }),
    sleepImpl: async () => {},
    tracePollMs: 10,
    traceTimeoutMs: 30,
    ...over,
  };
}

const WELL_FORMED_TRACE = {
  data: {
    tokens: { total: 20 },
    input: 'Hi',
    output: 'Hello',
    spans: [{ model: 'openai/gpt-4o', type: 'GENERATION' }],
  },
};
const RAN_OK = { type: 'text', result: 'Hello', usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 }, traceId: 't-123' };

describe('runSmoke', () => {
  it('passes all four live checks on a real run + listable evals + well-formed trace', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({
          webhook: () => ({ ok: true, body: RAN_OK }),
          evals: () => ({ ok: true, body: { type: 'evals', result: '["mentions_topic","is_concise"]', traceId: '' } }),
          trace: (i) => (i === 0 ? { ok: false, status: 404 } : { ok: true, body: WELL_FORMED_TRACE }),
        }),
      }),
    );

    expect(statusOf(results, 'smoke.run')).toBe('pass');
    expect(detailOf(results, 'smoke.run')).toContain('20 total');
    expect(statusOf(results, 'smoke.evals')).toBe('pass');
    expect(detailOf(results, 'smoke.evals')).toContain('mentions_topic');
    expect(detailOf(results, 'smoke.evals')).toContain('is_concise');
    expect(statusOf(results, 'smoke.trace')).toBe('pass');
    expect(detailOf(results, 'smoke.trace')).toContain('openai/gpt-4o');
    expect(statusOf(results, 'smoke.traceShape')).toBe('pass');
    // All checks belong to the live group so the report renders them together.
    expect(results.every((r) => r.group === SMOKE_GROUP)).toBe(true);
  });

  it('fails smoke.evals when the handler cannot answer get-evals (the empty-dialog bug)', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({
          webhook: () => ({ ok: true, body: RAN_OK }),
          evals: () => ({ ok: false, status: 500, statusText: 'Internal Server Error' }),
          trace: () => ({ ok: true, body: WELL_FORMED_TRACE }),
        }),
      }),
    );

    // The run itself is fine — only the get-evals control-plane job is broken,
    // which is exactly the "No evals available" dialog with a working prompt.
    expect(statusOf(results, 'smoke.run')).toBe('pass');
    expect(statusOf(results, 'smoke.evals')).toBe('fail');
    expect(detailOf(results, 'smoke.evals')).toContain('500');
    // The fix names the canonical handler — routing get-evals is precisely what a
    // hand-rolled prompt-run/dataset-run switch silently drops.
    expect(results.find((r) => r.id === 'smoke.evals')?.fix).toContain('runner.dispatch');
  });

  it('fails smoke.evals when get-evals returns the wrong shape (not a {type:"evals"} envelope)', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({
          webhook: () => ({ ok: true, body: RAN_OK }),
          // 200 OK, but a prompt-run-shaped body — what a handler that doesn't
          // special-case get-evals returns when the job falls through its switch.
          evals: () => ({ ok: true, body: { type: 'text', result: 'Hello', traceId: '' } }),
          trace: () => ({ ok: true, body: WELL_FORMED_TRACE }),
        }),
      }),
    );

    expect(statusOf(results, 'smoke.evals')).toBe('fail');
    expect(detailOf(results, 'smoke.evals')).toContain('not with the expected');
    expect(results.find((r) => r.id === 'smoke.evals')?.fix).toContain('runner.dispatch');
  });

  it('passes smoke.evals with a note when the client has no evals registered', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({
          webhook: () => ({ ok: true, body: RAN_OK }),
          evals: () => ({ ok: true, body: { type: 'evals', result: '[]', traceId: '' } }),
          trace: () => ({ ok: true, body: WELL_FORMED_TRACE }),
        }),
      }),
    );

    // An empty (but valid) registry is a pass, not a failure — the handler routes
    // get-evals correctly; the user just hasn't registered any evals yet.
    expect(statusOf(results, 'smoke.evals')).toBe('pass');
    expect(detailOf(results, 'smoke.evals')).toContain('0 evals registered');
  });

  it('warns (not fails) when the get-evals request itself errors', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({
          webhook: () => ({ ok: true, body: RAN_OK }),
          evals: () => ({ ok: false, throwErr: new Error('socket hang up') }),
          trace: () => ({ ok: true, body: WELL_FORMED_TRACE }),
        }),
      }),
    );

    // A thrown request is inconclusive (could be a transient blip), not proof the
    // handler is wrong — warn, and don't let it block the trace checks that follow.
    expect(statusOf(results, 'smoke.evals')).toBe('warn');
    expect(detailOf(results, 'smoke.evals')).toContain('socket hang up');
    expect(statusOf(results, 'smoke.trace')).toBe('pass');
  });

  it('fails with dev-server guidance when the webhook is unreachable', async () => {
    const econn = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    const results = await runSmoke(
      opts({ fetchImpl: mockFetch({ webhook: () => ({ ok: false, throwErr: econn }) }) }),
    );

    expect(results).toHaveLength(1); // returns early — later checks can't be meaningful
    expect(statusOf(results, 'smoke.run')).toBe('fail');
    expect(detailOf(results, 'smoke.run')).toContain('could not reach the dev server');
    expect(results[0].fix).toContain('npx @agentmark-ai/cli dev');
  });

  it('fails the run when the server responds but reports no token usage', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({ webhook: () => ({ ok: true, body: { type: 'text', result: 'Hello', traceId: 't-1' } }) }),
      }),
    );

    expect(statusOf(results, 'smoke.run')).toBe('fail');
    expect(detailOf(results, 'smoke.run')).toContain('no token usage');
    expect(statusOf(results, 'smoke.trace')).toBeUndefined();
  });

  it('fails the run when the server returns empty content', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({ webhook: () => ({ ok: true, body: { type: 'text', result: '   ', usage: { totalTokens: 5 }, traceId: 't-1' } }) }),
      }),
    );

    expect(statusOf(results, 'smoke.run')).toBe('fail');
    expect(detailOf(results, 'smoke.run')).toContain('no content');
  });

  it('fails trace when the run succeeds but no traceId comes back', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({ webhook: () => ({ ok: true, body: { type: 'text', result: 'Hello', usage: { totalTokens: 20 } } }) }),
      }),
    );

    expect(statusOf(results, 'smoke.run')).toBe('pass');
    expect(statusOf(results, 'smoke.trace')).toBe('fail');
    expect(detailOf(results, 'smoke.trace')).toContain('no traceId');
  });

  it('fails trace when it never lands within the timeout', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({ webhook: () => ({ ok: true, body: RAN_OK }), trace: () => ({ ok: false, status: 404 }) }),
      }),
    );

    expect(statusOf(results, 'smoke.run')).toBe('pass');
    expect(statusOf(results, 'smoke.trace')).toBe('fail');
    expect(detailOf(results, 'smoke.trace')).toContain('did not arrive');
    expect(statusOf(results, 'smoke.traceShape')).toBeUndefined();
  });

  it('flags a trace that landed but is missing output', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({
          webhook: () => ({ ok: true, body: RAN_OK }),
          trace: () => ({ ok: true, body: { data: { tokens: { total: 20 }, input: 'Hi', spans: [{ model: 'openai/gpt-4o' }] } } }),
        }),
      }),
    );

    // The trace round-tripped (smoke.trace passes) but is incomplete.
    expect(statusOf(results, 'smoke.trace')).toBe('pass');
    expect(statusOf(results, 'smoke.traceShape')).toBe('fail');
    expect(detailOf(results, 'smoke.traceShape')).toContain('output');
  });

  it('fails the run with the HTTP body when the dev server returns non-2xx', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({ webhook: () => ({ ok: false, status: 500, statusText: 'Internal Server Error', body: 'boom: invalid api key' }) }),
      }),
    );

    expect(statusOf(results, 'smoke.run')).toBe('fail');
    expect(detailOf(results, 'smoke.run')).toContain('500');
    expect(detailOf(results, 'smoke.run')).toContain('boom: invalid api key');
  });

  // Each form of connection failure must independently read as "unreachable"
  // (the three branches of isConnRefused: cause.code, ECONNREFUSED message,
  // fetch-failed message).
  it.each([
    ['fetch-failed message, no cause', new Error('fetch failed')],
    ['ECONNREFUSED in the message, no cause', new Error('connect ECONNREFUSED 127.0.0.1:9417')],
    ['cause.code only, unrelated message', Object.assign(new Error('boom'), { cause: { code: 'ECONNREFUSED' } })],
  ])('treats a %s error as the dev server being unreachable', async (_label, err) => {
    const results = await runSmoke(opts({ fetchImpl: mockFetch({ webhook: () => ({ ok: false, throwErr: err }) }) }));
    expect(results).toHaveLength(1);
    expect(statusOf(results, 'smoke.run')).toBe('fail');
    expect(detailOf(results, 'smoke.run')).toContain('could not reach the dev server');
  });

  it('reports a non-connection request error verbatim (not as "unreachable")', async () => {
    const results = await runSmoke(
      opts({ fetchImpl: mockFetch({ webhook: () => ({ ok: false, throwErr: new Error('socket hang up') }) }) }),
    );
    expect(statusOf(results, 'smoke.run')).toBe('fail');
    expect(detailOf(results, 'smoke.run')).toContain('socket hang up');
    expect(detailOf(results, 'smoke.run')).not.toContain('could not reach');
  });

  it('accepts a non-empty object result, not just text', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({
          webhook: () => ({ ok: true, body: { type: 'object', result: { answer: 'Paris' }, usage: { totalTokens: 20 }, traceId: 't-1' } }),
          trace: () => ({ ok: true, body: WELL_FORMED_TRACE }),
        }),
      }),
    );
    expect(statusOf(results, 'smoke.run')).toBe('pass');
  });

  it('treats an empty object result as no content', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({ webhook: () => ({ ok: true, body: { type: 'object', result: {}, usage: { totalTokens: 20 }, traceId: 't-1' } }) }),
      }),
    );
    expect(statusOf(results, 'smoke.run')).toBe('fail');
    expect(detailOf(results, 'smoke.run')).toContain('no content');
  });

  it('discovers the first prompt when none is given, and runs it', async () => {
    const dir = makeProject({
      'agentmark.json': JSON.stringify({ version: '2.0.0', agentmarkPath: '.' }),
      'agentmark/greeting.prompt.mdx': '---\ntext_config:\n  model_name: openai/gpt-4o\n---\nHi',
    });
    // No promptPath -> exercises readAgentmarkConfig + promptsDir + findPromptFiles.
    const results = await runSmoke({
      cwd: dir,
      loadAstImpl: async () => ({ ast: { type: 'root', children: [] }, promptName: 'greeting' }),
      sleepImpl: async () => {},
      fetchImpl: mockFetch({ webhook: () => ({ ok: true, body: RAN_OK }), trace: () => ({ ok: true, body: WELL_FORMED_TRACE }) }),
    });
    expect(statusOf(results, 'smoke.run')).toBe('pass');
    expect(titleOf(results, 'smoke.run')).toContain('greeting.prompt.mdx');
  });

  it('fails with smoke.prompt when there is no prompt to discover', async () => {
    const dir = makeProject({
      'agentmark.json': JSON.stringify({ version: '2.0.0', agentmarkPath: '.' }),
      'agentmark/.gitkeep': '',
    });
    const results = await runSmoke({
      cwd: dir,
      loadAstImpl: async () => ({ ast: {}, promptName: 'x' }),
      fetchImpl: mockFetch({ webhook: () => ({ ok: true, body: RAN_OK }) }),
    });
    expect(results).toHaveLength(1);
    expect(statusOf(results, 'smoke.prompt')).toBe('fail');
    expect(detailOf(results, 'smoke.prompt')).toContain('no .prompt.mdx');
  });

  it('fails with smoke.prompt when the prompt cannot be parsed', async () => {
    const results = await runSmoke(
      opts({
        loadAstImpl: async () => {
          throw new Error('TemplateDX boom');
        },
        fetchImpl: mockFetch({ webhook: () => ({ ok: true, body: RAN_OK }) }),
      }),
    );
    expect(statusOf(results, 'smoke.prompt')).toBe('fail');
    expect(detailOf(results, 'smoke.prompt')).toContain('could not parse');
  });

  // smoke.generationSpan — Requests view + cost attribution
  it('passes smoke.generationSpan when the trace has a GENERATION-type span', async () => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({
          webhook: () => ({ ok: true, body: RAN_OK }),
          trace: () => ({ ok: true, body: WELL_FORMED_TRACE }),
        }),
      }),
    );

    expect(statusOf(results, 'smoke.generationSpan')).toBe('pass');
    expect(detailOf(results, 'smoke.generationSpan')).toContain('openai/gpt-4o');
  });

  it('fails smoke.generationSpan when the trace has no GENERATION span — executor missed gen_ai.operation.name', async () => {
    const traceWithoutGenerationSpan = {
      data: {
        tokens: { total: 20 },
        input: 'Hi',
        output: 'Hello',
        // spans exist but none has type=GENERATION (e.g. old executor, no _classify_span_as_llm)
        spans: [{ model: 'openai/gpt-4o', type: 'SPAN' }],
      },
    };
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({
          webhook: () => ({ ok: true, body: RAN_OK }),
          trace: () => ({ ok: true, body: traceWithoutGenerationSpan }),
        }),
      }),
    );

    // smoke.run and smoke.traceShape pass — tokens, input, output, model are all present.
    // Only the GENERATION classification is missing.
    expect(statusOf(results, 'smoke.run')).toBe('pass');
    expect(statusOf(results, 'smoke.traceShape')).toBe('pass');
    expect(statusOf(results, 'smoke.generationSpan')).toBe('fail');
    expect(detailOf(results, 'smoke.generationSpan')).toContain('GENERATION');
    expect(results.find((r) => r.id === 'smoke.generationSpan')?.fix).toContain('gen_ai.operation.name');
  });

  it('fails smoke.generationSpan when the trace has no spans at all', async () => {
    const traceNoSpans = {
      data: { tokens: { total: 20 }, input: 'Hi', output: 'Hello', spans: [] },
    };
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({
          webhook: () => ({ ok: true, body: RAN_OK }),
          trace: () => ({ ok: true, body: traceNoSpans }),
        }),
      }),
    );

    expect(statusOf(results, 'smoke.generationSpan')).toBe('fail');
  });
});

// ── traceShape × generationSpan conformance table ────────────────────────────
//
// These two checks are the only ones whose result depends entirely on the trace
// body. The table below enumerates every structurally-distinct combination so
// that a future edit to either check must turn a row red before it can ship.
// Each row is independent — a single runSmoke call per vector, no shared state.
//
//  traceShape  fails when any of: tokens==null | input==null | output==null |
//              no span has a non-empty `model` string
//  generationSpan  fails when: no span has type==="GENERATION"
//
// The checks are orthogonal: a missing model span keeps `generationSpan` passing
// (type can still be GENERATION on that span); a SPAN-typed span keeps
// `traceShape` passing (model is still present).

describe('traceShape × generationSpan conformance table', () => {
  interface TraceVariant {
    label: string;
    data: {
      tokens?: { total: number } | null;
      input?: string | null;
      output?: string | null;
      spans?: Array<{ model?: string; type?: string }>;
    };
    traceShape: CheckStatus;
    /** Substrings the traceShape detail must contain when traceShape=fail. */
    traceShapeMissing?: string[];
    generationSpan: CheckStatus;
  }

  const GEN_SPAN = { model: 'm', type: 'GENERATION' };

  const vectors: TraceVariant[] = [
    {
      label: 'full trace with GENERATION span',
      data: { tokens: { total: 20 }, input: 'Hi', output: 'Hi back', spans: [GEN_SPAN] },
      traceShape: 'pass',
      generationSpan: 'pass',
    },
    {
      label: 'tokens null',
      data: { tokens: null, input: 'Hi', output: 'Hi back', spans: [GEN_SPAN] },
      traceShape: 'fail',
      traceShapeMissing: ['token usage'],
      generationSpan: 'pass',
    },
    {
      label: 'input null',
      data: { tokens: { total: 20 }, input: null, output: 'Hi back', spans: [GEN_SPAN] },
      traceShape: 'fail',
      traceShapeMissing: ['input'],
      generationSpan: 'pass',
    },
    {
      label: 'output null',
      data: { tokens: { total: 20 }, input: 'Hi', output: null, spans: [GEN_SPAN] },
      traceShape: 'fail',
      traceShapeMissing: ['output'],
      generationSpan: 'pass',
    },
    {
      // model absent from the span — traceShape fails (no model on any span) but
      // the GENERATION type is still present so generationSpan passes.
      label: 'spans have no model field',
      data: { tokens: { total: 20 }, input: 'Hi', output: 'Hi back', spans: [{ type: 'GENERATION' }] },
      traceShape: 'fail',
      traceShapeMissing: ['a model on any span'],
      generationSpan: 'pass',
    },
    {
      // span carries a model but no type field at all — traceShape passes because
      // it only checks for a non-empty model string, not the type.
      label: 'spans have no type field',
      data: { tokens: { total: 20 }, input: 'Hi', output: 'Hi back', spans: [{ model: 'm' }] },
      traceShape: 'pass',
      generationSpan: 'fail',
    },
    {
      // Bedrock/custom executor without _classify_span_as_llm: spans land with
      // type=SPAN (the OTel default) instead of GENERATION.
      label: 'span type=SPAN not GENERATION',
      data: { tokens: { total: 20 }, input: 'Hi', output: 'Hi back', spans: [{ model: 'm', type: 'SPAN' }] },
      traceShape: 'pass',
      generationSpan: 'fail',
    },
    {
      // No spans at all: both fail (no model on any span, no GENERATION span).
      label: 'empty spans array',
      data: { tokens: { total: 20 }, input: 'Hi', output: 'Hi back', spans: [] },
      traceShape: 'fail',
      traceShapeMissing: ['a model on any span'],
      generationSpan: 'fail',
    },
    {
      // Two spans, only the second is GENERATION — both checks should pass since
      // model is on span[0] and generationSpan is on span[1].
      label: 'multiple spans, only one is GENERATION',
      data: {
        tokens: { total: 20 }, input: 'Hi', output: 'Hi back',
        spans: [{ model: 'm', type: 'SPAN' }, { model: 'm', type: 'GENERATION' }],
      },
      traceShape: 'pass',
      generationSpan: 'pass',
    },
    {
      // Both checks fail independently: token usage is missing AND classification
      // is SPAN — the Requests view shows nothing AND cost shows $0.
      label: 'tokens null + type SPAN (both fail independently)',
      data: { tokens: null, input: 'Hi', output: 'Hi back', spans: [{ model: 'm', type: 'SPAN' }] },
      traceShape: 'fail',
      traceShapeMissing: ['token usage'],
      generationSpan: 'fail',
    },
    {
      // Multiple fields absent — the missing array must list all of them.
      label: 'tokens + output both null',
      data: { tokens: null, input: 'Hi', output: null, spans: [GEN_SPAN] },
      traceShape: 'fail',
      traceShapeMissing: ['token usage', 'output'],
      generationSpan: 'pass',
    },
  ];

  it.each(vectors)('$label', async ({ data, traceShape, traceShapeMissing, generationSpan }) => {
    const results = await runSmoke(
      opts({
        fetchImpl: mockFetch({
          webhook: () => ({ ok: true, body: RAN_OK }),
          trace: () => ({ ok: true, body: { data } }),
        }),
      }),
    );

    expect(statusOf(results, 'smoke.traceShape')).toBe(traceShape);
    if (traceShape === 'fail' && traceShapeMissing) {
      const detail = detailOf(results, 'smoke.traceShape') ?? '';
      for (const field of traceShapeMissing) {
        expect(detail).toContain(field);
      }
    }
    expect(statusOf(results, 'smoke.generationSpan')).toBe(generationSpan);
  });
});

/** A minimal ChildProcess stand-in. Fires 'exit'/'error'/'data' synchronously on registration. */
function fakeChild(spec: { pid?: number; exitCode?: number | null; stderr?: string; errorMsg?: string } = {}) {
  const { pid = 4242, exitCode = null, stderr = '', errorMsg = '' } = spec;
  return {
    pid,
    on(event: string, cb: (arg: unknown) => void) {
      if (event === 'exit' && exitCode !== null) cb(exitCode);
      if (event === 'error' && errorMsg) cb(new Error(errorMsg));
    },
    stderr: {
      on(event: string, cb: (chunk: Buffer) => void) {
        if (event === 'data' && stderr) cb(Buffer.from(stderr));
      },
    },
  };
}

function bootOpts(over: Partial<BootOptions>): BootOptions {
  return { cwd: '/proj', sleepImpl: async () => {}, readyPollMs: 10, readyTimeoutMs: 50, ...over };
}

describe('bootDevServer', () => {
  it('resolves once both ports accept, and teardown kills the process tree', async () => {
    const killed: number[] = [];
    let probeCalls = 0;
    const handle = await bootDevServer(
      bootOpts({
        spawnImpl: (() => fakeChild({ pid: 5150 })) as unknown as BootOptions['spawnImpl'],
        probeImpl: async () => ++probeCalls > 2, // both false on iter 1, both true on iter 2
        killImpl: (pid) => killed.push(pid),
      }),
    );
    expect(killed).toEqual([]); // still running until torn down
    handle.teardown();
    expect(killed).toEqual([5150]);
    handle.teardown(); // idempotent
    expect(killed).toEqual([5150]);
  });

  it('rejects with the dev-server stderr tail on early exit (no kill — already dead)', async () => {
    const killed: number[] = [];
    await expect(
      bootDevServer(
        bootOpts({
          spawnImpl: (() =>
            fakeChild({ pid: 5150, exitCode: 1, stderr: 'boom\nError: agentmark.client.ts not found in current directory.' })) as unknown as BootOptions['spawnImpl'],
          probeImpl: async () => false,
          killImpl: (pid) => killed.push(pid),
        }),
      ),
    ).rejects.toThrow(/exited early \(code 1\).*agentmark\.client\.ts not found/);
    expect(killed).toEqual([]);
  });

  it('rejects on timeout and kills the hung process', async () => {
    const killed: number[] = [];
    await expect(
      bootDevServer(
        bootOpts({
          spawnImpl: (() => fakeChild({ pid: 5150 })) as unknown as BootOptions['spawnImpl'],
          probeImpl: async () => false, // never ready
          killImpl: (pid) => killed.push(pid),
        }),
      ),
    ).rejects.toThrow(/did not become ready within/);
    expect(killed).toEqual([5150]);
  });

  it('spawns `agentmark dev` with --no-watch so a crashing dev-entry exits instead of hanging', async () => {
    // Under `tsx --watch`, a dev-entry that throws at load does NOT exit (tsx
    // waits for file changes), so boot would hang to the timeout with no signal.
    // --no-watch makes the crash exit, surfacing the real error.
    let captured: string[] = [];
    let probeCalls = 0;
    const handle = await bootDevServer(
      bootOpts({
        spawnImpl: ((_cmd: string, args: string[]) => {
          captured = args;
          return fakeChild({ pid: 5150 });
        }) as unknown as BootOptions['spawnImpl'],
        probeImpl: async () => ++probeCalls > 2,
        killImpl: () => {},
      }),
    );
    handle.teardown();
    expect(captured).toContain('dev');
    expect(captured).toContain('--no-watch');
  });

  it('surfaces the dev-server stderr tail when boot times out', async () => {
    // A dev-entry alive-but-not-listening (e.g. stuck) produces no early-exit;
    // the timeout error is the only diagnostic, so it must carry the stderr.
    await expect(
      bootDevServer(
        bootOpts({
          spawnImpl: (() =>
            fakeChild({ pid: 5150, stderr: "TypeError: Cannot read properties of undefined (reading 'local')" })) as unknown as BootOptions['spawnImpl'],
          probeImpl: async () => false, // never ready → timeout (not early-exit)
          killImpl: () => {},
        }),
      ),
    ).rejects.toThrow(/did not become ready within.*Last dev-server output:.*Cannot read properties of undefined/);
  });

  it('uses AGENTMARK_DEV_READY_TIMEOUT_MS for the default ready timeout (cold CI boots)', async () => {
    // Without an explicit readyTimeoutMs, the env var sets the budget — a cold
    // `agentmark dev` (tsx compile) on CI needs more than the historical 30s.
    const prev = process.env.AGENTMARK_DEV_READY_TIMEOUT_MS;
    process.env.AGENTMARK_DEV_READY_TIMEOUT_MS = '2000';
    try {
      await expect(
        bootDevServer(
          // readyTimeoutMs: undefined → the destructuring default (env) applies.
          bootOpts({
            readyTimeoutMs: undefined,
            spawnImpl: (() => fakeChild({ pid: 5150 })) as unknown as BootOptions['spawnImpl'],
            probeImpl: async () => false, // never ready → hits the timeout
            killImpl: () => {},
          }),
        ),
      ).rejects.toThrow(/did not become ready within 2s/); // 2000ms, not the 60s base default
    } finally {
      if (prev === undefined) delete process.env.AGENTMARK_DEV_READY_TIMEOUT_MS;
      else process.env.AGENTMARK_DEV_READY_TIMEOUT_MS = prev;
    }
  });

  it('fails fast on a spawn error instead of waiting out the timeout', async () => {
    let probes = 0;
    await expect(
      bootDevServer(
        bootOpts({
          spawnImpl: (() => fakeChild({ pid: 5150, errorMsg: 'spawn node ENOENT' })) as unknown as BootOptions['spawnImpl'],
          probeImpl: async () => { probes++; return false; },
          killImpl: () => {},
        }),
      ),
    ).rejects.toThrow(/could not start agentmark dev: spawn node ENOENT/);
    expect(probes).toBe(0); // threw before polling — never waited for readiness
  });

  it('starts dev headless on the requested ports', async () => {
    let spawnArgs: string[] = [];
    let probeCalls = 0;
    const handle = await bootDevServer(
      bootOpts({
        webhookPort: 9517,
        apiPort: 9518,
        spawnImpl: ((_cmd: string, args: string[]) => {
          spawnArgs = args;
          return fakeChild({ pid: 5150 });
        }) as unknown as BootOptions['spawnImpl'],
        probeImpl: async () => ++probeCalls > 2,
        killImpl: () => {},
      }),
    );
    handle.teardown();
    expect(spawnArgs[1]).toBe('dev');
    expect(spawnArgs).toEqual(
      expect.arrayContaining(['--no-ui', '--no-forward', '--webhook-port', '9517', '--api-port', '9518']),
    );
  });

  it('requires BOTH ports up before declaring ready (webhook alone is not enough)', async () => {
    const killed: number[] = [];
    // Promise.all probes [webhook, api] in order each round: webhook up, api never.
    let call = 0;
    await expect(
      bootDevServer(
        bootOpts({
          spawnImpl: (() => fakeChild({ pid: 5150 })) as unknown as BootOptions['spawnImpl'],
          probeImpl: async () => call++ % 2 === 0,
          killImpl: (pid) => killed.push(pid),
        }),
      ),
    ).rejects.toThrow(/did not become ready within/);
    expect(killed).toEqual([5150]);
  });
});
