import { describe, it, expect } from 'vitest';
import { AgentMarkTransformer, AGENTMARK_SCOPE_NAME } from '../../src/normalizer/transformers/agentmark';
import { SpanType, OtelSpan } from '../../src/normalizer/types';

describe('AgentMarkTransformer', () => {
  const transformer = new AgentMarkTransformer();

  describe('AGENTMARK_SCOPE_NAME', () => {
    it('should export the correct scope name', () => {
      expect(AGENTMARK_SCOPE_NAME).toBe('agentmark');
    });
  });

  describe('classify', () => {
    it('should classify "chat" span as GENERATION', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'chat',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.operation.name': 'chat',
        'gen_ai.system': 'anthropic',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify "chat {model}" span as GENERATION', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'chat claude-sonnet-4-20250514',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': 'claude-sonnet-4-20250514',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify "execute_tool {name}" span as SPAN', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-2',
        parentSpanId: 'span-1',
        name: 'execute_tool Read',
        kind: 1,
        startTimeUnixNano: '1100000000',
        endTimeUnixNano: '1500000000',
      };

      const attributes = {
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': 'Read',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });

    it('should classify "invoke_agent" span as SPAN', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.operation.name': 'invoke_agent',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });

    // Legacy span name tests
    it('should classify legacy session span as GENERATION', () => {
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
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify legacy tool call span as SPAN', () => {
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
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });

    it('should classify legacy subagent span as SPAN', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-3',
        parentSpanId: 'span-1',
        name: 'gen_ai.subagent',
        kind: 1,
        startTimeUnixNano: '1200000000',
        endTimeUnixNano: '1800000000',
      };

      const attributes = {};

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });

    it('should classify legacy conversation span as SPAN (not GENERATION)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'gen_ai.conversation',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {};

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });

    it('should classify legacy LLM turn span as GENERATION', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'gen_ai.llm.turn',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {};

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should use fallback heuristic for unknown span with usage + output', () => {
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
        'gen_ai.response.output': 'some response',
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
        name: 'chat',
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
        name: 'chat',
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
        name: 'chat',
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
        name: 'chat',
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
        name: 'chat',
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
        name: 'chat',
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
        name: 'execute_tool Read',
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

    it('should extract agentmark.prompt_name', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent customer-support',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.operation.name': 'invoke_agent',
        'agentmark.prompt_name': 'customer-support-agent',
      };

      const result = transformer.transform(span, attributes);
      expect(result.promptName).toBe('customer-support-agent');
    });

    it('should extract agentmark.props as JSON string', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const props = { customer_question: 'How long does shipping take?' };
      const attributes = {
        'gen_ai.operation.name': 'invoke_agent',
        'agentmark.props': JSON.stringify(props),
      };

      const result = transformer.transform(span, attributes);
      expect(result.props).toBe(JSON.stringify(props));
    });

    it('should extract agentmark.session_id', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'agentmark.session_id': 'session-abc-123',
      };

      const result = transformer.transform(span, attributes);
      expect(result.sessionId).toBe('session-abc-123');
    });

    it('should extract agentmark.user_id', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'agentmark.user_id': 'user-456',
      };

      const result = transformer.transform(span, attributes);
      expect(result.userId).toBe('user-456');
    });

    it('should extract multiple agentmark attributes together', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent customer-support',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const props = { question: 'test' };
      const attributes = {
        'gen_ai.operation.name': 'invoke_agent',
        'gen_ai.request.model': 'claude-sonnet-4-20250514',
        'agentmark.prompt_name': 'customer-support-agent',
        'agentmark.props': JSON.stringify(props),
        'agentmark.session_id': 'session-123',
        'agentmark.user_id': 'user-456',
        'agentmark.trace_name': 'my-trace',
      };

      const result = transformer.transform(span, attributes);
      expect(result.model).toBe('claude-sonnet-4-20250514');
      expect(result.promptName).toBe('customer-support-agent');
      expect(result.props).toBe(JSON.stringify(props));
      expect(result.sessionId).toBe('session-123');
      expect(result.userId).toBe('user-456');
      expect(result.traceName).toBe('my-trace');
    });

    // Input parsing tests
    it('should parse JSON messages array from gen_ai.request.input', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'How long does shipping take?' },
      ];
      const attributes = {
        'gen_ai.request.input': JSON.stringify(messages),
      };

      const result = transformer.transform(span, attributes);
      expect(result.input).toEqual(messages);
    });

    it('should parse single-message JSON array from gen_ai.request.input', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const messages = [{ role: 'user', content: 'Hello' }];
      const attributes = {
        'gen_ai.request.input': JSON.stringify(messages),
      };

      const result = transformer.transform(span, attributes);
      expect(result.input).toEqual(messages);
    });

    it('should treat plain text input as user message (backwards compatibility)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.request.input': 'How long does shipping take?',
      };

      const result = transformer.transform(span, attributes);
      expect(result.input).toEqual([
        { role: 'user', content: 'How long does shipping take?' },
      ]);
    });

    it('should treat invalid JSON input as plain text user message', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.request.input': '{ invalid json',
      };

      const result = transformer.transform(span, attributes);
      expect(result.input).toEqual([
        { role: 'user', content: '{ invalid json' },
      ]);
    });

    it('should treat JSON array without role/content as plain text', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      // JSON array but not messages format
      const attributes = {
        'gen_ai.request.input': JSON.stringify(['item1', 'item2']),
      };

      const result = transformer.transform(span, attributes);
      expect(result.input).toEqual([
        { role: 'user', content: '["item1","item2"]' },
      ]);
    });

    it('should treat empty JSON array as plain text', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.request.input': '[]',
      };

      const result = transformer.transform(span, attributes);
      expect(result.input).toEqual([{ role: 'user', content: '[]' }]);
    });

    it('should treat JSON object (not array) as plain text', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.request.input': JSON.stringify({ key: 'value' }),
      };

      const result = transformer.transform(span, attributes);
      expect(result.input).toEqual([
        { role: 'user', content: '{"key":"value"}' },
      ]);
    });

    // Tests for agentmark.metadata.* extraction
    it('should extract session_id from agentmark.metadata.session_id', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'agentmark.metadata.session_id': 'test-session-123',
      };

      const result = transformer.transform(span, attributes);
      expect(result.sessionId).toBe('test-session-123');
    });

    it('should extract user_id from agentmark.metadata.user_id', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'agentmark.metadata.user_id': 'user-456',
      };

      const result = transformer.transform(span, attributes);
      expect(result.userId).toBe('user-456');
    });

    it('should extract custom metadata fields from agentmark.metadata.*', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'agentmark.metadata.custom_field': 'custom-value',
        'agentmark.metadata.another_field': 'another-value',
      };

      const result = transformer.transform(span, attributes);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.custom_field).toBe('custom-value');
      expect(result.metadata?.another_field).toBe('another-value');
    });

    it('should prefer agentmark.* over agentmark.metadata.* for known fields', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        // Direct attribute takes precedence
        'agentmark.session_id': 'direct-session',
        // Metadata attribute has lower priority
        'agentmark.metadata.session_id': 'metadata-session',
      };

      const result = transformer.transform(span, attributes);
      expect(result.sessionId).toBe('direct-session');
    });

    it('should extract prompt_name from agentmark.metadata.prompt_name', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'invoke_agent',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'agentmark.metadata.prompt_name': 'customer-support-agent',
      };

      const result = transformer.transform(span, attributes);
      expect(result.promptName).toBe('customer-support-agent');
    });
  });
});
