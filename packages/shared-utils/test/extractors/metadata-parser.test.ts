import { describe, it, expect } from 'vitest';
import { parseMetadata, extractCustomMetadata } from '../../src/normalizer';

describe('Metadata Parser', () => {
  describe('parseMetadata', () => {
    it('should extract session context fields', () => {
      const attributes = {
        'agentmark.metadata.session_id': 'session-123',
        'agentmark.metadata.session_name': 'test-session',
        'agentmark.metadata.user_id': 'user-456',
        'agentmark.metadata.trace_name': 'test-trace',
      };

      const result = parseMetadata(attributes);

      expect(result.sessionId).toBe('session-123');
      expect(result.sessionName).toBe('test-session');
      expect(result.userId).toBe('user-456');
      expect(result.traceName).toBe('test-trace');
    });

    it('should extract dataset/evaluation context fields', () => {
      const attributes = {
        'agentmark.metadata.dataset_run_id': 'run-123',
        'agentmark.metadata.dataset_run_name': 'test-run',
        'agentmark.metadata.dataset_path': 'path/to/dataset',
        'agentmark.metadata.dataset_item_name': 'item-1',
        'agentmark.metadata.dataset_expected_output': 'expected output',
      };

      const result = parseMetadata(attributes);

      expect(result.datasetRunId).toBe('run-123');
      expect(result.datasetRunName).toBe('test-run');
      expect(result.datasetPath).toBe('path/to/dataset');
      expect(result.datasetItemName).toBe('item-1');
      expect(result.datasetExpectedOutput).toBe('expected output');
    });

    it('should extract prompt/template fields', () => {
      const attributes = {
        'agentmark.metadata.prompt_name': 'test-prompt',
        'agentmark.metadata.props': '{"key":"value"}',
      };

      const result = parseMetadata(attributes);

      expect(result.promptName).toBe('test-prompt');
      expect(result.props).toBe('{"key":"value"}');
    });

    it('should extract version control field', () => {
      const attributes = {
        'agentmark.metadata.commit_sha': 'abc123',
      };

      const result = parseMetadata(attributes);

      expect(result.commitSha).toBe('abc123');
    });

    it('should handle custom prefix', () => {
      const attributes = {
        'custom.prefix.session_id': 'session-123',
        'custom.prefix.trace_name': 'test-trace',
      };

      const result = parseMetadata(attributes, 'custom.prefix.');

      expect(result.sessionId).toBe('session-123');
      expect(result.traceName).toBe('test-trace');
    });

    it('should convert non-string values to strings', () => {
      const attributes = {
        'agentmark.metadata.session_id': 123,
        'agentmark.metadata.user_id': true,
      };

      const result = parseMetadata(attributes);

      expect(result.sessionId).toBe('123');
      expect(result.userId).toBe('true');
    });

    it('should handle missing fields gracefully', () => {
      const attributes = {};

      const result = parseMetadata(attributes);

      expect(result.sessionId).toBeUndefined();
      expect(result.traceName).toBeUndefined();
      expect(result.promptName).toBeUndefined();
    });

    it('should only extract fields with correct prefix', () => {
      const attributes = {
        'agentmark.metadata.session_id': 'session-123',
        'other.prefix.session_id': 'other-session',
        'session_id': 'no-prefix',
      };

      const result = parseMetadata(attributes);

      expect(result.sessionId).toBe('session-123');
    });

    it('should extract all metadata fields together', () => {
      const attributes = {
        'agentmark.metadata.session_id': 'session-123',
        'agentmark.metadata.session_name': 'test-session',
        'agentmark.metadata.user_id': 'user-456',
        'agentmark.metadata.trace_name': 'test-trace',
        'agentmark.metadata.dataset_run_id': 'run-123',
        'agentmark.metadata.prompt_name': 'test-prompt',
        'agentmark.metadata.props': '{"key":"value"}',
        'agentmark.metadata.commit_sha': 'abc123',
      };

      const result = parseMetadata(attributes);

      expect(result.sessionId).toBe('session-123');
      expect(result.sessionName).toBe('test-session');
      expect(result.userId).toBe('user-456');
      expect(result.traceName).toBe('test-trace');
      expect(result.datasetRunId).toBe('run-123');
      expect(result.promptName).toBe('test-prompt');
      expect(result.props).toBe('{"key":"value"}');
      expect(result.commitSha).toBe('abc123');
    });

    it('should handle empty string values', () => {
      const attributes = {
        'agentmark.metadata.trace_name': 'test-trace',
      };

      const result = parseMetadata(attributes);
      expect(result.traceName).toBe('test-trace');
    });

    it('should use default prefix when not specified', () => {
      const attributes = {
        'agentmark.metadata.session_id': 'session-123',
      };

      const result = parseMetadata(attributes);

      expect(result.sessionId).toBe('session-123');
    });
  });

  describe('extractCustomMetadata', () => {
    it('should extract custom metadata keys', () => {
      const attributes = {
        'agentmark.metadata.custom_key': 'custom-value',
        'agentmark.metadata.another_key': 'another-value',
      };

      const result = extractCustomMetadata(attributes);

      expect(result.custom_key).toBe('custom-value');
      expect(result.another_key).toBe('another-value');
    });

    it('should exclude known metadata fields', () => {
      const attributes = {
        'agentmark.metadata.session_id': 'session-123',
        'agentmark.metadata.user_id': 'user-456',
        'agentmark.metadata.trace_name': 'test-trace',
        'agentmark.metadata.custom_key': 'custom-value',
        'agentmark.metadata.props': '{"key":"value"}',
      };

      const result = extractCustomMetadata(attributes);

      expect(result.session_id).toBeUndefined();
      expect(result.user_id).toBeUndefined();
      expect(result.trace_name).toBeUndefined();
      expect(result.props).toBeUndefined();
      expect(result.custom_key).toBe('custom-value');
    });

    it('should work with ai.telemetry.metadata prefix', () => {
      const attributes = {
        'ai.telemetry.metadata.custom_key': 'custom-value',
        'ai.telemetry.metadata.session_id': 'session-123', // Should be excluded
      };

      const result = extractCustomMetadata(attributes, 'ai.telemetry.metadata.');

      expect(result.custom_key).toBe('custom-value');
      expect(result.session_id).toBeUndefined();
    });

    it('should convert values to strings', () => {
      const attributes = {
        'agentmark.metadata.number_value': 123,
        'agentmark.metadata.boolean_value': true,
        'agentmark.metadata.null_value': null,
        'agentmark.metadata.object_value': { key: 'value' },
      };

      const result = extractCustomMetadata(attributes);

      expect(result.number_value).toBe('123');
      expect(result.boolean_value).toBe('true');
      expect(result.null_value).toBe('null');
      expect(result.object_value).toBe('[object Object]');
    });

    it('should handle empty attributes', () => {
      const attributes = {};

      const result = extractCustomMetadata(attributes);

      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should handle attributes without metadata prefix', () => {
      const attributes = {
        'other.prefix.key': 'value',
        'no_prefix_key': 'value',
      };

      const result = extractCustomMetadata(attributes);

      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should exclude all known fields', () => {
      const knownFields = [
        'session_id',
        'session_name',
        'user_id',
        'trace_name',
        'dataset_run_id',
        'dataset_run_name',
        'dataset_path',
        'dataset_item_name',
        'dataset_expected_output',
        'prompt_name',
        'props',
        'commit_sha',
      ];

      const attributes: Record<string, string> = {};
      knownFields.forEach(field => {
        attributes[`agentmark.metadata.${field}`] = `value-${field}`;
      });
      attributes['agentmark.metadata.custom_field'] = 'custom-value';

      const result = extractCustomMetadata(attributes);

      knownFields.forEach(field => {
        expect(result[field]).toBeUndefined();
      });
      expect(result.custom_field).toBe('custom-value');
    });

    it('should handle custom prefix', () => {
      const attributes = {
        'custom.prefix.custom_key': 'custom-value',
        'custom.prefix.session_id': 'session-123', // Should be excluded
      };

      const result = extractCustomMetadata(attributes, 'custom.prefix.');

      expect(result.custom_key).toBe('custom-value');
      expect(result.session_id).toBeUndefined();
    });

    it('should strip prefix from keys', () => {
      const attributes = {
        'agentmark.metadata.my_custom_key': 'value',
      };

      const result = extractCustomMetadata(attributes);

      expect(result.my_custom_key).toBe('value');
      expect(result['agentmark.metadata.my_custom_key']).toBeUndefined();
    });
  });
});

