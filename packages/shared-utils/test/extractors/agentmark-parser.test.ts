import { describe, it, expect } from 'vitest';
import { parseAgentMarkAttributes } from '../../src/normalizer';

describe('AgentMark Parser', () => {
  describe('parseAgentMarkAttributes', () => {
    it('should extract session context fields', () => {
      const attributes = {
        'agentmark.session_id': 'session-123',
        'agentmark.session_name': 'test-session',
        'agentmark.user_id': 'user-456',
        'agentmark.trace_name': 'test-trace',
      };

      const result = parseAgentMarkAttributes(attributes);

      expect(result.sessionId).toBe('session-123');
      expect(result.sessionName).toBe('test-session');
      expect(result.userId).toBe('user-456');
      expect(result.traceName).toBe('test-trace');
    });

    it('should extract dataset/evaluation context fields', () => {
      const attributes = {
        'agentmark.dataset_run_id': 'run-123',
        'agentmark.dataset_run_name': 'test-run',
        'agentmark.dataset_item_name': 'item-1',
        'agentmark.dataset_expected_output': 'expected output',
        'agentmark.dataset_path': 'path/to/dataset.json',
      };

      const result = parseAgentMarkAttributes(attributes);

      expect(result.datasetRunId).toBe('run-123');
      expect(result.datasetRunName).toBe('test-run');
      expect(result.datasetItemName).toBe('item-1');
      expect(result.datasetExpectedOutput).toBe('expected output');
      expect(result.datasetPath).toBe('path/to/dataset.json');
    });

    it('should extract all fields together', () => {
      const attributes = {
        'agentmark.session_id': 'session-123',
        'agentmark.session_name': 'test-session',
        'agentmark.user_id': 'user-456',
        'agentmark.trace_name': 'test-trace',
        'agentmark.dataset_run_id': 'run-789',
        'agentmark.dataset_run_name': 'test-run',
        'agentmark.dataset_item_name': 'item-1',
        'agentmark.dataset_expected_output': 'expected-output',
        'agentmark.dataset_path': 'datasets/test.json',
      };

      const result = parseAgentMarkAttributes(attributes);

      expect(result.sessionId).toBe('session-123');
      expect(result.sessionName).toBe('test-session');
      expect(result.userId).toBe('user-456');
      expect(result.traceName).toBe('test-trace');
      expect(result.datasetRunId).toBe('run-789');
      expect(result.datasetRunName).toBe('test-run');
      expect(result.datasetItemName).toBe('item-1');
      expect(result.datasetExpectedOutput).toBe('expected-output');
      expect(result.datasetPath).toBe('datasets/test.json');
    });

    it('should handle custom prefix', () => {
      const attributes = {
        'custom.prefix.session_id': 'session-123',
        'custom.prefix.user_id': 'user-456',
      };

      const result = parseAgentMarkAttributes(attributes, 'custom.prefix.');

      expect(result.sessionId).toBe('session-123');
      expect(result.userId).toBe('user-456');
    });

    it('should convert non-string values to strings', () => {
      const attributes = {
        'agentmark.session_id': 123,
        'agentmark.user_id': true,
      };

      const result = parseAgentMarkAttributes(attributes);

      expect(result.sessionId).toBe('123');
      expect(result.userId).toBe('true');
    });

    it('should handle missing fields gracefully', () => {
      const attributes = {};

      const result = parseAgentMarkAttributes(attributes);

      expect(result.sessionId).toBeUndefined();
      expect(result.userId).toBeUndefined();
      expect(result.datasetRunId).toBeUndefined();
    });

    it('should only extract fields with correct prefix', () => {
      const attributes = {
        'agentmark.session_id': 'session-123',
        'agentmark.metadata.session_id': 'metadata-session',
        'other.prefix.session_id': 'other-session',
        'session_id': 'no-prefix',
      };

      const result = parseAgentMarkAttributes(attributes);

      expect(result.sessionId).toBe('session-123');
    });

    it('should extract trace_name but not trace_id', () => {
      const attributes = {
        'agentmark.session_id': 'session-123',
        'agentmark.trace_id': 'trace-123',
        'agentmark.trace_name': 'trace-name',
      };

      const result = parseAgentMarkAttributes(attributes);

      expect(result.sessionId).toBe('session-123');
      expect(result.traceId).toBeUndefined();
      expect(result.traceName).toBe('trace-name');
    });

    it('should not interfere with agentmark.metadata.* attributes', () => {
      const attributes = {
        'agentmark.session_id': 'direct-session',
        'agentmark.user_id': 'direct-user',
        'agentmark.metadata.session_id': 'metadata-session',
        'agentmark.metadata.user_id': 'metadata-user',
      };

      const result = parseAgentMarkAttributes(attributes);

      // Should only extract agentmark.* (not agentmark.metadata.*)
      expect(result.sessionId).toBe('direct-session');
      expect(result.userId).toBe('direct-user');
    });

    it('should handle empty string values', () => {
      const attributes = {
        'agentmark.session_id': '',
        'agentmark.user_id': 'user-123',
      };

      const result = parseAgentMarkAttributes(attributes);

      // Empty strings are falsy, so should not be set
      expect(result.sessionId).toBeUndefined();
      expect(result.userId).toBe('user-123');
    });
  });
});

