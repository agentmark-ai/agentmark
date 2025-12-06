import { describe, it, expect, beforeEach } from 'vitest';
import { TransformerRegistry } from '../src/normalizer';
import { ScopeTransformer, SpanType } from '../src/normalizer/types';
import { OtelSpan } from '../src/normalizer/types';

describe('Transformer Registry', () => {
  let registry: TransformerRegistry;

  beforeEach(() => {
    registry = new TransformerRegistry();
  });

  describe('register', () => {
    it('should register a transformer for a scope', () => {
      const transformer: ScopeTransformer = {
        classify: () => SpanType.SPAN,
        transform: () => ({}),
      };

      registry.register('test-scope', transformer);

      const retrieved = registry.getTransformer('test-scope');
      expect(retrieved).toBe(transformer);
    });

    it('should overwrite existing transformer when registering same scope', () => {
      const transformer1: ScopeTransformer = {
        classify: () => SpanType.SPAN,
        transform: () => ({}),
      };

      const transformer2: ScopeTransformer = {
        classify: () => SpanType.GENERATION,
        transform: () => ({}),
      };

      registry.register('test-scope', transformer1);
      registry.register('test-scope', transformer2);

      const retrieved = registry.getTransformer('test-scope');
      expect(retrieved).toBe(transformer2);
    });

    it('should allow registering multiple scopes', () => {
      const transformer1: ScopeTransformer = {
        classify: () => SpanType.SPAN,
        transform: () => ({}),
      };

      const transformer2: ScopeTransformer = {
        classify: () => SpanType.GENERATION,
        transform: () => ({}),
      };

      registry.register('scope1', transformer1);
      registry.register('scope2', transformer2);

      expect(registry.getTransformer('scope1')).toBe(transformer1);
      expect(registry.getTransformer('scope2')).toBe(transformer2);
    });
  });

  describe('getTransformer', () => {
    it('should return null for unregistered scope', () => {
      const result = registry.getTransformer('unknown-scope');
      expect(result).toBeNull();
    });

    it('should return registered transformer', () => {
      const transformer: ScopeTransformer = {
        classify: () => SpanType.SPAN,
        transform: () => ({}),
      };

      registry.register('test-scope', transformer);
      const result = registry.getTransformer('test-scope');

      expect(result).toBe(transformer);
    });

    it('should return default transformer when scope not found', () => {
      const defaultTransformer: ScopeTransformer = {
        classify: () => SpanType.SPAN,
        transform: () => ({}),
      };

      registry.setDefault(defaultTransformer);
      const result = registry.getTransformer('unknown-scope');

      expect(result).toBe(defaultTransformer);
    });

    it('should prefer registered transformer over default', () => {
      const defaultTransformer: ScopeTransformer = {
        classify: () => SpanType.SPAN,
        transform: () => ({}),
      };

      const scopeTransformer: ScopeTransformer = {
        classify: () => SpanType.GENERATION,
        transform: () => ({}),
      };

      registry.setDefault(defaultTransformer);
      registry.register('test-scope', scopeTransformer);

      const result = registry.getTransformer('test-scope');
      expect(result).toBe(scopeTransformer);
    });

    it('should return null when no transformer and no default', () => {
      const result = registry.getTransformer('unknown-scope');
      expect(result).toBeNull();
    });
  });

  describe('setDefault', () => {
    it('should set default transformer', () => {
      const defaultTransformer: ScopeTransformer = {
        classify: () => SpanType.SPAN,
        transform: () => ({}),
      };

      registry.setDefault(defaultTransformer);
      const result = registry.getTransformer('unknown-scope');

      expect(result).toBe(defaultTransformer);
    });

    it('should overwrite existing default transformer', () => {
      const default1: ScopeTransformer = {
        classify: () => SpanType.SPAN,
        transform: () => ({}),
      };

      const default2: ScopeTransformer = {
        classify: () => SpanType.GENERATION,
        transform: () => ({}),
      };

      registry.setDefault(default1);
      registry.setDefault(default2);

      const result = registry.getTransformer('unknown-scope');
      expect(result).toBe(default2);
    });

    it('should allow setting default to null', () => {
      const defaultTransformer: ScopeTransformer = {
        classify: () => SpanType.SPAN,
        transform: () => ({}),
      };

      registry.setDefault(defaultTransformer);
      registry.setDefault(null as any);

      const result = registry.getTransformer('unknown-scope');
      expect(result).toBeNull();
    });
  });

  describe('integration', () => {
    it('should work with real transformer implementation', () => {
      const transformer: ScopeTransformer = {
        classify: (_span: OtelSpan, attributes: Record<string, any>) => {
          if (attributes['model']) {
            return SpanType.GENERATION;
          }
          return SpanType.SPAN;
        },
        transform: (_span: OtelSpan, attributes: Record<string, any>) => {
          return {
            model: attributes['model'],
          };
        },
      };

      registry.register('ai', transformer);

      const span: OtelSpan = {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };

      const retrieved = registry.getTransformer('ai');
      expect(retrieved).toBe(transformer);

      const type = retrieved!.classify(span, { model: 'gpt-4' });
      expect(type).toBe(SpanType.GENERATION);

      const transformed = retrieved!.transform(span, { model: 'gpt-4' });
      expect(transformed.model).toBe('gpt-4');
    });
  });
});

