import { describe, it, expect } from 'vitest';
import { TypeClassifier } from '../src/normalizer';
import { SpanType } from '../src/normalizer/types';
import { OtelSpan } from '../src/normalizer/types';

describe('Type Classifier', () => {
  const classifier = new TypeClassifier();

  describe('classify', () => {
    it('should classify as GENERATION when gen_ai.system exists', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.system': 'openai',
      };

      const result = classifier.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as GENERATION when gen_ai.request.model exists', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.request.model': 'gpt-4',
      };

      const result = classifier.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as GENERATION when gen_ai.operation.name exists', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.operation.name': 'generate',
      };

      const result = classifier.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as GENERATION when ai.response.text exists', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.response.text': 'response',
      };

      const result = classifier.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as GENERATION when ai.result.text exists', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.result.text': 'result',
      };

      const result = classifier.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as GENERATION when ai.response.toolCalls exists', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.response.toolCalls': [],
      };

      const result = classifier.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as GENERATION when ai.result.toolCalls exists', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'ai.result.toolCalls': [],
      };

      const result = classifier.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as GENERATION when span name starts with ai.generate', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'ai.generate',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {};

      const result = classifier.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify as GENERATION when span name starts with ai.stream', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'ai.streamText.doStream',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {};

      const result = classifier.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
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

      const result = classifier.classify(span, attributes);
      expect(result).toBe(SpanType.SPAN);
    });

    it('should prioritize gen_ai attributes over span name', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'regular-span',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.system': 'openai',
      };

      const result = classifier.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should handle multiple generation indicators', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'ai.generate',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const attributes = {
        'gen_ai.system': 'openai',
        'ai.response.text': 'response',
      };

      const result = classifier.classify(span, attributes);
      expect(result).toBe(SpanType.GENERATION);
    });
  });
});

