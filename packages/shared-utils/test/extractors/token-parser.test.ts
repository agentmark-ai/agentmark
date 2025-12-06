import { describe, it, expect } from 'vitest';
import { parseTokens } from '../../src/normalizer';

describe('Token Parser', () => {
  describe('parseTokens', () => {
    it('should extract input tokens from inputKey', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': 100,
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
      });

      expect(result.inputTokens).toBe(100);
    });

    it('should extract output tokens from outputKey', () => {
      const attributes = {
        'gen_ai.usage.output_tokens': 50,
      };

      const result = parseTokens(attributes, {
        outputKey: 'gen_ai.usage.output_tokens',
      });

      expect(result.outputTokens).toBe(50);
    });

    it('should extract total tokens from totalKey', () => {
      const attributes = {
        'gen_ai.usage.total_tokens': 150,
      };

      const result = parseTokens(attributes, {
        totalKey: 'gen_ai.usage.total_tokens',
      });

      expect(result.totalTokens).toBe(150);
    });

    it('should extract reasoning tokens from reasoningKey', () => {
      const attributes = {
        'ai.usage.reasoningTokens': 25,
      };

      const result = parseTokens(attributes, {
        reasoningKey: 'ai.usage.reasoningTokens',
      });

      expect(result.reasoningTokens).toBe(25);
    });

    it('should fallback to promptKey for input tokens', () => {
      const attributes = {
        'ai.usage.promptTokens': 200,
      };

      const result = parseTokens(attributes, {
        promptKey: 'ai.usage.promptTokens',
      });

      expect(result.inputTokens).toBe(200);
    });

    it('should fallback to completionKey for output tokens', () => {
      const attributes = {
        'ai.usage.completionTokens': 100,
      };

      const result = parseTokens(attributes, {
        completionKey: 'ai.usage.completionTokens',
      });

      expect(result.outputTokens).toBe(100);
    });

    it('should prefer inputKey over promptKey', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': 100,
        'ai.usage.promptTokens': 200,
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
        promptKey: 'ai.usage.promptTokens',
      });

      expect(result.inputTokens).toBe(100);
    });

    it('should prefer outputKey over completionKey', () => {
      const attributes = {
        'gen_ai.usage.output_tokens': 50,
        'ai.usage.completionTokens': 100,
      };

      const result = parseTokens(attributes, {
        outputKey: 'gen_ai.usage.output_tokens',
        completionKey: 'ai.usage.completionTokens',
      });

      expect(result.outputTokens).toBe(50);
    });

    it('should calculate total tokens from input and output when total is missing', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': 100,
        'gen_ai.usage.output_tokens': 50,
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
        outputKey: 'gen_ai.usage.output_tokens',
      });

      expect(result.totalTokens).toBe(150);
    });

    it('should use provided total tokens when available', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': 100,
        'gen_ai.usage.output_tokens': 50,
        'gen_ai.usage.total_tokens': 200,
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
        outputKey: 'gen_ai.usage.output_tokens',
        totalKey: 'gen_ai.usage.total_tokens',
      });

      expect(result.totalTokens).toBe(200);
    });

    it('should handle string number values', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': '100',
        'gen_ai.usage.output_tokens': '50',
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
        outputKey: 'gen_ai.usage.output_tokens',
      });

      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.totalTokens).toBe(150);
    });

    it('should handle number values', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': 100,
        'gen_ai.usage.output_tokens': 50,
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
        outputKey: 'gen_ai.usage.output_tokens',
      });

      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
    });

    it('should handle JSON string format with intValue', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': JSON.stringify({ intValue: 100 }),
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
      });

      expect(result.inputTokens).toBe(100);
    });

    it('should handle JSON string format with number', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': JSON.stringify(100),
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
      });

      expect(result.inputTokens).toBe(100);
    });

    it('should floor decimal numbers', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': 100.7,
        'gen_ai.usage.output_tokens': 50.3,
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
        outputKey: 'gen_ai.usage.output_tokens',
      });

      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
    });

    it('should handle missing values gracefully', () => {
      const attributes = {};

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
        outputKey: 'gen_ai.usage.output_tokens',
        totalKey: 'gen_ai.usage.total_tokens',
      });

      expect(result.inputTokens).toBeUndefined();
      expect(result.outputTokens).toBeUndefined();
      expect(result.totalTokens).toBeUndefined();
    });

    it('should handle invalid string values', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': 'invalid',
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
      });

      expect(result.inputTokens).toBeUndefined();
    });

    it('should handle invalid JSON string values', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': 'not-json',
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
      });

      expect(result.inputTokens).toBeUndefined();
    });

    it('should extract all token types together', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': 100,
        'gen_ai.usage.output_tokens': 50,
        'gen_ai.usage.total_tokens': 150,
        'ai.usage.reasoningTokens': 25,
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
        outputKey: 'gen_ai.usage.output_tokens',
        totalKey: 'gen_ai.usage.total_tokens',
        reasoningKey: 'ai.usage.reasoningTokens',
      });

      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.totalTokens).toBe(150);
      expect(result.reasoningTokens).toBe(25);
    });

    it('should not calculate total if only input is present', () => {
      const attributes = {
        'gen_ai.usage.input_tokens': 100,
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
        outputKey: 'gen_ai.usage.output_tokens',
      });

      expect(result.inputTokens).toBe(100);
      expect(result.totalTokens).toBeUndefined();
    });

    it('should not calculate total if only output is present', () => {
      const attributes = {
        'gen_ai.usage.output_tokens': 50,
      };

      const result = parseTokens(attributes, {
        inputKey: 'gen_ai.usage.input_tokens',
        outputKey: 'gen_ai.usage.output_tokens',
      });

      expect(result.outputTokens).toBe(50);
      expect(result.totalTokens).toBeUndefined();
    });
  });
});

