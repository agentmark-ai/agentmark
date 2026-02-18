import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'fs-extra';
import generateSchema from '../cli-src/commands/generate-schema';

describe('generate-schema', () => {
  const testDir = path.join(__dirname, '..', 'tmp-generate-schema-test');
  const configPath = path.join(testDir, 'agentmark.json');
  const schemaDir = path.join(testDir, '.agentmark');
  const schemaPath = path.join(schemaDir, 'prompt.schema.json');
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('throws when agentmark.json does not exist', async () => {
    await expect(generateSchema()).rejects.toThrow(
      'Agentmark project not found. Please initialize first using agentmark init.'
    );
  });

  it('writes schema to .agentmark/prompt.schema.json by default', async () => {
    fs.writeJSONSync(configPath, { builtInModels: ['openai/gpt-4o'] });

    await generateSchema();

    expect(fs.existsSync(schemaPath)).toBe(true);
  });

  it('generates valid JSON Schema structure', async () => {
    fs.writeJSONSync(configPath, { builtInModels: ['openai/gpt-4o', 'anthropic/claude-3-haiku'] });

    await generateSchema();

    const schema = fs.readJSONSync(schemaPath);

    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
    expect(schema.properties.text_config).toBeDefined();
    expect(schema.properties.object_config).toBeDefined();
    expect(schema.properties.image_config).toBeDefined();
    expect(schema.properties.speech_config).toBeDefined();
  });

  it('constrains each config section to models of the matching type', async () => {
    // gpt-4o and claude-3-haiku are chat models; dall-e-3 is image_generation
    const models = ['openai/gpt-4o', 'anthropic/claude-3-haiku', 'openai/dall-e-3'];
    fs.writeJSONSync(configPath, { builtInModels: models });

    await generateSchema();

    const schema = fs.readJSONSync(schemaPath);

    // text and object configs get only language models
    expect(schema.properties.text_config.properties.model_name.enum).toEqual([
      'openai/gpt-4o',
      'anthropic/claude-3-haiku',
    ]);
    expect(schema.properties.object_config.properties.model_name.enum).toEqual([
      'openai/gpt-4o',
      'anthropic/claude-3-haiku',
    ]);
    // image config gets only image models
    expect(schema.properties.image_config.properties.model_name.enum).toEqual(['openai/dall-e-3']);
    // speech config has no speech models in this set — falls back to plain string
    expect(schema.properties.speech_config.properties.model_name.enum).toBeUndefined();
    expect(schema.properties.speech_config.properties.model_name.type).toBe('string');
  });

  it('includes speech models only in speech_config', async () => {
    const models = ['openai/gpt-4o', 'openai/tts-1'];
    fs.writeJSONSync(configPath, { builtInModels: models });

    await generateSchema();

    const schema = fs.readJSONSync(schemaPath);

    expect(schema.properties.text_config.properties.model_name.enum).toEqual(['openai/gpt-4o']);
    expect(schema.properties.speech_config.properties.model_name.enum).toEqual(['openai/tts-1']);
    expect(schema.properties.image_config.properties.model_name.enum).toBeUndefined();
  });

  it('all three config types get independent enums when all model types are present', async () => {
    // gpt-4o: chat, dall-e-3: image_generation, tts-1: audio_speech
    const models = ['openai/gpt-4o', 'openai/dall-e-3', 'openai/tts-1'];
    fs.writeJSONSync(configPath, { builtInModels: models });

    await generateSchema();

    const schema = fs.readJSONSync(schemaPath);

    expect(schema.properties.text_config.properties.model_name.enum).toEqual(['openai/gpt-4o']);
    expect(schema.properties.object_config.properties.model_name.enum).toEqual(['openai/gpt-4o']);
    expect(schema.properties.image_config.properties.model_name.enum).toEqual(['openai/dall-e-3']);
    expect(schema.properties.speech_config.properties.model_name.enum).toEqual(['openai/tts-1']);
  });

  it('unknown models appear in all sections alongside correctly bucketed known models', async () => {
    // gpt-4o: chat, dall-e-3: image, custom/private: not in registry
    const models = ['openai/gpt-4o', 'openai/dall-e-3', 'custom/my-private-model'];
    fs.writeJSONSync(configPath, { builtInModels: models });

    await generateSchema();

    const schema = fs.readJSONSync(schemaPath);

    // known models go to their bucket; unknown appended to all
    expect(schema.properties.text_config.properties.model_name.enum).toEqual([
      'openai/gpt-4o',
      'custom/my-private-model',
    ]);
    expect(schema.properties.object_config.properties.model_name.enum).toEqual([
      'openai/gpt-4o',
      'custom/my-private-model',
    ]);
    expect(schema.properties.image_config.properties.model_name.enum).toEqual([
      'openai/dall-e-3',
      'custom/my-private-model',
    ]);
    expect(schema.properties.speech_config.properties.model_name.enum).toEqual([
      'custom/my-private-model',
    ]);
  });

  it('falls back unknown models into all sections', async () => {
    const models = ['custom/my-private-model'];
    fs.writeJSONSync(configPath, { builtInModels: models });

    await generateSchema();

    const schema = fs.readJSONSync(schemaPath);

    // Not in registry → appears in all sections as safe fallback
    expect(schema.properties.text_config.properties.model_name.enum).toEqual(models);
    expect(schema.properties.object_config.properties.model_name.enum).toEqual(models);
    expect(schema.properties.image_config.properties.model_name.enum).toEqual(models);
    expect(schema.properties.speech_config.properties.model_name.enum).toEqual(models);
  });

  it('treats models with unhandled registry modes (e.g. embedding) as unknown', async () => {
    // text-embedding-3-large has mode: "embedding" — not in the switch, hits default → unknown
    const models = ['openai/gpt-4o', 'openai/text-embedding-3-large'];
    fs.writeJSONSync(configPath, { builtInModels: models });

    await generateSchema();

    const schema = fs.readJSONSync(schemaPath);

    // embedding model falls to unknown → appears in all sections
    expect(schema.properties.text_config.properties.model_name.enum).toEqual(models);
    expect(schema.properties.object_config.properties.model_name.enum).toEqual(models);
    expect(schema.properties.image_config.properties.model_name.enum).toEqual([
      'openai/text-embedding-3-large',
    ]);
    expect(schema.properties.speech_config.properties.model_name.enum).toEqual([
      'openai/text-embedding-3-large',
    ]);
  });

  it('uses plain string type when builtInModels is empty', async () => {
    fs.writeJSONSync(configPath, { builtInModels: [] });

    await generateSchema();

    const schema = fs.readJSONSync(schemaPath);

    // No enum constraint when models list is empty
    expect(schema.properties.text_config.properties.model_name.enum).toBeUndefined();
    expect(schema.properties.text_config.properties.model_name.type).toBe('string');
  });

  it('uses plain string type when builtInModels is absent', async () => {
    fs.writeJSONSync(configPath, { version: '1.0.0' });

    await generateSchema();

    const schema = fs.readJSONSync(schemaPath);

    expect(schema.properties.text_config.properties.model_name.enum).toBeUndefined();
    expect(schema.properties.text_config.properties.model_name.type).toBe('string');
  });

  it('writes to custom output directory when --out is specified', async () => {
    fs.writeJSONSync(configPath, { builtInModels: ['openai/gpt-4o'] });

    const customOut = path.join(testDir, 'custom-out');
    await generateSchema({ outDir: 'custom-out' });

    const customSchemaPath = path.join(customOut, 'prompt.schema.json');
    expect(fs.existsSync(customSchemaPath)).toBe(true);
  });

  it('schema is valid JSON and parseable', async () => {
    fs.writeJSONSync(configPath, { builtInModels: ['openai/gpt-4o'] });

    await generateSchema();

    const raw = fs.readFileSync(schemaPath, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('text_config schema has required model_name', async () => {
    fs.writeJSONSync(configPath, { builtInModels: ['openai/gpt-4o'] });

    await generateSchema();

    const schema = fs.readJSONSync(schemaPath);
    expect(schema.properties.text_config.required).toContain('model_name');
    expect(schema.properties.object_config.required).toContain('model_name');
    expect(schema.properties.image_config.required).toContain('model_name');
    expect(schema.properties.speech_config.required).toContain('model_name');
  });
});
