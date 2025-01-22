import { FileLoader } from '../src/file-loader';
import { ModelPluginRegistry } from '../src/model-plugin-registry';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

interface TestTypes {
  "test/math.prompt.mdx": {
    input: { userMessage: string };
    output: { answer: string };
  };
}

describe('FileLoader', () => {
  const loader = new FileLoader<TestTypes>('test/fixtures');

  beforeAll(() => {
    ModelPluginRegistry.register({
      provider: 'test',
      setApiKey: () => {},
      serialize: () => '',
      runInference: async () => ({
        result: {
          object: { answer: 'test answer' }
        },
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        },
        finishReason: 'stop'
      }),
      deserialize: async () => ({ answer: 'test answer' })
    }, ['test-model']);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and runs a prompt', async () => {
    const prompt = await loader.load('test/math.prompt.mdx');

    const result = await prompt.run({ userMessage: 'test question' });
    expect(result.result.object.answer).toBe('test answer');
  });

  it('handles missing files', async () => {
    await expect(loader.load('nonexistent.prompt.mdx' as any))
      .rejects.toThrow(/ENOENT: no such file or directory/);
  });

  it('preserves type safety on input', async () => {
    const prompt = await loader.load('test/math.prompt.mdx');
    // @ts-expect-error - wrong input type
    await expect(prompt.run({ wrongProp: 'test' }))
      .rejects.toThrow();
  });

  it('preserves type safety on output', async () => {
    ModelPluginRegistry.register({
      provider: 'test',
      setApiKey: () => {},
      serialize: () => '',
      runInference: async () => ({
        result: {
          object: { wrongResponse: 'test answer' }
        },
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        },
        finishReason: 'stop'
      }),
      deserialize: async () => ({ answer: 'test answer' })
    }, ['test-model']);
    const prompt = await loader.load('test/math.prompt.mdx');
    await expect(prompt.run({ userMessage: 'test question' }))
      .rejects.toThrow();
  });
}); 