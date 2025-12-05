import { describe, it, expect } from 'vitest';
import { MastraTransformer } from '../../src/normalizer';
import { SpanType } from '../../src/normalizer/types';
import { OtelSpan } from '../../src/normalizer/types';

describe('MastraTransformer', () => {
  const transformer = new MastraTransformer();

  describe('classify', () => {
    it('should classify agent.streamLegacy as GENERATION', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'agent.streamLegacy',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = transformer.classify(span, {});
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify agent.stream as GENERATION', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'agent.stream',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = transformer.classify(span, {});
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify agent.streamObject as GENERATION', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'agent.streamObject',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = transformer.classify(span, {});
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify agent.generate as GENERATION', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'agent.generate',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = transformer.classify(span, {});
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify agent.generateObject as GENERATION', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'agent.generateObject',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = transformer.classify(span, {});
      expect(result).toBe(SpanType.GENERATION);
    });

    it('should classify agent.prepareLLMOptions as SPAN', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'agent.prepareLLMOptions',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = transformer.classify(span, {});
      expect(result).toBe(SpanType.SPAN);
    });

    it('should classify agent.resolveModelConfig as SPAN', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'agent.resolveModelConfig',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = transformer.classify(span, {});
      expect(result).toBe(SpanType.SPAN);
    });

    it('should classify other spans as SPAN', () => {
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'regular-span',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = transformer.classify(span, {});
      expect(result).toBe(SpanType.SPAN);
    });
  });

  describe('transform', () => {
    describe('model extraction', () => {
      it('should extract model from agent.resolveModelConfig.result', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const attributes = {
          'agent.resolveModelConfig.result': JSON.stringify({
            modelId: 'gpt-4o',
            config: { provider: 'openai.chat' },
            settings: { temperature: 0.7 },
          }),
        };

        const result = transformer.transform(span, attributes);
        expect(result.model).toBe('gpt-4o');
        expect(result.settings).toEqual({ temperature: 0.7 });
      });

      it('should extract model from agent.resolveModelConfig.result as object', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.streamLegacy',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const attributes = {
          'agent.resolveModelConfig.result': {
            modelId: 'gpt-4o',
            config: { provider: 'openai.chat' },
            settings: { maxTokens: 1000 },
          },
        };

        const result = transformer.transform(span, attributes);
        expect(result.model).toBe('gpt-4o');
        expect(result.settings).toEqual({ maxTokens: 1000 });
      });

      it('should handle malformed agent.resolveModelConfig.result', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const attributes = {
          'agent.resolveModelConfig.result': 'invalid json{',
        };

        const result = transformer.transform(span, attributes);
        expect(result.model).toBeUndefined();
      });

      it('should handle missing model config', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const attributes = {};

        const result = transformer.transform(span, attributes);
        expect(result.model).toBeUndefined();
      });
    });

    describe('input extraction', () => {
      it('should extract input from agent.streamLegacy.argument.0', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.streamLegacy',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const messages = [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ];

        const attributes = {
          'agent.streamLegacy.argument.0': JSON.stringify(messages),
        };

        const result = transformer.transform(span, attributes);
        expect(result.input).toEqual(messages);
      });

      it('should extract input from agent.stream.argument.0', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const messages = [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'What is 2+2?' },
        ];

        const attributes = {
          'agent.stream.argument.0': JSON.stringify(messages),
        };

        const result = transformer.transform(span, attributes);
        expect(result.input).toEqual(messages);
      });

      it('should extract input from agent.prepareLLMOptions.argument.0 as fallback', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.streamObject',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const messages = [{ role: 'user', content: 'Test message' }];

        const attributes = {
          'agent.prepareLLMOptions.argument.0': JSON.stringify(messages),
        };

        const result = transformer.transform(span, attributes);
        expect(result.input).toEqual(messages);
      });

      it('should extract input from span-specific argument.0', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.generate',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const messages = [{ role: 'user', content: 'Generate text' }];

        const attributes = {
          'agent.generate.argument.0': JSON.stringify(messages),
        };

        const result = transformer.transform(span, attributes);
        expect(result.input).toEqual(messages);
      });

      it('should handle malformed input JSON', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const attributes = {
          'agent.stream.argument.0': 'invalid json{',
        };

        const result = transformer.transform(span, attributes);
        expect(result.input).toBeUndefined();
      });

      it('should handle non-array input', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const attributes = {
          'agent.stream.argument.0': JSON.stringify({ not: 'an array' }),
        };

        const result = transformer.transform(span, attributes);
        expect(result.input).toBeUndefined();
      });
    });

    describe('output and tokens extraction', () => {
      it('should extract output object and tokens from agent.stream.result', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const streamResult = {
          usage: {
            promptTokens: 96,
            completionTokens: 10,
            totalTokens: 106,
          },
          object: {
            names: ['Alice', 'Bob', 'Carol'],
          },
        };

        const attributes = {
          'agent.stream.result': JSON.stringify(streamResult),
        };

        const result = transformer.transform(span, attributes);
        expect(result.output).toBe(JSON.stringify(streamResult.object));
        expect(result.outputObject).toEqual(streamResult.object);
        expect(result.inputTokens).toBe(96);
        expect(result.outputTokens).toBe(10);
        expect(result.totalTokens).toBe(106);
      });

      it('should extract text output from agent.streamLegacy.result', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.streamLegacy',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const streamResult = {
          usage: {
            promptTokens: 50,
            completionTokens: 25,
            totalTokens: 75,
          },
          text: 'This is the response text',
        };

        const attributes = {
          'agent.streamLegacy.result': JSON.stringify(streamResult),
        };

        const result = transformer.transform(span, attributes);
        expect(result.output).toBe('This is the response text');
        expect(result.inputTokens).toBe(50);
        expect(result.outputTokens).toBe(25);
        expect(result.totalTokens).toBe(75);
      });

      it('should extract output from agent.streamObject.result', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.streamObject',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const streamResult = {
          usage: {
            promptTokens: 100,
            completionTokens: 20,
            totalTokens: 120,
          },
          object: { result: 'success' },
        };

        const attributes = {
          'agent.streamObject.result': JSON.stringify(streamResult),
        };

        const result = transformer.transform(span, attributes);
        expect(result.output).toBe(JSON.stringify(streamResult.object));
        expect(result.outputObject).toEqual(streamResult.object);
        expect(result.inputTokens).toBe(100);
        expect(result.outputTokens).toBe(20);
        expect(result.totalTokens).toBe(120);
      });

      it('should extract output from span-specific result attribute', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.generate',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const streamResult = {
          usage: {
            promptTokens: 30,
            completionTokens: 15,
            totalTokens: 45,
          },
          text: 'Generated text',
        };

        const attributes = {
          'agent.generate.result': JSON.stringify(streamResult),
        };

        const result = transformer.transform(span, attributes);
        expect(result.output).toBe('Generated text');
        expect(result.inputTokens).toBe(30);
        expect(result.outputTokens).toBe(15);
        expect(result.totalTokens).toBe(45);
      });

      it('should handle response nested in result', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const streamResult = {
          usage: {
            promptTokens: 40,
            completionTokens: 20,
            totalTokens: 60,
          },
          response: { text: 'Nested response' },
        };

        const attributes = {
          'agent.stream.result': JSON.stringify(streamResult),
        };

        const result = transformer.transform(span, attributes);
        expect(result.output).toBe(JSON.stringify(streamResult.response));
        expect(result.outputObject).toEqual(streamResult.response);
      });

      it('should handle string response', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const streamResult = {
          usage: {
            promptTokens: 40,
            completionTokens: 20,
            totalTokens: 60,
          },
          response: 'String response',
        };

        const attributes = {
          'agent.stream.result': JSON.stringify(streamResult),
        };

        const result = transformer.transform(span, attributes);
        expect(result.output).toBe('String response');
      });

      it('should handle missing usage in result', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const streamResult = {
          object: { data: 'test' },
        };

        const attributes = {
          'agent.stream.result': JSON.stringify(streamResult),
        };

        const result = transformer.transform(span, attributes);
        expect(result.output).toBe(JSON.stringify(streamResult.object));
        expect(result.outputObject).toEqual(streamResult.object);
        expect(result.inputTokens).toBeUndefined();
        expect(result.outputTokens).toBeUndefined();
        expect(result.totalTokens).toBeUndefined();
      });

      it('should handle malformed result JSON', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const attributes = {
          'agent.stream.result': 'invalid json{',
        };

        const result = transformer.transform(span, attributes);
        expect(result.output).toBeUndefined();
        expect(result.inputTokens).toBeUndefined();
      });
    });

    describe('trace name extraction', () => {
      it('should extract trace name from agentmark.trace_name', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const attributes = {
          'agentmark.trace_name': 'my-trace',
        };

        const result = transformer.transform(span, attributes);
        expect(result.traceName).toBe('my-trace');
      });

      it('should extract trace name from componentName when agentmark.trace_name is missing', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const attributes = {
          componentName: 'my-component',
        };

        const result = transformer.transform(span, attributes);
        expect(result.traceName).toBe('my-component');
      });

      it('should prefer agentmark.trace_name over componentName', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const attributes = {
          'agentmark.trace_name': 'trace-name',
          componentName: 'component-name',
        };

        const result = transformer.transform(span, attributes);
        expect(result.traceName).toBe('trace-name');
      });

      it('should handle missing trace name', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const attributes = {};

        const result = transformer.transform(span, attributes);
        expect(result.traceName).toBeUndefined();
      });
    });

    describe('integration', () => {
      it('should extract all fields together', () => {
        const span: OtelSpan = {
          traceId: 'trace-1',
          spanId: 'span-1',
          name: 'agent.stream',
          kind: 1,
          startTimeUnixNano: '1000000000',
          endTimeUnixNano: '2000000000',
        };

        const messages = [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ];

        const streamResult = {
          usage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          },
          object: { result: 'success' },
        };

        const attributes = {
          'agent.resolveModelConfig.result': JSON.stringify({
            modelId: 'gpt-4o',
            config: { provider: 'openai.chat' },
            settings: { temperature: 0.7 },
          }),
          'agent.stream.argument.0': JSON.stringify(messages),
          'agent.stream.result': JSON.stringify(streamResult),
          'agentmark.trace_name': 'test-trace',
        };

        const result = transformer.transform(span, attributes);
        expect(result.model).toBe('gpt-4o');
        expect(result.input).toEqual(messages);
        expect(result.output).toBe(JSON.stringify(streamResult.object));
        expect(result.outputObject).toEqual(streamResult.object);
        expect(result.inputTokens).toBe(100);
        expect(result.outputTokens).toBe(50);
        expect(result.totalTokens).toBe(150);
        expect(result.traceName).toBe('test-trace');
        expect(result.settings).toEqual({ temperature: 0.7 });
      });
    });
  });
});

