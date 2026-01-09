import { describe, it, expect } from 'vitest';
import { ClaudeAgentTransformer, isClaudeAgentSpan } from '../../src/normalizer/transformers/claude-agent';
import { SpanType, OtelSpan } from '../../src/normalizer/types';

describe('ClaudeAgentTransformer', () => {
  const transformer = new ClaudeAgentTransformer();

  describe('classify', () => {
    it('should classify session span as GENERATION', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'gen_ai.session',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.system': 'anthropic',
        'gen_ai.request.model': 'claude-sonnet-4-20250514',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify tool call span as SPAN', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-2',
        parentSpanId: 'span-1',
        name: 'gen_ai.tool.call Read',
        kind: 1,
        startTimeUnixNano: '1100000000',
        endTimeUnixNano: '1500000000',
      };

      const attributes = {
        'gen_ai.system': 'anthropic',
        'gen_ai.tool.name': 'Read',
        'gen_ai.tool.call.id': 'tool-123',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });

    it('should classify subagent span as SPAN', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-3',
        parentSpanId: 'span-1',
        name: 'gen_ai.subagent',
        kind: 1,
        startTimeUnixNano: '1200000000',
        endTimeUnixNano: '1800000000',
      };

      const attributes = {
        'gen_ai.system': 'anthropic',
        'agentmark.subagent_type': 'explorer',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });

    it('should classify as GENERATION when anthropic system has token usage', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'custom-span-name',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.system': 'anthropic',
        'gen_ai.usage.input_tokens': 100,
        'gen_ai.usage.output_tokens': 50,
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as SPAN when no matching criteria', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'some-other-span',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {};

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });
  });

  describe('transform', () => {
    it('should extract model from response model attribute', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'gen_ai.session',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.request.model': 'claude-sonnet-4-20250514',
        'gen_ai.response.model': 'claude-sonnet-4-20250514-actual',
      };

      const result = transformer.transform(span, attributes);
      expect(result.model).toBe('claude-sonnet-4-20250514-actual');
    });

    it('should fallback to request model if response model not present', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'gen_ai.session',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.request.model': 'claude-sonnet-4-20250514',
      };

      const result = transformer.transform(span, attributes);
      expect(result.model).toBe('claude-sonnet-4-20250514');
    });

    it('should extract token usage', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'gen_ai.session',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.usage.input_tokens': 150,
        'gen_ai.usage.output_tokens': 75,
      };

      const result = transformer.transform(span, attributes);
      expect(result.inputTokens).toBe(150);
      expect(result.outputTokens).toBe(75);
      expect(result.totalTokens).toBe(225);
    });

    it('should extract finish reason from JSON array', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'gen_ai.session',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.response.finish_reasons': '["end_turn"]',
      };

      const result = transformer.transform(span, attributes);
      expect(result.finishReason).toBe('end_turn');
    });

    it('should extract finish reason as-is if not valid JSON', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'gen_ai.session',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.response.finish_reasons': 'stop',
      };

      const result = transformer.transform(span, attributes);
      expect(result.finishReason).toBe('stop');
    });

    it('should extract settings from request attributes', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'gen_ai.session',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.request.max_tokens': 1024,
        'gen_ai.request.temperature': 0.7,
      };

      const result = transformer.transform(span, attributes);
      expect(result.settings).toEqual({
        maxTokens: 1024,
        temperature: 0.7,
      });
    });

    it('should override span name with tool name for tool spans', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-2',
        parentSpanId: 'span-1',
        name: 'gen_ai.tool.call Read',
        kind: 1,
        startTimeUnixNano: '1100000000',
        endTimeUnixNano: '1500000000',
      };

      const attributes = {
        'gen_ai.tool.name': 'Read',
        'gen_ai.tool.call.id': 'tool-123',
      };

      const result = transformer.transform(span, attributes);
      expect(result.name).toBe('Read');
    });
  });

  describe('isClaudeAgentSpan', () => {
    it('should return true when gen_ai.system is anthropic AND has agentmark.prompt_name', () => {
      const attributes = {
        'gen_ai.system': 'anthropic',
        'gen_ai.request.model': 'claude-sonnet-4-20250514',
        'agentmark.prompt_name': 'my-agent-task',
      };

      expect(isClaudeAgentSpan(attributes)).toBe(true);
    });

    it('should return true when gen_ai.system is anthropic AND has agentmark.function_id', () => {
      const attributes = {
        'gen_ai.system': 'anthropic',
        'agentmark.function_id': 'func-123',
      };

      expect(isClaudeAgentSpan(attributes)).toBe(true);
    });

    it('should return true when gen_ai.system is anthropic AND has agentmark.subagent_type', () => {
      const attributes = {
        'gen_ai.system': 'anthropic',
        'agentmark.subagent_type': 'explorer',
      };

      expect(isClaudeAgentSpan(attributes)).toBe(true);
    });

    it('should return false when gen_ai.system is anthropic but no specific agentmark attrs', () => {
      const attributes = {
        'gen_ai.system': 'anthropic',
        'gen_ai.request.model': 'claude-sonnet-4-20250514',
      };

      expect(isClaudeAgentSpan(attributes)).toBe(false);
    });

    it('should return false when agentmark.* present but system is not anthropic', () => {
      const attributes = {
        'gen_ai.system': 'openai',
        'agentmark.prompt_name': 'my-agent-task',
      };

      expect(isClaudeAgentSpan(attributes)).toBe(false);
    });

    it('should return false when only generic agentmark.session_id present (from AI SDK metadata)', () => {
      const attributes = {
        'gen_ai.system': 'anthropic',
        'agentmark.session_id': 'session-123',
        'agentmark.user_id': 'user-456',
      };

      expect(isClaudeAgentSpan(attributes)).toBe(false);
    });

    it('should return false when no Claude Agent indicators', () => {
      const attributes = {
        'gen_ai.system': 'openai',
        'ai.model.id': 'gpt-4',
      };

      expect(isClaudeAgentSpan(attributes)).toBe(false);
    });

    it('should return false for empty attributes', () => {
      expect(isClaudeAgentSpan({})).toBe(false);
    });
  });
});
