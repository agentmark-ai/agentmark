import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'fs-extra';
import generateTypes from '../src/commands/generate-types';
import { findPromptFiles, generateTypeDefinitions, fetchPromptsFrontmatter } from '@agentmark/shared-utils';

describe('generate-types', () => {
  const testDir = path.join(__dirname, '..', 'tmp-generate-types-test');
  let originalCwd: string;

  beforeEach(async () => {
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

  describe('file system mode', () => {
    it('generates types from local .prompt.mdx files', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });

      // Create a simple v1.0 text prompt
      fs.writeFileSync(
        path.join(promptsDir, 'test.prompt.mdx'),
        `---
text_config:
  model_name: gpt-4o
input_schema:
  type: object
  properties:
    message:
      type: string
  required:
    - message
---

Test prompt
`
      );

      const prompts = await fetchPromptsFrontmatter({ rootDir: promptsDir });
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toMatchObject({
        path: 'test.prompt.mdx',
        version: '1.0',
        text_config: { model_name: 'gpt-4o' }
      });
    });

    it('handles text_config prompts (v1.0)', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });

      fs.writeFileSync(
        path.join(promptsDir, 'text.prompt.mdx'),
        `---
text_config:
  model_name: gpt-4o
input_schema:
  type: object
  properties:
    name:
      type: string
---
Hello {{name}}
`
      );

      const prompts = await fetchPromptsFrontmatter({ rootDir: promptsDir });
      const types = await generateTypeDefinitions(prompts);

      expect(types).toContain('interface TextIn');
      expect(types).toContain('type TextOut = string');
      expect(types).toContain("kind: 'text'");
      expect(types).toContain('export default interface AgentmarkTypes');
    });

    it('handles object_config prompts (v1.0)', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });

      fs.writeFileSync(
        path.join(promptsDir, 'object.prompt.mdx'),
        `---
object_config:
  model_name: gpt-4o
  schema:
    type: object
    properties:
      result:
        type: string
input_schema:
  type: object
  properties:
    query:
      type: string
---
Query: {{query}}
`
      );

      const prompts = await fetchPromptsFrontmatter({ rootDir: promptsDir });
      const types = await generateTypeDefinitions(prompts);

      expect(types).toContain('interface ObjectIn');
      expect(types).toContain('interface ObjectOut');
      expect(types).toContain("kind: 'object'");
    });

    it('handles image_config prompts (v1.0)', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });

      fs.writeFileSync(
        path.join(promptsDir, 'image.prompt.mdx'),
        `---
image_config:
  model_name: dall-e-3
input_schema:
  type: object
  properties:
    prompt:
      type: string
---
{{prompt}}
`
      );

      const prompts = await fetchPromptsFrontmatter({ rootDir: promptsDir });
      const types = await generateTypeDefinitions(prompts);

      expect(types).toContain('interface ImageIn');
      expect(types).toContain('type ImageOut = string');
      expect(types).toContain("kind: 'image'");
    });

    it('handles legacy metadata format (v0)', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });

      fs.writeFileSync(
        path.join(promptsDir, 'legacy.prompt.mdx'),
        `---
metadata:
  model:
    settings:
      schema:
        type: object
        properties:
          answer:
            type: string
input_schema:
  type: object
  properties:
    question:
      type: string
---
{{question}}
`
      );

      const prompts = await fetchPromptsFrontmatter({ rootDir: promptsDir });
      const types = await generateTypeDefinitions(prompts);

      expect(types).toContain('interface LegacyIn');
      expect(types).toContain('interface LegacyOut');
      expect(types).not.toContain("kind:"); // v0 doesn't have kind
    });

    it('generates tool types when tools are defined', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });

      fs.writeFileSync(
        path.join(promptsDir, 'with-tools.prompt.mdx'),
        `---
text_config:
  model_name: gpt-4o
  tools:
    search_web:
      parameters:
        type: object
        properties:
          query:
            type: string
        required:
          - query
---
Search tool test
`
      );

      const prompts = await fetchPromptsFrontmatter({ rootDir: promptsDir });
      const types = await generateTypeDefinitions(prompts);

      expect(types).toContain('SearchWebArgs');
      expect(types).toContain('export interface Tools');
      expect(types).toContain('search_web:');
      expect(types).toContain('tools?: Array<keyof Tools>');
    });

    it('handles nested directory structures', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(path.join(promptsDir, 'nested', 'deep'), { recursive: true });

      fs.writeFileSync(
        path.join(promptsDir, 'nested', 'deep', 'nested.prompt.mdx'),
        `---
text_config:
  model_name: gpt-4o
---
Nested prompt
`
      );

      const files = await findPromptFiles(promptsDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toContain('nested');
      expect(files[0]).toContain('deep');
    });

    it('errors when root directory does not exist', async () => {
      await expect(
        fetchPromptsFrontmatter({ rootDir: '/nonexistent/path' })
      ).rejects.toThrow('Directory not found at: /nonexistent/path');
    });

    it('handles prompts with no input_schema', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });

      fs.writeFileSync(
        path.join(promptsDir, 'no-input.prompt.mdx'),
        `---
text_config:
  model_name: gpt-4o
---
No input schema
`
      );

      const prompts = await fetchPromptsFrontmatter({ rootDir: promptsDir });
      const types = await generateTypeDefinitions(prompts);

      expect(types).toContain('interface NoInputIn { [key: string]: any }');
    });

    it('handles prompts with no output schema (text)', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });

      fs.writeFileSync(
        path.join(promptsDir, 'no-output.prompt.mdx'),
        `---
text_config:
  model_name: gpt-4o
---
No output schema
`
      );

      const prompts = await fetchPromptsFrontmatter({ rootDir: promptsDir });
      const types = await generateTypeDefinitions(prompts);

      expect(types).toContain('type NoOutputOut = string');
    });

    it('generates correct interface names from file paths', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });

      fs.writeFileSync(
        path.join(promptsDir, 'my-test.prompt.mdx'),
        `---
text_config:
  model_name: gpt-4o
---
Test
`
      );

      const prompts = await fetchPromptsFrontmatter({ rootDir: promptsDir });
      const types = await generateTypeDefinitions(prompts);

      expect(types).toContain('interface MyTestIn');
      expect(types).toContain('type MyTestOut');
    });

    it('handles snake_case, camelCase, kebab-case names', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });

      fs.writeFileSync(
        path.join(promptsDir, 'snake_case_prompt.prompt.mdx'),
        `---
text_config:
  model_name: gpt-4o
---
Snake case
`
      );

      fs.writeFileSync(
        path.join(promptsDir, 'camelCasePrompt.prompt.mdx'),
        `---
text_config:
  model_name: gpt-4o
---
Camel case
`
      );

      fs.writeFileSync(
        path.join(promptsDir, 'kebab-case-prompt.prompt.mdx'),
        `---
text_config:
  model_name: gpt-4o
---
Kebab case
`
      );

      const prompts = await fetchPromptsFrontmatter({ rootDir: promptsDir });
      const types = await generateTypeDefinitions(prompts);

      expect(types).toContain('SnakeCasePromptIn');
      expect(types).toContain('CamelCasePromptIn');
      expect(types).toContain('KebabCasePromptIn');
    });
  });

  describe('edge cases', () => {
    it('errors when neither --local nor --root-dir provided', async () => {
      await expect(
        fetchPromptsFrontmatter({})
      ).rejects.toThrow('Either --local or --root-dir must be specified');
    });

    it('handles empty prompt directories', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });

      const files = await findPromptFiles(promptsDir);
      expect(files).toHaveLength(0);
    });

    it('handles multiple prompts in same directory', async () => {
      const promptsDir = path.join(testDir, 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });

      fs.writeFileSync(
        path.join(promptsDir, 'first.prompt.mdx'),
        `---
text_config:
  model_name: gpt-4o
---
First
`
      );

      fs.writeFileSync(
        path.join(promptsDir, 'second.prompt.mdx'),
        `---
text_config:
  model_name: gpt-4o
---
Second
`
      );

      const prompts = await fetchPromptsFrontmatter({ rootDir: promptsDir });
      expect(prompts).toHaveLength(2);

      const types = await generateTypeDefinitions(prompts);
      expect(types).toContain('interface FirstIn');
      expect(types).toContain('interface SecondIn');
    });
  });
});
