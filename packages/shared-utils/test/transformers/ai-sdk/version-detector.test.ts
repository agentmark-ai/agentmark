import { describe, it, expect } from 'vitest';
import { detectVersion } from '../../../src/normalizer';

describe('Version Detector', () => {
  describe('detectVersion', () => {
    it('should detect v5 when ai.response.text exists', () => {
      const attributes = {
        'ai.response.text': 'response text',
      };

      const result = detectVersion(attributes);
      expect(result).toBe('v5');
    });

    it('should detect v5 when ai.response.toolCalls exists', () => {
      const attributes = {
        'ai.response.toolCalls': [],
      };

      const result = detectVersion(attributes);
      expect(result).toBe('v5');
    });

    it('should detect v5 when ai.response.object exists', () => {
      const attributes = {
        'ai.response.object': {},
      };

      const result = detectVersion(attributes);
      expect(result).toBe('v5');
    });

    it('should detect v4 when ai.result.text exists', () => {
      const attributes = {
        'ai.result.text': 'result text',
      };

      const result = detectVersion(attributes);
      expect(result).toBe('v4');
    });

    it('should detect v4 when ai.result.toolCalls exists', () => {
      const attributes = {
        'ai.result.toolCalls': [],
      };

      const result = detectVersion(attributes);
      expect(result).toBe('v4');
    });

    it('should detect v4 when ai.result.object exists', () => {
      const attributes = {
        'ai.result.object': {},
      };

      const result = detectVersion(attributes);
      expect(result).toBe('v4');
    });

    it('should prefer v5 over v4 when both exist', () => {
      const attributes = {
        'ai.response.text': 'v5 response',
        'ai.result.text': 'v4 result',
      };

      const result = detectVersion(attributes);
      expect(result).toBe('v5');
    });

    it('should return unknown when no version indicators exist', () => {
      const attributes = {
        'gen_ai.request.model': 'gpt-4',
        'other.attribute': 'value',
      };

      const result = detectVersion(attributes);
      expect(result).toBe('unknown');
    });

    it('should return unknown for empty attributes', () => {
      const attributes = {};

      const result = detectVersion(attributes);
      expect(result).toBe('unknown');
    });

    it('should detect v5 with multiple v5 indicators', () => {
      const attributes = {
        'ai.response.text': 'response',
        'ai.response.toolCalls': [],
        'ai.response.object': {},
      };

      const result = detectVersion(attributes);
      expect(result).toBe('v5');
    });

    it('should detect v4 with multiple v4 indicators', () => {
      const attributes = {
        'ai.result.text': 'result',
        'ai.result.toolCalls': [],
        'ai.result.object': {},
      };

      const result = detectVersion(attributes);
      expect(result).toBe('v4');
    });

    it('should handle undefined values', () => {
      const attributes = {
        'ai.response.text': undefined,
        'ai.result.text': undefined,
      };

      const result = detectVersion(attributes);
      expect(result).toBe('unknown');
    });

    it('should handle null values', () => {
      const attributes = {
        'ai.response.text': null,
        'ai.result.text': null,
      };

      const result = detectVersion(attributes);
      expect(result).toBe('unknown');
    });
  });
});

