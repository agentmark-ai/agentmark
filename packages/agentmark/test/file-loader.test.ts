import { FileLoader } from '../src/file-loader';
import { ModelPluginRegistry } from '../src/model-plugin-registry';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createTemplateRunner } from '../src/runtime';

interface TestTypes {
  "test/math.prompt.mdx": {
    input: { userMessage: string };
    output: { answer: string };
  };
}

describe('FileLoader', () => {
  const loader = new FileLoader<TestTypes>('test/fixtures', createTemplateRunner);

  beforeAll(() => {
    ModelPluginRegistry.register({
      provider: 'test',
      setApiKey: () => {},
      serialize: () => '',
      generateObject: async () => ({
        object: { answer: 'test answer' },
        version: 'v3.0',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        },
        finishReason: 'stop',
      } as any),
      deserialize: async () => ({ answer: 'test answer' })
    } as any, ['test-model']);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and runs a prompt', async () => {
    const prompt = await loader.load('test/math.prompt.mdx');

    const result = await prompt.generateObject({ userMessage: 'test question' });
    expect(result.object.answer).toBe('test answer');
  });

  it('handles missing files', async () => {
    await expect(loader.load('nonexistent.prompt.mdx' as any))
      .rejects.toThrow(/ENOENT: no such file or directory/);
  });

  it('preserves type safety on input', async () => {
    const prompt = await loader.load('test/math.prompt.mdx');
    // @ts-expect-error - wrong input type
    await expect(prompt.generateObject({ wrongProp: 'test' }))
      .rejects.toThrow();
  });

  it('preserves type safety on output', async () => {
    ModelPluginRegistry.register({
      provider: 'test',
      setApiKey: () => {},
      serialize: () => '',
      generateObject: async () => ({
        result: { wrongResponse: 'test answer' },
        version: 'v2.0',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        },
        finishReason: 'stop'
      } as any),
      deserialize: async () => ({ answer: 'test answer' })
    } as any, ['test-model']);
    const prompt = await loader.load('test/math.prompt.mdx');
    await expect(prompt.generateObject({ userMessage: 'test question' }))
      .rejects.toThrow();
  });
}); 