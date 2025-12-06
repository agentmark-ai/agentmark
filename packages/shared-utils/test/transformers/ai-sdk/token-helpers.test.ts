import { describe, it, expect } from 'vitest';
import { extractReasoningFromProviderMetadata } from '../../../src/normalizer';

describe('Token Helpers', () => {
  describe('extractReasoningFromProviderMetadata', () => {
    it('should extract reasoning tokens from OpenAI provider metadata (string)', () => {
      const attributes = {
        'ai.response.providerMetadata': JSON.stringify({
          openai: {
            responseId: 'resp-123',
            reasoningTokens: 25,
          },
        }),
      };

      const result = extractReasoningFromProviderMetadata(attributes);
      expect(result).toBe(25);
    });

    it('should extract reasoning tokens from OpenAI provider metadata (object)', () => {
      const attributes = {
        'ai.response.providerMetadata': {
          openai: {
            responseId: 'resp-123',
            reasoningTokens: 30,
          },
        },
      };

      const result = extractReasoningFromProviderMetadata(attributes);
      expect(result).toBe(30);
    });

    it('should return undefined when providerMetadata is missing', () => {
      const attributes = {};

      const result = extractReasoningFromProviderMetadata(attributes);
      expect(result).toBeUndefined();
    });

    it('should return undefined when reasoningTokens is missing', () => {
      const attributes = {
        'ai.response.providerMetadata': JSON.stringify({
          openai: {
            responseId: 'resp-123',
          },
        }),
      };

      const result = extractReasoningFromProviderMetadata(attributes);
      expect(result).toBeUndefined();
    });

    it('should return undefined when openai is missing', () => {
      const attributes = {
        'ai.response.providerMetadata': JSON.stringify({
          otherProvider: {
            reasoningTokens: 25,
          },
        }),
      };

      const result = extractReasoningFromProviderMetadata(attributes);
      expect(result).toBeUndefined();
    });

    it('should return undefined when reasoningTokens is not a number', () => {
      const attributes = {
        'ai.response.providerMetadata': JSON.stringify({
          openai: {
            responseId: 'resp-123',
            reasoningTokens: '25',
          },
        }),
      };

      const result = extractReasoningFromProviderMetadata(attributes);
      expect(result).toBeUndefined();
    });

    it('should handle invalid JSON gracefully', () => {
      const attributes = {
        'ai.response.providerMetadata': 'invalid-json',
      };

      const result = extractReasoningFromProviderMetadata(attributes);
      expect(result).toBeUndefined();
    });

    it('should handle malformed JSON gracefully', () => {
      const attributes = {
        'ai.response.providerMetadata': '{invalid json}',
      };

      const result = extractReasoningFromProviderMetadata(attributes);
      expect(result).toBeUndefined();
    });

    it('should handle empty providerMetadata object', () => {
      const attributes = {
        'ai.response.providerMetadata': JSON.stringify({}),
      };

      const result = extractReasoningFromProviderMetadata(attributes);
      expect(result).toBeUndefined();
    });

    it('should handle providerMetadata with other fields', () => {
      const attributes = {
        'ai.response.providerMetadata': JSON.stringify({
          openai: {
            responseId: 'resp-123',
            reasoningTokens: 25,
            otherField: 'value',
          },
          otherProvider: {
            someField: 'value',
          },
        }),
      };

      const result = extractReasoningFromProviderMetadata(attributes);
      expect(result).toBe(25);
    });

    it('should handle zero reasoning tokens', () => {
      const attributes = {
        'ai.response.providerMetadata': JSON.stringify({
          openai: {
            responseId: 'resp-123',
            reasoningTokens: 0,
          },
        }),
      };

      const result = extractReasoningFromProviderMetadata(attributes);
      expect(result).toBe(0);
    });
  });
});

