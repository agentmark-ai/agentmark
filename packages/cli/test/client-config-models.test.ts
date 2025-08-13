import { describe, it, expect } from 'vitest';
import { getClientConfigContent } from '../src/utils/examples/templates/user-client-config';

describe('client config model registry', () => {
  it('registers image (dall-e-3) and speech models for openai', () => {
    const content = getClientConfigContent({ defaultRootDir: './agentmark', provider: 'openai', languageModels: ['gpt-4o'] });
    expect(content).toContain("registerModels([\"dall-e-3\"], (name: string) => openai.image(name))");
    expect(content).toContain("registerModels([\"tts-1-hd\"], (name: string) => openai.speech(name))");
  });

  it('does not add image/speech extras for non-openai providers', () => {
    const content = getClientConfigContent({ defaultRootDir: './agentmark', provider: 'anthropic', languageModels: ['claude-3'] });
    expect(content).not.toContain('openai.image');
    expect(content).not.toContain('openai.speech');
  });
});
