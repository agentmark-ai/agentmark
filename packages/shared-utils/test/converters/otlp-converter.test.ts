import { describe, it, expect } from 'vitest';
import { convertOtlpAttributes, extractResourceScopeSpan, OtlpResourceSpans } from '../../src/normalizer';

describe('OTLP Converter', () => {
  describe('convertOtlpAttributes', () => {
    it('should convert stringValue attributes', () => {
      const attributes = [
        { key: 'service.name', value: { stringValue: 'test-service' } },
        { key: 'host.name', value: { stringValue: 'test-host' } },
      ];

      const result = convertOtlpAttributes(attributes);
      expect(result).toEqual({
        'service.name': 'test-service',
        'host.name': 'test-host',
      });
    });

    it('should convert intValue attributes', () => {
      const attributes = [
        { key: 'process.pid', value: { intValue: 1234 } },
        { key: 'count', value: { intValue: '5678' } },
      ];

      const result = convertOtlpAttributes(attributes);
      expect(result).toEqual({
        'process.pid': 1234,
        'count': 5678,
      });
    });

    it('should convert doubleValue attributes', () => {
      const attributes = [
        { key: 'latency', value: { doubleValue: 123.456 } },
        { key: 'score', value: { doubleValue: 0.99 } },
      ];

      const result = convertOtlpAttributes(attributes);
      expect(result).toEqual({
        latency: 123.456,
        score: 0.99,
      });
    });

    it('should convert boolValue attributes', () => {
      const attributes = [
        { key: 'enabled', value: { boolValue: true } },
        { key: 'disabled', value: { boolValue: false } },
      ];

      const result = convertOtlpAttributes(attributes);
      expect(result).toEqual({
        enabled: true,
        disabled: false,
      });
    });

    it('should convert arrayValue attributes', () => {
      const attributes = [
        {
          key: 'tags',
          value: {
            arrayValue: {
              values: [
                { stringValue: 'tag1' },
                { stringValue: 'tag2' },
                { intValue: 42 },
              ],
            },
          },
        },
      ];

      const result = convertOtlpAttributes(attributes);
      expect(result).toEqual({
        tags: ['tag1', 'tag2', 42],
      });
    });

    it('should handle nested array values', () => {
      const attributes = [
        {
          key: 'nested',
          value: {
            arrayValue: {
              values: [
                {
                  arrayValue: {
                    values: [{ stringValue: 'nested1' }, { stringValue: 'nested2' }],
                  },
                },
              ],
            },
          },
        },
      ];

      const result = convertOtlpAttributes(attributes);
      expect(result).toEqual({
        nested: [['nested1', 'nested2']],
      });
    });

    it('should handle empty attributes array', () => {
      const result = convertOtlpAttributes([]);
      expect(result).toEqual({});
    });

    it('should handle undefined attributes', () => {
      const result = convertOtlpAttributes(undefined);
      expect(result).toEqual({});
    });

    it('should handle mixed value types', () => {
      const attributes = [
        { key: 'string', value: { stringValue: 'test' } },
        { key: 'number', value: { intValue: 42 } },
        { key: 'float', value: { doubleValue: 3.14 } },
        { key: 'bool', value: { boolValue: true } },
        {
          key: 'array',
          value: {
            arrayValue: {
              values: [{ stringValue: 'item1' }, { intValue: 2 }],
            },
          },
        },
      ];

      const result = convertOtlpAttributes(attributes);
      expect(result).toEqual({
        string: 'test',
        number: 42,
        float: 3.14,
        bool: true,
        array: ['item1', 2],
      });
    });

    it('should skip attributes with missing key', () => {
      const attributes = [
        { key: 'valid', value: { stringValue: 'test' } },
        { key: '', value: { stringValue: 'invalid' } },
      ] as any;

      const result = convertOtlpAttributes(attributes);
      expect(result).toEqual({
        valid: 'test',
      });
    });

    it('should skip __proto__ key to prevent prototype pollution', () => {
      const attributes = [
        { key: 'valid', value: { stringValue: 'test' } },
        { key: '__proto__', value: { stringValue: 'malicious' } },
      ];

      const result = convertOtlpAttributes(attributes);
      expect(result).toEqual({
        valid: 'test',
      });
      // Check that __proto__ is not an own property
      expect(Object.hasOwn(result, '__proto__')).toBe(false);
      // Ensure prototype wasn't polluted
      expect(({} as any).__proto__).not.toBe('malicious');
    });

    it('should skip constructor key to prevent prototype pollution', () => {
      const attributes = [
        { key: 'valid', value: { stringValue: 'test' } },
        { key: 'constructor', value: { stringValue: 'malicious' } },
      ];

      const result = convertOtlpAttributes(attributes);
      expect(result).toEqual({
        valid: 'test',
      });
      // Check that constructor is not an own property
      expect(Object.hasOwn(result, 'constructor')).toBe(false);
    });

    it('should skip prototype key to prevent prototype pollution', () => {
      const attributes = [
        { key: 'valid', value: { stringValue: 'test' } },
        { key: 'prototype', value: { stringValue: 'malicious' } },
      ];

      const result = convertOtlpAttributes(attributes);
      expect(result).toEqual({
        valid: 'test',
      });
      // Check that prototype is not an own property
      expect(Object.hasOwn(result, 'prototype')).toBe(false);
    });
  });

  describe('extractResourceScopeSpan', () => {
    it('should extract resource, scope, and span from OTLP structure', () => {
      const resourceSpans: OtlpResourceSpans = {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'test-service' } },
            { key: 'host.name', value: { stringValue: 'test-host' } },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: 'ai',
              version: '1.0.0',
            },
            spans: [
              {
                traceId: 'trace-123',
                spanId: 'span-456',
                name: 'test-span',
                kind: 1,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
                attributes: [
                  { key: 'span.attr', value: { stringValue: 'value' } },
                ],
              },
            ],
          },
        ],
      };

      const result = extractResourceScopeSpan(resourceSpans);
      expect(result).toHaveLength(1);
      expect(result[0].resource.attributes).toEqual({
        'service.name': 'test-service',
        'host.name': 'test-host',
      });
      expect(result[0].scope).toEqual({
        name: 'ai',
        version: '1.0.0',
      });
      expect(result[0].span.traceId).toBe('trace-123');
      expect(result[0].span.spanId).toBe('span-456');
      expect(result[0].span.name).toBe('test-span');
      expect(result[0].span.attributes).toEqual({
        'span.attr': 'value',
      });
    });

    it('should handle multiple spans in same scope', () => {
      const resourceSpans: OtlpResourceSpans = {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'test' } }],
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
      };

      const result = extractResourceScopeSpan(resourceSpans);
      expect(result).toHaveLength(2);
      expect(result[0].span.spanId).toBe('span-1');
      expect(result[1].span.spanId).toBe('span-2');
    });

    it('should handle multiple scopeSpans', () => {
      const resourceSpans: OtlpResourceSpans = {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'test' } }],
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
      };

      const result = extractResourceScopeSpan(resourceSpans);
      expect(result).toHaveLength(2);
      expect(result[0].scope.name).toBe('ai');
      expect(result[1].scope.name).toBe('http');
    });

    it('should convert events with attributes', () => {
      const resourceSpans: OtlpResourceSpans = {
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
                name: 'test-span',
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
              },
            ],
          },
        ],
      };

      const result = extractResourceScopeSpan(resourceSpans);
      expect(result[0].span.events).toHaveLength(1);
      expect(result[0].span.events![0].name).toBe('event1');
      expect(result[0].span.events![0].attributes).toEqual({
        'event.attr': 'value',
      });
    });

    it('should convert links with attributes', () => {
      const resourceSpans: OtlpResourceSpans = {
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
                name: 'test-span',
                kind: 1,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
                links: [
                  {
                    traceId: 'linked-trace',
                    spanId: 'linked-span',
                    traceState: 'state',
                    attributes: [
                      { key: 'link.attr', value: { stringValue: 'value' } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = extractResourceScopeSpan(resourceSpans);
      expect(result[0].span.links).toHaveLength(1);
      expect(result[0].span.links![0].traceId).toBe('linked-trace');
      expect(result[0].span.links![0].spanId).toBe('linked-span');
      expect(result[0].span.links![0].traceState).toBe('state');
      expect(result[0].span.links![0].attributes).toEqual({
        'link.attr': 'value',
      });
    });

    it('should handle missing resource', () => {
      const resourceSpans: OtlpResourceSpans = {
        scopeSpans: [
          {
            scope: { name: 'ai' },
            spans: [
              {
                traceId: 'trace-1',
                spanId: 'span-1',
                name: 'test-span',
                kind: 1,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
              },
            ],
          },
        ],
      };

      const result = extractResourceScopeSpan(resourceSpans);
      expect(result).toHaveLength(1);
      expect(result[0].resource.attributes).toEqual({});
    });

    it('should handle missing scope', () => {
      const resourceSpans: OtlpResourceSpans = {
        resource: {
          attributes: [],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId: 'trace-1',
                spanId: 'span-1',
                name: 'test-span',
                kind: 1,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
              },
            ],
          },
        ],
      };

      const result = extractResourceScopeSpan(resourceSpans);
      expect(result).toHaveLength(1);
      expect(result[0].scope.name).toBeUndefined();
    });

    it('should handle empty spans array', () => {
      const resourceSpans: OtlpResourceSpans = {
        resource: {
          attributes: [],
        },
        scopeSpans: [
          {
            scope: { name: 'ai' },
            spans: [],
          },
        ],
      };

      const result = extractResourceScopeSpan(resourceSpans);
      expect(result).toHaveLength(0);
    });

    it('should handle status with message', () => {
      const resourceSpans: OtlpResourceSpans = {
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
                name: 'test-span',
                kind: 1,
                startTimeUnixNano: '1000000000',
                endTimeUnixNano: '2000000000',
                status: {
                  code: 1,
                  message: 'error message',
                },
              },
            ],
          },
        ],
      };

      const result = extractResourceScopeSpan(resourceSpans);
      expect(result[0].span.status?.code).toBe(1);
      expect(result[0].span.status?.message).toBe('error message');
    });
  });
});

