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

    it('should extract output from ai.response.object (v5)', () => {
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
      expect(result.output).toBe(JSON.stringify(obj));
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
  });
});

