/**
 * Integration tests for pull-models using the REAL Providers module.
 *
 * pull-models.test.ts mocks Providers for isolation. This file tests with the
 * actual model registry data to verify the provider/model format flows through
 * from buildProviders() all the way to agentmark.json.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'fs-extra';

// Only mock prompts — NOT Providers. Real model registry data flows through.
vi.mock('prompts', () => ({
  default: vi.fn(),
}));

describe('pull-models with real Providers (integration)', () => {
  const testDir = path.join(__dirname, '..', 'tmp-pull-models-real-test');
  const configPath = path.join(testDir, 'agentmark.json');
  let originalCwd: string;
  let pullModels: any;
  let mockPrompts: any;

  beforeEach(async () => {
    originalCwd = process.cwd();

    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    vi.resetModules();

    mockPrompts = (await import('prompts')).default;
    pullModels = (await import('../cli-src/commands/pull-models')).default;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it('presents model choices with provider/model prefix (e.g. openai/gpt-4o)', async () => {
    fs.writeJSONSync(configPath, { builtInModels: [] });

    mockPrompts
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ models: [] });

    await pullModels();

    const modelPromptCall = mockPrompts.mock.calls[1][0];
    const choiceValues: string[] = modelPromptCall.choices.map((c: any) => c.value);

    // All choices must have the openai/ prefix — real buildProviders() output
    expect(choiceValues.length).toBeGreaterThan(0);
    expect(choiceValues.every((v) => v.startsWith('openai/'))).toBe(true);
    expect(choiceValues).toContain('openai/gpt-4o');
  });

  it('writes provider/model format to agentmark.json when a model is selected', async () => {
    fs.writeJSONSync(configPath, { builtInModels: [] });

    // Use the real Providers to pick the first language model
    const { Providers } = await import('../cli-src/utils/providers');
    const firstModel = Providers['openai']!.languageModels[0]!;

    mockPrompts
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ models: [firstModel] });

    await pullModels();

    const updatedConfig = fs.readJSONSync(configPath);

    expect(updatedConfig.builtInModels).toHaveLength(1);
    // The written value must be in provider/model format
    expect(updatedConfig.builtInModels[0]).toMatch(/^openai\//);
    expect(updatedConfig.builtInModels[0]).toBe(firstModel);
  });

  it('includes both language and image models in correct prefix format', async () => {
    fs.writeJSONSync(configPath, { builtInModels: [] });

    mockPrompts
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ models: [] });

    await pullModels();

    const modelPromptCall = mockPrompts.mock.calls[1][0];
    const choiceValues: string[] = modelPromptCall.choices.map((c: any) => c.value);

    // Language models: openai/gpt-* format
    const langModels = choiceValues.filter((v) =>
      modelPromptCall.choices.find((c: any) => c.value === v && c.title.includes('Language Model'))
    );
    expect(langModels.every((v) => v.startsWith('openai/'))).toBe(true);

    // Image models: openai/dall-e-* format
    const imageModels = choiceValues.filter((v) =>
      modelPromptCall.choices.find((c: any) => c.value === v && c.title.includes('Image Generation'))
    );
    expect(imageModels.length).toBeGreaterThan(0);
    expect(imageModels.every((v) => v.startsWith('openai/'))).toBe(true);
  });
});
