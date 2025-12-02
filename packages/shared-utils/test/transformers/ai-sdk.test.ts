import { describe, it, expect } from 'vitest';
import { AiSdkTransformer } from '../../src/normalizer';
import { SpanType } from '../../src/normalizer/types';
import { OtelSpan } from '../../src/normalizer/types';

describe('AiSdkTransformer', () => {
  const transformer = new AiSdkTransformer();

  describe('classify', () => {
    it('should classify as GENERATION when model attributes exist and span has .doGenerate', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'ai.generateText.doGenerate',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.request.model': 'gpt-4',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as GENERATION when ai.model.id exists and span has .doGenerate', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'ai.generateText.doGenerate',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.model.id': 'gpt-4',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as GENERATION when gen_ai.system exists and span has .doGenerate', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'ai.generateText.doGenerate',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.system': 'openai',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as SPAN when model exists but span does not have .doGenerate or .doStream', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'ai.generateText',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.request.model': 'gpt-4',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });

    it('should classify as SPAN when gen_ai.operation.name exists but no model', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.operation.name': 'some-operation',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });

    it('should classify as SPAN when ai.response.text exists but no model', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.response.text': 'some text',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });

    it('should classify as GENERATION when span name has .doGenerate and model exists', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'ai.generateText.doGenerate',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.request.model': 'gpt-4',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as GENERATION when span name starts with ai.stream and model exists', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'ai.streamText.doStream',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.model.id': 'gpt-4',
      };

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as SPAN when span name starts with ai.generate but no model', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'ai.generate',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {};

      const result = transformer.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });

    it('should default to SPAN when no indicators match', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'regular-span',
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
    it('should extract model from v5 attributes', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.request.model': 'gpt-4o',
        'ai.response.text': 'response',
      };

      const result = transformer.transform(span, attributes);
      expect(result.model).toBe('gpt-4o');
    });

    it('should extract model from ai.model.id', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.model.id': 'gpt-4',
      };

      const result = transformer.transform(span, attributes);
      expect(result.model).toBe('gpt-4');
    });

    it('should extract input from ai.prompt.messages (v5)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const messages = [{ role: 'user', content: 'Hello' }];
      const attributes = {
        'ai.prompt.messages': messages,
        'ai.response.text': 'response',
      };

      const result = transformer.transform(span, attributes);
      expect(result.input).toEqual(messages);
    });

    it('should extract output from ai.response.text (v5)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.response.text': 'Hello, world!',
      };

      const result = transformer.transform(span, attributes);
      expect(result.output).toBe('Hello, world!');
    });

    it('should extract outputObject from ai.response.object (v5)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const obj = { type: 'object', data: 'test' };
      const attributes = {
        'ai.response.object': obj,
      };

      const result = transformer.transform(span, attributes);
      expect(result.outputObject).toEqual(obj);
      expect(result.output).toBeUndefined();
    });

    it('should extract output from ai.result.text (v4)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.result.text': 'v4 response',
      };

      const result = transformer.transform(span, attributes);
      expect(result.output).toBe('v4 response');
    });

    it('should extract tokens from gen_ai.usage keys (v5)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.response.text': '', // v5 indicator
        'gen_ai.usage.input_tokens': 100,
        'gen_ai.usage.output_tokens': 50,
        'gen_ai.usage.total_tokens': 150,
      };

      const result = transformer.transform(span, attributes);
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.totalTokens).toBe(150);
    });

    it('should extract tokens from ai.usage keys (v5 fallback)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.usage.promptTokens': 200,
        'ai.usage.completionTokens': 100,
      };

      const result = transformer.transform(span, attributes);
      expect(result.inputTokens).toBe(200);
      expect(result.outputTokens).toBe(100);
    });

    it('should extract reasoning tokens from ai.usage.reasoningTokens (v5)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.response.text': '', // v5 indicator
        'ai.usage.reasoningTokens': 25,
      };

      const result = transformer.transform(span, attributes);
      expect(result.reasoningTokens).toBe(25);
    });

    it('should extract metadata from ai.telemetry.metadata', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.response.text': '', // v5 indicator
        'ai.telemetry.metadata.trace_name': 'test-trace',
        'ai.telemetry.metadata.prompt_name': 'test-prompt',
        'ai.telemetry.metadata.props': '{"key":"value"}',
      };

      const result = transformer.transform(span, attributes);
      expect(result.traceName).toBe('test-trace');
      expect(result.promptName).toBe('test-prompt');
      expect(result.props).toBe('{"key":"value"}');
    });

    it('should handle v4 version detection', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.result.text': 'v4 response',
        'ai.model.id': 'gpt-4',
      };

      const result = transformer.transform(span, attributes);
      expect(result.output).toBe('v4 response');
      expect(result.model).toBe('gpt-4');
    });

    it('should handle v5 version detection', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.response.text': 'v5 response',
        'gen_ai.request.model': 'gpt-4o',
      };

      const result = transformer.transform(span, attributes);
      expect(result.output).toBe('v5 response');
      expect(result.model).toBe('gpt-4o');
    });

    it('should extract toolCalls from ai.response.toolCalls (v5)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const toolCalls = [
        {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'search',
          input: { query: 'test' },
          providerMetadata: { openai: { itemId: 'item-1' } },
        },
      ];
      const attributes = {
        'ai.response.text': '', // v5 indicator
        'ai.response.toolCalls': JSON.stringify(toolCalls),
      };

      const result = transformer.transform(span, attributes);
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].toolCallId).toBe('call-123');
      expect(result.toolCalls![0].toolName).toBe('search');
      expect(result.toolCalls![0].args).toEqual({ query: 'test' }); // v5 'input' normalized to 'args'
      expect(result.toolCalls![0].providerMetadata).toEqual({ openai: { itemId: 'item-1' } });
    });

    it('should extract toolCalls from ai.result.toolCalls (v4)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const toolCalls = [
        {
          type: 'tool-call',
          toolCallId: 'call-456',
          toolName: 'search',
          args: { query: 'test' },
        },
      ];
      const attributes = {
        'ai.result.toolCalls': JSON.stringify(toolCalls),
      };

      const result = transformer.transform(span, attributes);
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].toolCallId).toBe('call-456');
      expect(result.toolCalls![0].toolName).toBe('search');
      expect(result.toolCalls![0].args).toEqual({ query: 'test' }); // v4 'args' stays as 'args'
    });

    it('should extract outputObject from ai.result.object (v4)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const obj = { type: 'object', data: 'test' };
      const attributes = {
        'ai.result.object': JSON.stringify(obj),
      };

      const result = transformer.transform(span, attributes);
      expect(result.outputObject).toEqual(obj);
      expect(result.output).toBeUndefined();
    });

    it('should extract finishReason from ai.response.finishReason (v5)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.response.text': '', // v5 indicator
        'ai.response.finishReason': 'tool-calls',
      };

      const result = transformer.transform(span, attributes);
      expect(result.finishReason).toBe('tool-calls');
    });

    it('should extract finishReason from ai.result.finishReason (v4)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.result.finishReason': 'stop',
      };

      const result = transformer.transform(span, attributes);
      expect(result.finishReason).toBe('stop');
    });

    it('should extract finishReason from gen_ai.response.finish_reasons (OTel)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.response.finish_reasons': ['length'],
      };

      const result = transformer.transform(span, attributes);
      expect(result.finishReason).toBe('length');
    });

    it('should extract settings from gen_ai.request keys (OTel)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.response.text': '', // v5 indicator
        'gen_ai.request.temperature': 0.7,
        'gen_ai.request.max_tokens': 1000,
        'gen_ai.request.top_p': 0.9,
        'gen_ai.request.presence_penalty': 0.1,
        'gen_ai.request.frequency_penalty': 0.2,
      };

      const result = transformer.transform(span, attributes);
      expect(result.settings).toBeDefined();
      expect(result.settings?.temperature).toBe(0.7);
      expect(result.settings?.maxTokens).toBe(1000);
      expect(result.settings?.topP).toBe(0.9);
      expect(result.settings?.presencePenalty).toBe(0.1);
      expect(result.settings?.frequencyPenalty).toBe(0.2);
    });

    it('should extract settings from ai.settings keys (AI SDK fallback)', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.response.text': '', // v5 indicator
        'ai.settings.temperature': 0.8,
        'ai.settings.maxTokens': 2000,
        'ai.settings.topP': 0.95,
      };

      const result = transformer.transform(span, attributes);
      expect(result.settings).toBeDefined();
      expect(result.settings?.temperature).toBe(0.8);
      expect(result.settings?.maxTokens).toBe(2000);
      expect(result.settings?.topP).toBe(0.95);
    });

    it('should prefer OTel settings over AI SDK settings', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.response.text': '', // v5 indicator
        'gen_ai.request.temperature': 0.7,
        'ai.settings.temperature': 0.8, // Should be ignored
      };

      const result = transformer.transform(span, attributes);
      expect(result.settings?.temperature).toBe(0.7);
    });
  });
});

