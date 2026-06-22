import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type Tracer } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import {
  AgentMarkSpanProcessor,
  type AgentMarkGrouping,
  toAgentMarkAttributes,
  withAgentMark,
} from '../src/index';

// Cross-language conformance: @agentmark-ai/otel (TS) and agentmark-sdk (Python)
// must map the friendly grouping API to the same `agentmark.*` span attributes.
// Both load these golden vectors so the mapping can't drift apart.
const vector = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        '../../conformance-vectors/vectors/grouping-attributes.json',
        import.meta.url,
      ),
    ),
    'utf8',
  ),
) as { cases: { name: string; input: AgentMarkGrouping; expected: Record<string, string> }[] };

describe('grouping-attributes conformance vectors', () => {
  for (const c of vector.cases) {
    it(c.name, () => {
      expect(toAgentMarkAttributes(c.input)).toEqual(c.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// Enrichment through the real OTel span pipeline (in-memory exporter).
const memory = new InMemorySpanExporter();
let provider: NodeTracerProvider;
let tracer: Tracer;

beforeAll(() => {
  provider = new NodeTracerProvider({
    spanProcessors: [new AgentMarkSpanProcessor({ exporter: memory })],
  });
  provider.register();
  tracer = provider.getTracer('test');
});
afterEach(() => memory.reset());
afterAll(async () => {
  await provider.shutdown();
});

async function emitSpan(name: string): Promise<void> {
  await Promise.resolve();
  const span = tracer.startSpan(name);
  await Promise.resolve();
  span.end();
}
async function flushedSpans(): Promise<ReadableSpan[]> {
  await provider.forceFlush();
  return memory.getFinishedSpans();
}
const byName = (spans: ReadableSpan[], name: string): ReadableSpan =>
  spans.find((s) => s.name === name) as ReadableSpan;
const session = (s: ReadableSpan): unknown => s.attributes['agentmark.session_id'];

describe('withAgentMark + AgentMarkSpanProcessor', () => {
  it('stamps grouping onto a span started inside the scope', async () => {
    await withAgentMark(
      { sessionId: 's1', userId: 'u1', tags: ['prod'], metadata: { feature: 'x' } },
      () => emitSpan('inside'),
    );
    const span = byName(await flushedSpans(), 'inside');
    expect({
      session: span.attributes['agentmark.session_id'],
      user: span.attributes['agentmark.user_id'],
      tags: span.attributes['agentmark.tags'],
      feature: span.attributes['agentmark.metadata.feature'],
    }).toEqual({ session: 's1', user: 'u1', tags: '["prod"]', feature: 'x' });
  });

  it('leaves a span ungrouped when started outside any scope', async () => {
    await emitSpan('outside');
    const span = byName(await flushedSpans(), 'outside');
    expect(span.attributes).not.toHaveProperty('agentmark.session_id');
    expect(span.attributes).not.toHaveProperty('agentmark.tags');
  });

  it('merges nested scopes — inner overrides, outer preserved', async () => {
    await withAgentMark({ sessionId: 'outer', userId: 'u-outer' }, () =>
      withAgentMark({ sessionId: 'inner' }, () => emitSpan('nested')),
    );
    const span = byName(await flushedSpans(), 'nested');
    expect({
      session: span.attributes['agentmark.session_id'],
      user: span.attributes['agentmark.user_id'],
    }).toEqual({ session: 'inner', user: 'u-outer' });
  });
});

describe('concurrent isolation', () => {
  it('keeps each interleaved scope’s grouping separate', async () => {
    const n = 8;
    await Promise.all(
      Array.from({ length: n }, (_, i) =>
        withAgentMark({ sessionId: `sess-${i}` }, () => emitSpan(`c-${i}`)),
      ),
    );
    const spans = await flushedSpans();
    const actual = Array.from({ length: n }, (_, i) => session(byName(spans, `c-${i}`)));
    expect(actual).toEqual(Array.from({ length: n }, (_, i) => `sess-${i}`));
  });
});

describe('AgentMarkSpanProcessor construction', () => {
  it('throws without apiKey/appId and no injected exporter', () => {
    expect(() => new AgentMarkSpanProcessor({})).toThrow(/requires \{ apiKey, appId \}/);
  });

  it('accepts apiKey + appId (builds the default OTLP exporter)', () => {
    const processor = new AgentMarkSpanProcessor({ apiKey: 'k', appId: 'a' });
    expect(typeof processor.onStart).toBe('function');
  });
});
