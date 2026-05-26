import { describe, it, expect } from 'vitest';
import { resolveSemanticKind } from '../../src/normalizer/resolvers/semantic-kind-resolver';
import { SpanType } from '../../src/normalizer/types';

/**
 * The Vercel AI SDK emits ai.operationId WITH the "ai." prefix
 * (e.g. "ai.generateText"). The framework map must match the prefixed value so
 * generation wrappers resolve to "llm" instead of falling through to the
 * "function" default — otherwise the dashboard mis-renders them (props/tool
 * label in place of the messages, dropped object output).
 */
describe('resolveSemanticKind — Vercel AI SDK ai.operationId', () => {
  const span = (name: string, type: SpanType = SpanType.SPAN) => ({ type, name });

  it("resolves prefixed generation wrappers to 'llm'", () => {
    expect(resolveSemanticKind(span('ai.generateText'), { 'ai.operationId': 'ai.generateText' })).toBe('llm');
    expect(resolveSemanticKind(span('ai.generateObject'), { 'ai.operationId': 'ai.generateObject' })).toBe('llm');
    expect(resolveSemanticKind(span('ai.streamText'), { 'ai.operationId': 'ai.streamText' })).toBe('llm');
    expect(resolveSemanticKind(span('ai.streamObject'), { 'ai.operationId': 'ai.streamObject' })).toBe('llm');
  });

  it("still resolves unprefixed operation ids to 'llm' (back-compat)", () => {
    expect(resolveSemanticKind(span('generateText'), { 'ai.operationId': 'generateText' })).toBe('llm');
  });

  it("resolves prefixed embed to 'embedding'", () => {
    expect(resolveSemanticKind(span('ai.embed'), { 'ai.operationId': 'ai.embed' })).toBe('embedding');
  });

  it("a SPAN with no generation signal falls through to 'function'", () => {
    expect(resolveSemanticKind(span('customer-support'), {})).toBe('function');
  });
});

/**
 * Vendor-neutral catch-all: any span carrying a model (OTel gen_ai.request.model,
 * surfaced as NormalizedSpan.model) is a generation, regardless of framework or
 * span name — and a model beats the ToolCalls heuristic (an LLM that requested
 * tools is still a generation).
 */
describe('resolveSemanticKind — model-based generation catch-all', () => {
  it("classifies any span carrying a model as 'llm', regardless of name/framework", () => {
    expect(
      resolveSemanticKind({ type: SpanType.SPAN, name: 'someframework.chat', model: 'gpt-4o' }, {}),
    ).toBe('llm');
  });

  it("a model beats ToolCalls (LLM-that-called-tools is still a generation)", () => {
    expect(
      resolveSemanticKind(
        { type: SpanType.SPAN, name: 'x', model: 'gpt-4o', toolCalls: [{ name: 'search' }] as any },
        {},
      ),
    ).toBe('llm');
  });

  it("ToolCalls without a model still resolves to 'tool'", () => {
    expect(
      resolveSemanticKind(
        { type: SpanType.SPAN, name: 'my_tool', toolCalls: [{ name: 'search' }] as any },
        {},
      ),
    ).toBe('tool');
  });
});
