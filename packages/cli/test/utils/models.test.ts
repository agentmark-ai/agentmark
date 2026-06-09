import { describe, it, expect } from 'vitest';
import { classifyModels, getRegistryModelMap, type RegistryModel } from '../../cli-src/utils/models';

const REGISTRY: Record<string, RegistryModel> = {
  'gpt-4o': { provider: 'openai', mode: 'chat' },
  'dall-e-3': { provider: 'openai', mode: 'image_generation' },
  'tts-1': { provider: 'openai', mode: 'audio_speech' },
  'embed-1': { provider: 'x', mode: 'embedding' },
};

describe('classifyModels', () => {
  it('buckets prefixed ids by their registry mode', () => {
    expect(classifyModels(REGISTRY, ['openai/gpt-4o', 'openai/dall-e-3', 'openai/tts-1'])).toEqual({
      languageModels: ['openai/gpt-4o'],
      imageModels: ['openai/dall-e-3'],
      speechModels: ['openai/tts-1'],
      unknownModels: [],
    });
  });
  it('treats a model with no provider prefix as unknown', () => {
    expect(classifyModels(REGISTRY, ['gpt-4o']).unknownModels).toEqual(['gpt-4o']);
  });
  it('treats a model absent from the registry as unknown', () => {
    expect(classifyModels(REGISTRY, ['openai/does-not-exist']).unknownModels).toEqual(['openai/does-not-exist']);
  });
  it('treats an unrecognized mode as unknown', () => {
    expect(classifyModels(REGISTRY, ['x/embed-1']).unknownModels).toEqual(['x/embed-1']);
  });
});

describe('getRegistryModelMap', () => {
  it('loads the bundled catalog as a non-empty id→entry map', async () => {
    const map = await getRegistryModelMap();
    expect(Object.keys(map).length).toBeGreaterThan(0);
    const sample = Object.values(map)[0];
    expect(typeof sample.provider).toBe('string');
    expect(typeof sample.mode).toBe('string');
  });
});
