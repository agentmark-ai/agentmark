import { describe, it, expect } from 'vitest';
import { normalizeSpan, normalizeOtlpSpans, SpanType } from '../src/normalizer';
import { OtelResource, OtelScope, OtelSpan } from '../src/normalizer/types';
import { OtlpResourceSpans } from '../src/normalizer/converters/otlp-converter';

describe('Normalizer', () => {
  describe('normalizeSpan', () => {
    it('should normalize basic span with identity fields', () => {
      const resource: OtelResource = {
        attributes: {
          'service.name': 'test-service',
        },
      };
      const scope: OtelScope = {
        name: 'test-scope',
      };
      const span: OtelSpan = {
        traceId: 'trace-123',
        spanId: 'span-456',
        parentSpanId: 'span-789',
        name: 'test-span',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = normalizeSpan(resource, scope, span);

      expect(result.traceId).toBe('trace-123');
      expect(result.spanId).toBe('span-456');
      expect(result.parentSpanId).toBe('span-789');
      expect(result.name).toBe('test-span');
      expect(result.kind).toBe('1');
      expect(result.serviceName).toBe('test-service');
    });

    it('should convert timing from nanoseconds to milliseconds', () => {
      const resource: OtelResource = { attributes: {} };
      const scope: OtelScope = { name: 'test' };
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = normalizeSpan(resource, scope, span);

      expect(result.startTime).toBe(1000);
      expect(result.endTime).toBe(2000);
      expect(result.duration).toBe(1000);
    });

    it('should merge resource and span attributes', () => {
      const resource: OtelResource = {
        attributes: {
          'service.name': 'test-service',
          'resource.attr': 'resource-value',
        },
      };
      const scope: OtelScope = { name: 'test' };
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: {
          'span.attr': 'span-value',
          'service.name': 'overridden-service',
        },
      };

      const result = normalizeSpan(resource, scope, span);

      expect(result.resourceAttributes).toEqual({
        'service.name': 'test-service',
        'resource.attr': 'resource-value',
      });
      expect(result.spanAttributes).toEqual({
        'span.attr': 'span-value',
        'service.name': 'overridden-service',
      });
      // Span attributes override resource attributes in merged attributes
      // But serviceName comes from resource attributes, not merged
      expect(result.serviceName).toBe('test-service');
    });

    it('should transform events', () => {
      const resource: OtelResource = { attributes: {} };
      const scope: OtelScope = { name: 'test' };
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        events: [
          {
            timeUnixNano: '1500000000',
            name: 'event1',
            attributes: { 'event.attr': 'value' },
          },
          {
            timeUnixNano: '1800000000',
            name: 'event2',
            attributes: {},
          },
        ],
      };

      const result = normalizeSpan(resource, scope, span);

      expect(result.events).toHaveLength(2);
      expect(result.events[0].timestamp).toBe(1500);
      expect(result.events[0].name).toBe('event1');
      expect(result.events[0].attributes).toEqual({ 'event.attr': 'value' });
      expect(result.events[1].timestamp).toBe(1800);
      expect(result.events[1].name).toBe('event2');
    });

    it('should transform links', () => {
      const resource: OtelResource = { attributes: {} };
      const scope: OtelScope = { name: 'test' };
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        links: [
          {
            traceId: 'linked-trace',
            spanId: 'linked-span',
            traceState: 'state',
            attributes: { 'link.attr': 'value' },
          },
        ],
      };

      const result = normalizeSpan(resource, scope, span);

      expect(result.links).toHaveLength(1);
      expect(result.links[0].traceId).toBe('linked-trace');
      expect(result.links[0].spanId).toBe('linked-span');
      expect(result.links[0].traceState).toBe('state');
      expect(result.links[0].attributes).toEqual({ 'link.attr': 'value' });
    });

    it('should handle status code and message', () => {
      const resource: OtelResource = { attributes: {} };
      const scope: OtelScope = { name: 'test' };
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        status: {
          code: 1,
          message: 'error message',
        },
      };

      const result = normalizeSpan(resource, scope, span);

      expect(result.statusCode).toBe('1');
      expect(result.statusMessage).toBe('error message');
    });

    it('should default status code to 0 when missing', () => {
      const resource: OtelResource = { attributes: {} };
      const scope: OtelScope = { name: 'test' };
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = normalizeSpan(resource, scope, span);

      expect(result.statusCode).toBe('0');
      expect(result.statusMessage).toBeUndefined();
    });

    it('should classify span type as GENERATION when transformer exists and classifies it', () => {
      const resource: OtelResource = {
        attributes: {
          'service.name': 'test',
        },
      };
      const scope: OtelScope = { name: 'ai' };
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'ai.streamText.doStream',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
        attributes: {
          'gen_ai.request.model': 'gpt-4',
          'ai.response.text': 'response',
        },
      };

      const result = normalizeSpan(resource, scope, span);

      expect(result.type).toBe(SpanType.GENERATION);
    });

    it('should classify span type as SPAN when no transformer matches', () => {
      const resource: OtelResource = { attributes: {} };
      const scope: OtelScope = { name: 'unknown-scope' };
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test-span',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = normalizeSpan(resource, scope, span);

      expect(result.type).toBe(SpanType.SPAN);
    });

    it('should handle empty attributes', () => {
      const resource: OtelResource = {};
      const scope: OtelScope = {};
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = normalizeSpan(resource, scope, span);

      expect(result.resourceAttributes).toEqual({});
      expect(result.spanAttributes).toEqual({});
    });

    it('should handle missing parentSpanId', () => {
      const resource: OtelResource = { attributes: {} };
      const scope: OtelScope = { name: 'test' };
      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const result = normalizeSpan(resource, scope, span);

      expect(result.parentSpanId).toBeUndefined();
    });
  });

  describe('normalizeOtlpSpans', () => {
    it('should normalize spans from OTLP format', () => {
      const resourceSpans: OtlpResourceSpans[] = [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'test-service' } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'ai' },
              spans: [
                {
                  traceId: 'trace-123',
                  spanId: 'span-456',
                  name: 'test-span',
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
          ],
        },
      ];

      const result = normalizeOtlpSpans(resourceSpans);

      expect(result).toHaveLength(1);
      expect(result[0].traceId).toBe('trace-123');
      expect(result[0].spanId).toBe('span-456');
      expect(result[0].name).toBe('test-span');
      expect(result[0].serviceName).toBe('test-service');
    });

    it('should handle multiple spans', () => {
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
                  name: 'span1',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                },
                {
                  traceId: 'trace-2',
                  spanId: 'span-2',
                  name: 'span2',
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
      expect(result[0].spanId).toBe('span-1');
      expect(result[1].spanId).toBe('span-2');
    });

    it('should handle multiple resourceSpans', () => {
      const resourceSpans: OtlpResourceSpans[] = [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'service1' } }],
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
                },
              ],
            },
          ],
        },
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'service2' } }],
          },
          scopeSpans: [
            {
              scope: { name: 'http' },
              spans: [
                {
                  traceId: 'trace-2',
                  spanId: 'span-2',
                  name: 'span2',
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
      expect(result[0].serviceName).toBe('service1');
      expect(result[1].serviceName).toBe('service2');
    });

    it('should convert OTLP events and links', () => {
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
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  events: [
                    {
                      timeUnixNano: '1500000000',
                      name: 'event1',
                      attributes: [
                        { key: 'event.attr', value: { stringValue: 'value' } },
                      ],
                    },
                  ],
                  links: [
                    {
                      traceId: 'linked-trace',
                      spanId: 'linked-span',
                      attributes: [
                        { key: 'link.attr', value: { stringValue: 'value' } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const result = normalizeOtlpSpans(resourceSpans);

      expect(result[0].events).toHaveLength(1);
      expect(result[0].events[0].name).toBe('event1');
      expect(result[0].events[0].attributes).toEqual({ 'event.attr': 'value' });
      expect(result[0].links).toHaveLength(1);
      expect(result[0].links[0].traceId).toBe('linked-trace');
      expect(result[0].links[0].attributes).toEqual({ 'link.attr': 'value' });
    });

    it('should handle empty resourceSpans array', () => {
      const result = normalizeOtlpSpans([]);
      expect(result).toHaveLength(0);
    });
  });
});

