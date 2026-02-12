import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'fs-extra';

let pullModels: any;
let mockPrompts: any;

// Mock prompts responses
vi.mock('prompts', () => ({
  default: vi.fn()
}));

// Mock providers module with controlled test data
vi.mock('../cli-src/utils/providers', () => ({
  Providers: {
    openai: {
      label: "OpenAI",
      languageModels: ["gpt-4o", "gpt-4o-mini", "gpt-4", "gpt-5", "gpt-4-turbo", "gpt-3.5-turbo"],
      imageModels: ["dall-e-3", "dall-e-2"],
      speechModels: ["tts-1", "tts-1-hd"],
    },
    anthropic: {
      label: "Anthropic",
      languageModels: ["claude-3-haiku", "claude-3-sonnet", "claude-3-opus"],
      imageModels: [],
      speechModels: [],
    },
    ollama: {
      label: "Ollama",
      languageModels: ["llama3.1", "llama3.2", "mistral"],
      imageModels: [],
      speechModels: [],
    },
    xai: {
      label: "xAI Grok",
      languageModels: ["grok-3", "grok-3-mini"],
      imageModels: [],
      speechModels: [],
    },
    google: {
      label: "Google",
      languageModels: ["gemini-2.0-flash", "gemini-1.5-pro"],
      imageModels: [],
      speechModels: [],
    },
    groq: {
      label: "Groq",
      languageModels: ["llama-3.3-70b-versatile"],
      imageModels: [],
      speechModels: [],
    },
  },
}));

describe('pull-models', () => {
  const testDir = path.join(__dirname, '..', 'tmp-pull-models-test');
  const configPath = path.join(testDir, 'agentmark.json');
  let originalCwd: string;

  beforeEach(async () => {
    // Save original cwd and change to test directory
    originalCwd = process.cwd();

    // Clean and create test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    // Change to test directory
    process.chdir(testDir);

    // Reset modules to get fresh import
    vi.resetModules();

    // Get fresh mock reference
    mockPrompts = (await import('prompts')).default;

    // Import command fresh
    pullModels = (await import('../cli-src/commands/pull-models')).default;
  });

  afterEach(() => {
    // Restore original cwd
    process.chdir(originalCwd);

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    vi.clearAllMocks();
  });

  it('throws error when agentmark.json does not exist', async () => {
    await expect(pullModels()).rejects.toThrow(
      'Agentmark project not found. Please initialize first using agentmark init.'
    );
  });

  it('prompts for provider selection', async () => {
    // Create minimal config
    fs.writeJSONSync(configPath, { builtInModels: [] });

    // Mock provider and model selection (complete flow to avoid errors)
    mockPrompts
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ models: [] });

    await pullModels();

    // Verify prompts was called for provider selection
    expect(mockPrompts).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'provider',
        type: 'select',
        message: 'Select a provider',
        choices: expect.arrayContaining([
          expect.objectContaining({ title: expect.any(String), value: expect.any(String) })
        ])
      })
    );
  });

  it('filters out already-installed models', async () => {
    // Create config with existing models
    fs.writeJSONSync(configPath, {
      builtInModels: ['gpt-4o', 'gpt-4o-mini']
    });

    // Mock provider selection (OpenAI) and model selection
    mockPrompts
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ models: [] });

    await pullModels();

    // Check that the second prompt (models) filters existing models
    const modelPromptCall = mockPrompts.mock.calls[1][0];
    expect(modelPromptCall.choices).toBeDefined();

    // Verify already-installed models are not in choices
    const choiceValues = modelPromptCall.choices.map((c: any) => c.value);
    expect(choiceValues).not.toContain('gpt-4o');
    expect(choiceValues).not.toContain('gpt-4o-mini');
  });

  it('displays message when all models already added', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create config with ALL openai models
    fs.writeJSONSync(configPath, {
      builtInModels: [
        'gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-5', 'gpt-4-turbo', 'gpt-3.5-turbo',
        'dall-e-3', 'dall-e-2',
        'tts-1', 'tts-1-hd'
      ]
    });

    // Mock provider selection (OpenAI)
    mockPrompts.mockResolvedValueOnce({ provider: 'openai' });

    await pullModels();

    // Verify message was displayed
    expect(consoleLogSpy).toHaveBeenCalledWith('All models already added.');

    consoleLogSpy.mockRestore();
  });

  it('successfully adds selected models to config', async () => {
    // Create minimal config
    fs.writeJSONSync(configPath, {
      builtInModels: []
    });

    // Mock provider and model selection
    mockPrompts
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ models: ['gpt-4o', 'dall-e-3'] });

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await pullModels();

    // Read updated config
    const updatedConfig = fs.readJSONSync(configPath);

    // Verify models were added
    expect(updatedConfig.builtInModels).toContain('gpt-4o');
    expect(updatedConfig.builtInModels).toContain('dall-e-3');
    expect(consoleLogSpy).toHaveBeenCalledWith('Models pulled successfully.');

    consoleLogSpy.mockRestore();
  });

  it('preserves existing models in config', async () => {
    // Create config with existing models
    fs.writeJSONSync(configPath, {
      builtInModels: ['gpt-4o'],
      otherField: 'preserved'
    });

    // Mock selections
    mockPrompts
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ models: ['gpt-4-turbo'] });

    await pullModels();

    // Read updated config
    const updatedConfig = fs.readJSONSync(configPath);

    // Verify both old and new models exist
    expect(updatedConfig.builtInModels).toContain('gpt-4o');
    expect(updatedConfig.builtInModels).toContain('gpt-4-turbo');

    // Verify other fields preserved
    expect(updatedConfig.otherField).toBe('preserved');
  });

  it('supports language, image, and speech models', async () => {
    fs.writeJSONSync(configPath, { builtInModels: [] });

    // Mock selections
    mockPrompts
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ models: [] });

    await pullModels();

    // Check model prompt includes all model types
    const modelPromptCall = mockPrompts.mock.calls[1][0];
    const choices = modelPromptCall.choices;

    // Should have language models
    expect(choices.some((c: any) => c.title.includes('Language Model'))).toBe(true);

    // Should have image models
    expect(choices.some((c: any) => c.title.includes('Image Generation'))).toBe(true);

    // Should have speech models
    expect(choices.some((c: any) => c.title.includes('Text to Speech'))).toBe(true);
  });

  it('handles multiple model selections', async () => {
    fs.writeJSONSync(configPath, { builtInModels: [] });

    // Mock selecting multiple models
    mockPrompts
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'dall-e-3']
      });

    await pullModels();

    const updatedConfig = fs.readJSONSync(configPath);

    // Verify all selected models were added
    expect(updatedConfig.builtInModels).toHaveLength(4);
    expect(updatedConfig.builtInModels).toContain('gpt-4o');
    expect(updatedConfig.builtInModels).toContain('gpt-4o-mini');
    expect(updatedConfig.builtInModels).toContain('gpt-4-turbo');
    expect(updatedConfig.builtInModels).toContain('dall-e-3');
  });

  it('writes valid JSON to agentmark.json', async () => {
    fs.writeJSONSync(configPath, { builtInModels: [] });

    mockPrompts
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ models: ['gpt-4o'] });

    await pullModels();

    // Verify file is valid JSON by reading it
    const content = fs.readFileSync(configPath, 'utf8');
    expect(() => JSON.parse(content)).not.toThrow();

    // Verify proper formatting (2 space indent)
    const config = JSON.parse(content);
    const formatted = JSON.stringify(config, null, 2);
    expect(content).toBe(formatted + '\n');
  });

  it('deduplicates models when adding duplicates', async () => {
    // Config already has gpt-4o
    fs.writeJSONSync(configPath, {
      builtInModels: ['gpt-4o']
    });

    // Try to add gpt-4o again along with new model
    mockPrompts
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ models: ['gpt-4o', 'gpt-4-turbo'] });

    await pullModels();

    const updatedConfig = fs.readJSONSync(configPath);

    // Should only have one instance of gpt-4o
    const gpt4oCount = updatedConfig.builtInModels.filter((m: string) => m === 'gpt-4o').length;
    expect(gpt4oCount).toBe(1);

    // Should have both models total
    expect(updatedConfig.builtInModels).toContain('gpt-4o');
    expect(updatedConfig.builtInModels).toContain('gpt-4-turbo');
  });

  it('supports different providers (anthropic)', async () => {
    fs.writeJSONSync(configPath, { builtInModels: [] });

    mockPrompts
      .mockResolvedValueOnce({ provider: 'anthropic' })
      .mockResolvedValueOnce({ models: [] });

    await pullModels();

    // Check that anthropic models are available
    const modelPromptCall = mockPrompts.mock.calls[1][0];
    const choiceValues = modelPromptCall.choices.map((c: any) => c.value);

    // Should include Claude models
    expect(choiceValues.some((v: string) => v.includes('claude'))).toBe(true);
  });

  it('initializes builtInModels array if missing', async () => {
    // Create config without builtInModels field
    fs.writeJSONSync(configPath, {
      version: '1.0.0'
    });

    mockPrompts
      .mockResolvedValueOnce({ provider: 'openai' })
      .mockResolvedValueOnce({ models: ['gpt-4o'] });

    await pullModels();

    const updatedConfig = fs.readJSONSync(configPath);

    // Should have created builtInModels array
    expect(Array.isArray(updatedConfig.builtInModels)).toBe(true);
    expect(updatedConfig.builtInModels).toContain('gpt-4o');
  });
});
