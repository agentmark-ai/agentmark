import { describe, it, expect } from 'vitest';
import { normalizeOtlpSpans, normalizeSpan, SpanType } from '../src/normalizer';
import { OtelResource, OtelScope, OtelSpan } from '../src/normalizer/types';
import { OtlpResourceSpans } from '../src/normalizer/converters/otlp-converter';
import { readFileSync } from 'fs';
import { join } from 'path';

const otlpV5ErrorData = JSON.parse(
  readFileSync(join(__dirname, 'mocks', 'ai-sdk', 'otlp-v5-error.json'), 'utf-8')
);

const otlpV4ErrorData = JSON.parse(
  readFileSync(join(__dirname, 'mocks', 'ai-sdk', 'otlp-v4-error.json'), 'utf-8')
);

const otlpV5SuccessData = JSON.parse(
  readFileSync(join(__dirname, 'mocks', 'ai-sdk', 'otlp-v5-success.json'), 'utf-8')
);

const otlpV4SuccessData = JSON.parse(
  readFileSync(join(__dirname, 'mocks', 'ai-sdk', 'otlp-v4-success.json'), 'utf-8')
);

describe('Integration Tests', () => {
  describe('OTLP v5 Error Data', () => {
    it('should normalize the provided OTLP v5 error span', () => {
      const resourceSpans = otlpV5ErrorData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      expect(result).toHaveLength(1);
      const normalized = result[0];

      // Identity fields
      expect(normalized.traceId).toBe('test-trace-id-v5-error-abcdef123456');
      expect(normalized.spanId).toBe('41a8554de0e6d0be');
      expect(normalized.parentSpanId).toBe('75b45f37ac65cedb');
      expect(normalized.name).toBe('ai.streamText.doStream');

      // Type classification
      expect(normalized.type).toBe(SpanType.GENERATION);

      // Service name from resource
      expect(normalized.serviceName).toBe('agentmark-client');

      // Model extraction
      expect(normalized.model).toBe('gpt-4o');

      // Metadata extraction
      expect(normalized.traceName).toBe('customer-support-agent');
      expect(normalized.promptName).toBe('customer-support-agent');
      expect(normalized.props).toBe(
        '{"customer_question":"I\'m having trouble with my order. How long does shipping take?"}'
      );

      // Input extraction (should have prompt messages)
      expect(normalized.input).toBeDefined();
      expect(Array.isArray(normalized.input)).toBe(true);
      const inputText = JSON.stringify(normalized.input);
      expect(inputText).toContain('customer service agent');

      // Output extraction (empty in this error case)
      expect(normalized.output).toBe('');

      // Timing (nanoseconds to milliseconds: divide by 1,000,000)
      // Note: Due to JavaScript number precision limits with very large timestamps,
      // the values may be integers (no decimal precision preserved)
      expect(normalized.startTime).toBeGreaterThan(1764587449000);
      expect(normalized.startTime).toBeLessThan(1764587450000);
      expect(normalized.endTime).toBeGreaterThan(1764587455000);
      expect(normalized.endTime).toBeLessThan(1764587456000);
      expect(normalized.duration).toBeGreaterThan(6155);
      expect(normalized.duration).toBeLessThan(6156);

      // Events
      expect(normalized.events).toHaveLength(2);
      expect(normalized.events[0].name).toBe('ai.stream.firstChunk');
      expect(normalized.events[1].name).toBe('ai.stream.finish');

      // Status
      expect(normalized.statusCode).toBe('0');
    });

    it('should extract all resource attributes correctly', () => {
      const resourceSpans = otlpV5ErrorData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const normalized = result[0];
      expect(normalized.resourceAttributes).toHaveProperty('service.name', 'agentmark-client');
      expect(normalized.resourceAttributes).toHaveProperty('host.name', 'test-host');
      expect(normalized.resourceAttributes).toHaveProperty('process.pid', 9224);
    });

    it('should extract all span attributes correctly', () => {
      const resourceSpans = otlpV5ErrorData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const normalized = result[0];
      expect(normalized.spanAttributes).toHaveProperty('ai.model.id', 'gpt-4o');
      expect(normalized.spanAttributes).toHaveProperty('gen_ai.request.model', 'gpt-4o');
      expect(normalized.spanAttributes).toHaveProperty('ai.response.finishReason', 'unknown');
    });

    it('should handle events with attributes', () => {
      const resourceSpans = otlpV5ErrorData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const normalized = result[0];
      const firstChunkEvent = normalized.events.find((e) => e.name === 'ai.stream.firstChunk');
      expect(firstChunkEvent).toBeDefined();
      expect(firstChunkEvent?.attributes).toHaveProperty('ai.response.msToFirstChunk', 1025.85009);
    });
  });

  describe('OTLP v5 Success Data', () => {
    it('should normalize all v5 success spans', () => {
      const resourceSpans = otlpV5SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      // Should have 4 spans total: ai.toolCall, 2x ai.streamText.doStream, ai.streamText
      expect(result).toHaveLength(4);

      // All spans should have same traceId
      const traceIds = new Set(result.map((s) => s.traceId));
      expect(traceIds.size).toBe(1);
      expect(traceIds.has('test-trace-id-v5-success-abcdef123456')).toBe(true);

      // Check service name
      result.forEach((span) => {
        expect(span.serviceName).toBe('agentmark-client');
      });
    });

    it('should classify doStream spans as GENERATION', () => {
      const resourceSpans = otlpV5SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const doStreamSpans = result.filter((s) => s.name === 'ai.streamText.doStream');
      expect(doStreamSpans.length).toBe(2);
      doStreamSpans.forEach((span) => {
        expect(span.type).toBe(SpanType.GENERATION);
      });
    });

    it('should extract model correctly from v5 success spans', () => {
      const resourceSpans = otlpV5SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const doStreamSpans = result.filter((s) => s.name === 'ai.streamText.doStream');
      doStreamSpans.forEach((span) => {
        expect(span.model).toBe('gpt-4o');
      });
    });

    it('should extract finishReason correctly', () => {
      const resourceSpans = otlpV5SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const firstDoStream = result.find((s) => s.spanId === 'c6cc6f15b00ff2be');
      expect(firstDoStream?.spanAttributes).toHaveProperty('ai.response.finishReason', 'tool-calls');

      const secondDoStream = result.find((s) => s.spanId === '82ddb30e5135f03e');
      expect(secondDoStream?.spanAttributes).toHaveProperty('ai.response.finishReason', 'stop');
    });

    it('should extract output text from successful spans', () => {
      const resourceSpans = otlpV5SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const secondDoStream = result.find((s) => s.spanId === '82ddb30e5135f03e');
      expect(secondDoStream?.output).toBe(
        'Shipping usually takes 3–5 business days with our standard option. If you have any more questions or need further assistance, feel free to ask!'
      );
    });

    it('should extract tool call information', () => {
      const resourceSpans = otlpV5SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const toolCallSpan = result.find((s) => s.name === 'ai.toolCall');
      expect(toolCallSpan).toBeDefined();
      expect(toolCallSpan?.spanAttributes).toHaveProperty('ai.toolCall.name', 'search_knowledgebase');
      expect(toolCallSpan?.spanAttributes).toHaveProperty('ai.toolCall.id', 'test-tool-call-id-1234567890');
    });

    it('should extract metadata correctly', () => {
      const resourceSpans = otlpV5SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      // Find a span with metadata (ai.streamText.doStream spans have metadata, not ai.toolCall)
      const spanWithMetadata = result.find((s) => s.name === 'ai.streamText.doStream');
      expect(spanWithMetadata).toBeDefined();
      expect(spanWithMetadata?.traceName).toBe('customer-support-agent');
      expect(spanWithMetadata?.promptName).toBe('customer-support-agent');
      expect(spanWithMetadata?.props).toBe(
        '{"customer_question":"I\'m having trouble with my order. How long does shipping take?"}'
      );
    });

    it('should extract input from prompt messages', () => {
      const resourceSpans = otlpV5SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const doStreamSpans = result.filter((s) => s.name === 'ai.streamText.doStream');
      doStreamSpans.forEach((span) => {
        expect(span.input).toBeDefined();
        expect(Array.isArray(span.input)).toBe(true);
        const inputText = JSON.stringify(span.input);
        expect(inputText).toContain('customer service agent');
      });
    });

    it('should handle events correctly', () => {
      const resourceSpans = otlpV5SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const doStreamSpans = result.filter((s) => s.name === 'ai.streamText.doStream');
      doStreamSpans.forEach((span) => {
        expect(span.events.length).toBeGreaterThanOrEqual(2);
        const firstChunkEvent = span.events.find((e) => e.name === 'ai.stream.firstChunk');
        const finishEvent = span.events.find((e) => e.name === 'ai.stream.finish');
        expect(firstChunkEvent).toBeDefined();
        expect(finishEvent).toBeDefined();
      });
    });

    it('should extract usage tokens correctly', () => {
      const resourceSpans = otlpV5SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const secondDoStream = result.find((s) => s.spanId === '82ddb30e5135f03e');
      // Check normalized token fields
      expect(secondDoStream?.inputTokens).toBe(240);
      expect(secondDoStream?.outputTokens).toBe(32);
      expect(secondDoStream?.totalTokens).toBe(272);
      // Check raw attributes are preserved
      expect(secondDoStream?.spanAttributes).toHaveProperty('ai.usage.inputTokens', 240);
      expect(secondDoStream?.spanAttributes).toHaveProperty('ai.usage.outputTokens', 32);
      expect(secondDoStream?.spanAttributes).toHaveProperty('ai.usage.totalTokens', 272);
    });

    it('should extract reasoning tokens correctly', () => {
      const resourceSpans = otlpV5SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const secondDoStream = result.find((s) => s.spanId === '82ddb30e5135f03e');
      // Check if reasoning tokens attribute exists in raw attributes
      const rawReasoningTokens = secondDoStream?.spanAttributes['ai.usage.reasoningTokens'];
      // Verify the raw attribute is preserved
      expect(secondDoStream?.spanAttributes).toHaveProperty('ai.usage.reasoningTokens');
      // Reasoning tokens should be extracted even if 0 (0 is a valid value)
      expect(secondDoStream?.reasoningTokens).toBe(rawReasoningTokens);
    });

    it('should default reasoning tokens to 0 when not present', () => {
      const resourceSpans: OtlpResourceSpans[] = [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'test-service' } }],
          },
          scopeSpans: [
            {
              scope: { name: 'ai' },
              spans: [
                {
                  traceId: 'trace-1',
                  spanId: 'span-1',
                  name: 'ai.streamText.doStream',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  attributes: [
                    {
                      key: 'gen_ai.request.model',
                      value: { stringValue: 'gpt-4' },
                    },
                    // No reasoning tokens attribute
                  ],
                },
              ],
            },
          ],
        },
      ];

      const result = normalizeOtlpSpans(resourceSpans);
      expect(result).toHaveLength(1);
      // Reasoning tokens should default to 0 when not present
      expect(result[0].reasoningTokens).toBe(0);
    });
  });

  describe('OTLP v4 Success Data', () => {
    it('should normalize all v4 success spans', () => {
      const resourceSpans = otlpV4SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      // Should have 4 spans total: ai.toolCall, 2x ai.streamText.doStream, ai.streamText
      expect(result).toHaveLength(4);

      // All spans should have same traceId
      const traceIds = new Set(result.map((s) => s.traceId));
      expect(traceIds.size).toBe(1);
      expect(traceIds.has('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(true);

      // Check service name
      result.forEach((span) => {
        expect(span.serviceName).toBe('agentmark-client');
      });
    });

    it('should classify doStream spans as GENERATION', () => {
      const resourceSpans = otlpV4SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const doStreamSpans = result.filter((s) => s.name === 'ai.streamText.doStream');
      expect(doStreamSpans.length).toBe(2);
      doStreamSpans.forEach((span) => {
        expect(span.type).toBe(SpanType.GENERATION);
      });
    });

    it('should extract model correctly from v4 success spans', () => {
      const resourceSpans = otlpV4SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const doStreamSpans = result.filter((s) => s.name === 'ai.streamText.doStream');
      doStreamSpans.forEach((span) => {
        expect(span.model).toBe('gpt-4o');
      });
    });

    it('should extract finishReason correctly', () => {
      const resourceSpans = otlpV4SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const firstDoStream = result.find((s) => s.spanId === 'b2c3d4e5f6a7b8c9');
      expect(firstDoStream?.spanAttributes).toHaveProperty('ai.response.finishReason', 'tool-calls');

      const secondDoStream = result.find((s) => s.spanId === 'c3d4e5f6a7b8c9d0');
      expect(secondDoStream?.spanAttributes).toHaveProperty('ai.response.finishReason', 'stop');
    });

    it('should extract output text from successful spans', () => {
      const resourceSpans = otlpV4SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const secondDoStream = result.find((s) => s.spanId === 'c3d4e5f6a7b8c9d0');
      expect(secondDoStream?.output).toBe(
        'Standard shipping for your order takes 3–5 business days. If you have any more questions or need further assistance, feel free to ask!'
      );
    });

    it('should extract tool call information', () => {
      const resourceSpans = otlpV4SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const toolCallSpan = result.find((s) => s.name === 'ai.toolCall');
      expect(toolCallSpan).toBeDefined();
      expect(toolCallSpan?.spanAttributes).toHaveProperty('ai.toolCall.name', 'search_knowledgebase');
      expect(toolCallSpan?.spanAttributes).toHaveProperty('ai.toolCall.id', 'call_xyz123abc456def789');
    });

    it('should extract metadata correctly', () => {
      const resourceSpans = otlpV4SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      // Find a span with metadata (ai.streamText.doStream spans have metadata, not ai.toolCall)
      const spanWithMetadata = result.find((s) => s.name === 'ai.streamText.doStream');
      expect(spanWithMetadata).toBeDefined();
      expect(spanWithMetadata?.traceName).toBe('customer-support-agent');
      expect(spanWithMetadata?.promptName).toBe('customer-support-agent');
      expect(spanWithMetadata?.props).toBe(
        '{"customer_question":"I\'m having trouble with my order. How long does shipping take?"}'
      );
    });

    it('should extract input from prompt messages', () => {
      const resourceSpans = otlpV4SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const doStreamSpans = result.filter((s) => s.name === 'ai.streamText.doStream');
      doStreamSpans.forEach((span) => {
        expect(span.input).toBeDefined();
        expect(Array.isArray(span.input)).toBe(true);
        const inputText = JSON.stringify(span.input);
        expect(inputText).toContain('customer service agent');
      });
    });

    it('should handle events correctly', () => {
      const resourceSpans = otlpV4SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const doStreamSpans = result.filter((s) => s.name === 'ai.streamText.doStream');
      doStreamSpans.forEach((span) => {
        expect(span.events.length).toBeGreaterThanOrEqual(2);
        const firstChunkEvent = span.events.find((e) => e.name === 'ai.stream.firstChunk');
        const finishEvent = span.events.find((e) => e.name === 'ai.stream.finish');
        expect(firstChunkEvent).toBeDefined();
        expect(finishEvent).toBeDefined();
      });
    });

    it('should extract usage tokens correctly', () => {
      const resourceSpans = otlpV4SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const secondDoStream = result.find((s) => s.spanId === 'c3d4e5f6a7b8c9d0');
      // v4 tokens should be normalized to inputTokens, outputTokens, totalTokens
      expect(secondDoStream?.inputTokens).toBe(241);
      expect(secondDoStream?.outputTokens).toBe(30);
      expect(secondDoStream?.totalTokens).toBe(271);
      // Check raw attributes are preserved
      expect(secondDoStream?.spanAttributes).toHaveProperty('ai.usage.promptTokens', 241);
      expect(secondDoStream?.spanAttributes).toHaveProperty('ai.usage.completionTokens', 30);
      expect(secondDoStream?.spanAttributes).toHaveProperty('gen_ai.usage.input_tokens', 241);
    });

    it('should extract reasoning tokens from providerMetadata', () => {
      const resourceSpans = otlpV4SuccessData as { resourceSpans: OtlpResourceSpans[] };
      const result = normalizeOtlpSpans(resourceSpans.resourceSpans);

      const secondDoStream = result.find((s) => s.spanId === 'c3d4e5f6a7b8c9d0');
      // v4 reasoning tokens come from providerMetadata
      if (secondDoStream?.spanAttributes['ai.response.providerMetadata']) {
        expect(secondDoStream?.reasoningTokens).toBeDefined();
      }
    });
  });

  describe('OTLP v4 Error Data', () => {
    it('should normalize all v4 error spans', () => {
      // v4 error data is a single object with resourceSpans array
      const resourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const result = normalizeOtlpSpans(resourceSpans);

      // Should have 4 spans total
      expect(result).toHaveLength(4);

      // Only spans with .doGenerate should be GENERATION
      const generationSpans = result.filter((s) => s.type === SpanType.GENERATION);
      // All doGenerate spans with model attributes should be GENERATION
      expect(generationSpans.length).toBe(3);

      // All spans should have same traceId
      const traceIds = new Set(result.map((s) => s.traceId));
      expect(traceIds.size).toBe(1);
      expect(traceIds.has('test-trace-id-1234567890abcdef')).toBe(true);

      // Check service name
      result.forEach((span) => {
        expect(span.serviceName).toBe('agentmark-client');
      });
    });

    it('should detect v4 version correctly', () => {
      const resourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const result = normalizeOtlpSpans(resourceSpans);

      // v4 uses ai.prompt.* attributes (not ai.request.*)
      const doGenerateSpan = result.find((s) => s.name === 'ai.generateText.doGenerate');
      expect(doGenerateSpan).toBeDefined();
      expect(doGenerateSpan?.type).toBe(SpanType.GENERATION);

      // Check that v4 attributes are present
      expect(doGenerateSpan?.spanAttributes).toHaveProperty('ai.prompt.format');
      expect(doGenerateSpan?.spanAttributes).toHaveProperty('ai.prompt.messages');
    });

    it('should extract v4 metadata correctly', () => {
      const resourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const result = normalizeOtlpSpans(resourceSpans);

      const firstSpan = result[0];

      // v4 uses ai.telemetry.metadata.* prefix
      expect(firstSpan.traceName).toBe('customer-support');
      expect(firstSpan.sessionId).toBe('session-123');
      expect(firstSpan.userId).toBe('user-123');
      expect(firstSpan.sessionName).toBe('my-first-session');
      expect(firstSpan.promptName).toBe('customer-support-agent');
      expect(firstSpan.props).toBe('{"customer_question":"How long does shipping take?"}');
    });

    it('should extract v4 input from ai.prompt.messages', () => {
      const resourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const result = normalizeOtlpSpans(resourceSpans);

      const doGenerateSpan = result.find((s) => s.name === 'ai.generateText.doGenerate');
      expect(doGenerateSpan?.input).toBeDefined();
      expect(Array.isArray(doGenerateSpan?.input)).toBe(true);
      const inputText = JSON.stringify(doGenerateSpan?.input);
      expect(inputText).toContain('customer service agent');
      expect(inputText).toContain('How long does shipping take?');
    });

    it('should extract v4 input from ai.prompt (parent span)', () => {
      const resourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const result = normalizeOtlpSpans(resourceSpans);

      const parentSpan = result.find((s) => s.name === 'ai.generateText');
      expect(parentSpan).toBeDefined();
      expect(parentSpan?.type).toBe(SpanType.SPAN); // Parent span without .doGenerate should be SPAN
      expect(parentSpan?.input).toBeDefined();
      expect(Array.isArray(parentSpan?.input)).toBe(true);
      const inputText = JSON.stringify(parentSpan?.input);
      expect(inputText).toContain('customer service agent');
      expect(inputText).toContain('How long does shipping take?');
    });

    it('should only classify spans with .doGenerate or .doStream as GENERATION', () => {
      const resourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const result = normalizeOtlpSpans(resourceSpans);

      // Only spans with .doGenerate should be GENERATION
      const generationSpans = result.filter((s) => s.type === SpanType.GENERATION);
      expect(generationSpans.length).toBeGreaterThan(0);
      
      generationSpans.forEach((span) => {
        expect(span.name).toMatch(/\.doGenerate|\.doStream/);
      });

      // Parent span without .doGenerate should be SPAN
      const parentSpan = result.find((s) => s.name === 'ai.generateText');
      expect(parentSpan?.type).toBe(SpanType.SPAN);
    });

    it('should check which spans have ai.prompt vs ai.prompt.messages', () => {
      const resourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const result = normalizeOtlpSpans(resourceSpans);

      // doGenerate spans should have ai.prompt.messages
      const doGenerateSpans = result.filter((s) => s.name === 'ai.generateText.doGenerate');
      doGenerateSpans.forEach((span) => {
        expect(span.spanAttributes).toHaveProperty('ai.prompt.messages');
        expect(span.spanAttributes).not.toHaveProperty('ai.prompt');
      });

      // Parent span should have ai.prompt
      const parentSpan = result.find((s) => s.name === 'ai.generateText');
      expect(parentSpan?.spanAttributes).toHaveProperty('ai.prompt');
      expect(parentSpan?.spanAttributes).not.toHaveProperty('ai.prompt.messages');
    });

    it('should extract model correctly from v4 spans', () => {
      const resourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const result = normalizeOtlpSpans(resourceSpans);

      result.forEach((span) => {
        expect(span.model).toBe('gpt-4o');
      });
    });

    it('should handle v4 status codes correctly', () => {
      const resourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const result = normalizeOtlpSpans(resourceSpans);

      // All spans should have error status (code 2)
      result.forEach((span) => {
        expect(span.statusCode).toBe('2');
        expect(span.statusMessage).toBeDefined();
        expect(span.statusMessage).toContain('quota');
      });
    });

    it('should extract resource attributes from v4 data', () => {
      const resourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const result = normalizeOtlpSpans(resourceSpans);

      const firstSpan = result[0];
      expect(firstSpan.resourceAttributes).toHaveProperty('service.name', 'agentmark-client');
      expect(firstSpan.resourceAttributes).toHaveProperty('host.name', 'test-host');
      expect(firstSpan.resourceAttributes).toHaveProperty('process.pid', 13003);
      expect(firstSpan.resourceAttributes).toHaveProperty('host.arch', 'amd64');
    });

    it('should extract span attributes from v4 data', () => {
      const resourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const result = normalizeOtlpSpans(resourceSpans);

      const doGenerateSpan = result.find((s) => s.name === 'ai.generateText.doGenerate');
      expect(doGenerateSpan?.spanAttributes).toHaveProperty('ai.model.id', 'gpt-4o');
      expect(doGenerateSpan?.spanAttributes).toHaveProperty('ai.model.provider', 'openai.chat');
      expect(doGenerateSpan?.spanAttributes).toHaveProperty('ai.prompt.format', 'messages');
      expect(doGenerateSpan?.spanAttributes).toHaveProperty('ai.settings.maxRetries', 2);
    });

    it('should handle v4 timing correctly', () => {
      const resourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const result = normalizeOtlpSpans(resourceSpans);

      const firstSpan = result[0];
      // Timing should be converted from nanoseconds to milliseconds
      expect(firstSpan.startTime).toBeGreaterThan(1764591474000);
      expect(firstSpan.startTime).toBeLessThan(1764591475000);
      expect(firstSpan.endTime).toBeGreaterThan(1764591476000);
      expect(firstSpan.endTime).toBeLessThan(1764591477000);
      expect(firstSpan.duration).toBeGreaterThan(0);
    });
  });

  describe('v4 vs v5 Comparison', () => {
    it('should handle both v4 and v5 input formats', () => {
      const v5ResourceSpans = otlpV5ErrorData as { resourceSpans: OtlpResourceSpans[] };
      const v5Result = normalizeOtlpSpans(v5ResourceSpans.resourceSpans);

      const v4ResourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const v4Result = normalizeOtlpSpans(v4ResourceSpans);

      // Both should extract input successfully
      expect(v5Result[0].input).toBeDefined();
      expect(Array.isArray(v5Result[0].input)).toBe(true);
      expect(v4Result[0].input).toBeDefined();
      expect(Array.isArray(v4Result[0].input)).toBe(true);

      // Both should extract model
      expect(v5Result[0].model).toBe('gpt-4o');
      expect(v4Result[0].model).toBe('gpt-4o');

      // Both should extract metadata
      expect(v5Result[0].traceName).toBeDefined();
      expect(v4Result[0].traceName).toBeDefined();
    });

    it('should classify both v4 and v5 spans as GENERATION type', () => {
      const v5ResourceSpans = otlpV5ErrorData as { resourceSpans: OtlpResourceSpans[] };
      const v5Result = normalizeOtlpSpans(v5ResourceSpans.resourceSpans);

      const v4ResourceSpans = (otlpV4ErrorData as { resourceSpans: OtlpResourceSpans[] }).resourceSpans;
      const v4Result = normalizeOtlpSpans(v4ResourceSpans);

      expect(v5Result[0].type).toBe(SpanType.GENERATION);
      expect(v4Result[0].type).toBe(SpanType.GENERATION);
    });
  });

  describe('normalizeSpan vs normalizeOtlpSpans comparison', () => {
    it('should produce same results when converting OTLP manually', () => {
      const resourceSpans = otlpV5ErrorData as { resourceSpans: OtlpResourceSpans[] };
      const otlpResult = normalizeOtlpSpans(resourceSpans.resourceSpans);

      // Manually convert and use normalizeSpan
      const resourceSpan = resourceSpans.resourceSpans[0];
      const scopeSpan = resourceSpan.scopeSpans[0];
      const otlpSpan = scopeSpan.spans[0];

      // Convert attributes manually
      const resourceAttributes: Record<string, any> = {};
      resourceSpan.resource?.attributes?.forEach((attr) => {
        if (attr.value.stringValue !== undefined) {
          resourceAttributes[attr.key] = attr.value.stringValue;
        } else if (attr.value.intValue !== undefined) {
          resourceAttributes[attr.key] =
            typeof attr.value.intValue === 'string'
              ? parseInt(attr.value.intValue, 10)
              : attr.value.intValue;
        } else if (attr.value.arrayValue?.values) {
          resourceAttributes[attr.key] = attr.value.arrayValue.values.map((v) =>
            v.stringValue !== undefined ? v.stringValue : v
          );
        }
      });

      const spanAttributes: Record<string, any> = {};
      otlpSpan.attributes?.forEach((attr) => {
        if (attr.value.stringValue !== undefined) {
          spanAttributes[attr.key] = attr.value.stringValue;
        } else if (attr.value.intValue !== undefined) {
          spanAttributes[attr.key] =
            typeof attr.value.intValue === 'string'
              ? parseInt(attr.value.intValue, 10)
              : attr.value.intValue;
        } else if (attr.value.doubleValue !== undefined) {
          spanAttributes[attr.key] = attr.value.doubleValue;
        } else if (attr.value.arrayValue?.values) {
          spanAttributes[attr.key] = attr.value.arrayValue.values.map((v) =>
            v.stringValue !== undefined ? v.stringValue : v
          );
        }
      });

      const resource: OtelResource = { attributes: resourceAttributes };
      const scope: OtelScope = { name: scopeSpan.scope?.name };
      const span: OtelSpan = {
        traceId: otlpSpan.traceId,
        spanId: otlpSpan.spanId,
        parentSpanId: otlpSpan.parentSpanId,
        name: otlpSpan.name,
        kind: otlpSpan.kind,
        startTimeUnixNano: otlpSpan.startTimeUnixNano,
        endTimeUnixNano: otlpSpan.endTimeUnixNano,
        attributes: spanAttributes,
        events: otlpSpan.events?.map((e) => ({
          timeUnixNano: e.timeUnixNano,
          name: e.name,
          attributes: e.attributes?.reduce((acc, attr) => {
            if (attr.value.stringValue !== undefined) {
              acc[attr.key] = attr.value.stringValue;
            } else if (attr.value.doubleValue !== undefined) {
              acc[attr.key] = attr.value.doubleValue;
            }
            return acc;
          }, {} as Record<string, any>),
        })),
      };

      const manualResult = normalizeSpan(resource, scope, span);

      // Compare key fields
      expect(manualResult.traceId).toBe(otlpResult[0].traceId);
      expect(manualResult.spanId).toBe(otlpResult[0].spanId);
      expect(manualResult.name).toBe(otlpResult[0].name);
      expect(manualResult.type).toBe(otlpResult[0].type);
      expect(manualResult.model).toBe(otlpResult[0].model);
      expect(manualResult.serviceName).toBe(otlpResult[0].serviceName);
    });
  });

  describe('Multiple spans handling', () => {
    it('should handle multiple spans in same resourceSpan', () => {
      const resourceSpans: OtlpResourceSpans[] = [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'test-service' } }],
          },
          scopeSpans: [
            {
              scope: { name: 'ai' },
              spans: [
                {
                  traceId: 'trace-1',
                  spanId: 'span-1',
                  name: 'span1',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  attributes: [
                    {
                      key: 'gen_ai.request.model',
                      value: { stringValue: 'gpt-4' },
                    },
                  ],
                },
                {
                  traceId: 'trace-2',
                  spanId: 'span-2',
                  name: 'span2',
                  kind: 1,
                  startTimeUnixNano: '2000000000',
                  endTimeUnixNano: '3000000000',
                  attributes: [
                    {
                      key: 'gen_ai.request.model',
                      value: { stringValue: 'gpt-3.5' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const result = normalizeOtlpSpans(resourceSpans);

      expect(result).toHaveLength(2);
      expect(result[0].spanId).toBe('span-1');
      expect(result[0].model).toBe('gpt-4');
      expect(result[1].spanId).toBe('span-2');
      expect(result[1].model).toBe('gpt-3.5');
    });

    it('should handle multiple scopeSpans', () => {
      const resourceSpans: OtlpResourceSpans[] = [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'test-service' } }],
          },
          scopeSpans: [
            {
              scope: { name: 'ai' },
              spans: [
                {
                  traceId: 'trace-1',
                  spanId: 'span-1',
                  name: 'ai.generateText.doGenerate',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  attributes: [
                    {
                      key: 'gen_ai.request.model',
                      value: { stringValue: 'gpt-4' },
                    },
                  ],
                },
              ],
            },
            {
              scope: { name: 'http' },
              spans: [
                {
                  traceId: 'trace-2',
                  spanId: 'span-2',
                  name: 'http-span',
                  kind: 1,
                  startTimeUnixNano: '2000000000',
                  endTimeUnixNano: '3000000000',
                },
              ],
            },
          ],
        },
      ];

      const result = normalizeOtlpSpans(resourceSpans);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('ai.generateText.doGenerate');
      expect(result[0].type).toBe(SpanType.GENERATION);
      expect(result[1].name).toBe('http-span');
      expect(result[1].type).toBe(SpanType.SPAN);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty resourceSpans array', () => {
      const result = normalizeOtlpSpans([]);
      expect(result).toHaveLength(0);
    });

    it('should handle resourceSpan with no spans', () => {
      const resourceSpans: OtlpResourceSpans[] = [
        {
          resource: {
            attributes: [],
          },
          scopeSpans: [
            {
              scope: { name: 'ai' },
              spans: [],
            },
          ],
        },
      ];

      const result = normalizeOtlpSpans(resourceSpans);
      expect(result).toHaveLength(0);
    });

    it('should handle missing resource', () => {
      const resourceSpans: OtlpResourceSpans[] = [
        {
          scopeSpans: [
            {
              scope: { name: 'ai' },
              spans: [
                {
                  traceId: 'trace-1',
                  spanId: 'span-1',
                  name: 'test',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                },
              ],
            },
          ],
        },
      ];

      const result = normalizeOtlpSpans(resourceSpans);
      expect(result).toHaveLength(1);
      expect(result[0].resourceAttributes).toEqual({});
    });

    it('should handle missing scope', () => {
      const resourceSpans: OtlpResourceSpans[] = [
        {
          resource: {
            attributes: [],
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'trace-1',
                  spanId: 'span-1',
                  name: 'test',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                },
              ],
            },
          ],
        },
      ];

      const result = normalizeOtlpSpans(resourceSpans);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(SpanType.SPAN); // No transformer for undefined scope
    });

    it('should handle malformed OTLP attributes gracefully', () => {
      const resourceSpans: OtlpResourceSpans[] = [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'test-service' } }],
          },
          scopeSpans: [
            {
              scope: { name: 'ai' },
              spans: [
                {
                  traceId: 'trace-1',
                  spanId: 'span-1',
                  name: 'ai.streamText.doStream',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  attributes: [
                    {
                      key: 'gen_ai.request.model',
                      value: { stringValue: 'gpt-4' },
                    },
                    // Malformed attribute - missing value
                    {
                      key: 'malformed.attr',
                      value: {} as any,
                    },
                    // Malformed attribute - invalid number
                    {
                      key: 'invalid.number',
                      value: { intValue: 'not-a-number' as any },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const result = normalizeOtlpSpans(resourceSpans);
      expect(result).toHaveLength(1);
      expect(result[0].model).toBe('gpt-4');
      // Should not throw and should handle malformed attributes gracefully
      expect(result[0].spanAttributes).toBeDefined();
    });

    it('should throw error for invalid timestamp values', () => {
      const resourceSpans: OtlpResourceSpans[] = [
        {
          resource: {
            attributes: [],
          },
          scopeSpans: [
            {
              scope: { name: 'ai' },
              spans: [
                {
                  traceId: 'trace-1',
                  spanId: 'span-1',
                  name: 'test',
                  kind: 1,
                  startTimeUnixNano: 'invalid' as any,
                  endTimeUnixNano: '2000000000',
                },
              ],
            },
          ],
        },
      ];

      // BigInt conversion throws for invalid values, which is expected behavior
      expect(() => normalizeOtlpSpans(resourceSpans)).toThrow();
    });

    it('should handle missing required span fields', () => {
      const resourceSpans: OtlpResourceSpans[] = [
        {
          resource: {
            attributes: [],
          },
          scopeSpans: [
            {
              scope: { name: 'ai' },
              spans: [
                {
                  traceId: '',
                  spanId: '',
                  name: '',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                } as any,
              ],
            },
          ],
        },
      ];

      const result = normalizeOtlpSpans(resourceSpans);
      expect(result).toHaveLength(1);
      expect(result[0].traceId).toBe('');
      expect(result[0].spanId).toBe('');
      expect(result[0].name).toBe('');
    });
  });
});

