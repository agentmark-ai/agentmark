import { describe, it, expect } from 'vitest';
import { parseMetadata } from '../../src/normalizer';

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
        'agentmark.metadata.trace_name': null,
      };

      const result = parseMetadata(attributes);

      expect(result.sessionId).toBe('123');
      expect(result.userId).toBe('true');
      expect(result.traceName).toBe('null');
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
        'agentmark.metadata.session_id': '',
        'agentmark.metadata.trace_name': 'test-trace',
      };

      const result = parseMetadata(attributes);

      expect(result.sessionId).toBe('');
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
});

