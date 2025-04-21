import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { FileLoader, createAgentMark } from '@puzzlet/agentmark';
import { AIAdapter, AIModelRegistry } from '../src';

type TestPromptTypes2 = {
  'math.prompt.mdx': {
    kind: 'object';
    input: { userMessage: string };
    output: { answer: string };
  };
  'image.prompt.mdx': {
    kind: 'image';
    input: { userMessage: string };
    output: { answer: string };
  };
}

type TestPromptTypes = {
  'math.prompt.mdx': {
    input: { userMessage: string };
    output: { answer: string };
  };
  'image.prompt.mdx': {
    input: { userMessage: string };
    output: never;
  };
  'text.prompt.mdx': {
    input: { userMessage: string };
    output: never;
  };
}

const modelRegistry = new AIModelRegistry();

describe('AgentMark Integration', () => {
  describe('AIAdapter Integration', () => {
    it('should adapt object prompts for Vercel AI SDK', async () => {
      const fixturesDir = path.resolve(__dirname, './fixtures');
      const fileLoader = new FileLoader(fixturesDir);
      const mockModelFn = vi.fn().mockImplementation((modelName) => ({
        name: modelName,
        generate: vi.fn()
      }));
      const modelRegistry = new AIModelRegistry();
      modelRegistry.registerModels('test-model', mockModelFn);

      const agentMark = createAgentMark({
        loader: fileLoader,
        adapter: new AIAdapter<TestPromptTypes>(modelRegistry),
      });

      const mathPrompt = await agentMark.loadObjectPrompt('math.prompt.mdx');
      const result = await mathPrompt.format({
        userMessage: 'What is the sum of 5 and 3?'
      });

      expect(mockModelFn).toHaveBeenCalledWith('test-model', expect.any(Object));

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[0].content).toBe('You are a helpful math tutor.');
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[1].content).toBe('What is the sum of 5 and 3?');
      expect(result.model).toBeDefined();
      expect(result.schema).toBeDefined();
    });

    it('should adapt text prompts for Vercel AI SDK', async () => {
      const fixturesDir = path.resolve(__dirname, './fixtures');
      const fileLoader = new FileLoader(fixturesDir);

      const mockModelFn = vi.fn().mockImplementation((modelName) => ({
        name: modelName,
        generate: vi.fn()
      }));

      const modelRegistry = new AIModelRegistry();
      modelRegistry.registerModels('test-model', mockModelFn);

      const agentMark = createAgentMark({
        loader: fileLoader,
        adapter: new AIAdapter<TestPromptTypes>(modelRegistry),
      });

      const mathPrompt = await agentMark.loadTextPrompt('text.prompt.mdx');
      const result = await mathPrompt.format({
        userMessage: 'What is the sum of 5 and 3?'
      });

      expect(mockModelFn).toHaveBeenCalledWith('test-model', expect.any(Object));

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(3);

      expect(result.model).toEqual({
        name: 'test-model',
        generate: expect.any(Function)
      });
    });

    it('should handle custom runtime config in Vercel adapter', async () => {
      const fixturesDir = path.resolve(__dirname, './fixtures');
      const fileLoader = new FileLoader(fixturesDir);

      const mockModelFn = vi.fn().mockImplementation((modelName, config) => {
        return {
          name: modelName,
          apiKey: config.apiKey,
          generate: vi.fn()
        };
      });

      const modelRegistry = new AIModelRegistry();
      modelRegistry.registerModels('test-model', mockModelFn);

      const agentMark = createAgentMark({
        loader: fileLoader,
        adapter: new AIAdapter<TestPromptTypes>(modelRegistry),
      });

      const mathPrompt = await agentMark.loadObjectPrompt('math.prompt.mdx');
      const runtimeConfig = {
        apiKey: 'test-api-key',
      };
      const result = await mathPrompt.format({
        userMessage: 'What is 2+2?',
      }, runtimeConfig);

      expect(mockModelFn).toHaveBeenCalledWith('test-model', expect.objectContaining(runtimeConfig));

      expect(result.messages[1].content).toBe('What is 2+2?');
    });

    it('should properly handle runtime configuration', async () => {
      const fixturesDir = path.resolve(__dirname, './fixtures');
      const fileLoader = new FileLoader(fixturesDir);

      const mockModelFn = vi.fn().mockImplementation((modelName, config) => ({
        name: modelName,
        ...config,
        generate: vi.fn()
      }));

      const modelRegistry = new AIModelRegistry();
      modelRegistry.registerModels('test-model', mockModelFn);

      const agentMark = createAgentMark({
        loader: fileLoader,
        adapter: new AIAdapter<TestPromptTypes>(modelRegistry),
      });

      const mathPrompt = await agentMark.loadObjectPrompt('math.prompt.mdx');

      const metadata = {
        test: 'test',
      }
      const runtimeConfig = {
        telemetry: { isEnabled: true, functionId: '1', metadata, },
        apiKey: 'test-api-key'
      };

      const telemetryConfig = {
        isEnabled: true,
        functionId: '1',
        metadata: {
          ...metadata,
          prompt: 'math',
          props: JSON.stringify({ userMessage: 'What is 2+2?' })
        }
      }

      const result = await mathPrompt.format({
        userMessage: 'What is 2+2?',
      }, runtimeConfig);

      expect(result.experimental_telemetry).toEqual(telemetryConfig);

      expect(mockModelFn).toHaveBeenCalledWith('test-model', expect.objectContaining(runtimeConfig));
    });
  });
});