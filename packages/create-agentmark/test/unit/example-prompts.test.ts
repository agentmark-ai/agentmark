import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { createExamplePrompts } from '../../src/utils/examples/templates/example-prompts.js';

describe('createExamplePrompts', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmark-prompts-test-'));
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  describe('ai-sdk adapter (default)', () => {
    it('returns all three model IDs: language, image, and speech', () => {
      const models = createExamplePrompts('openai/gpt-4o', tempDir, 'ai-sdk');
      expect(models).toContain('openai/gpt-4o');
      expect(models).toContain('openai/dall-e-3');
      expect(models).toContain('openai/tts-1-hd');
      expect(models).toHaveLength(3);
    });

    it('writes animal-drawing, customer-support, party-planner, and story-teller prompt files', () => {
      createExamplePrompts('openai/gpt-4o', tempDir, 'ai-sdk');
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'animal-drawing.prompt.mdx'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'customer-support-agent.prompt.mdx'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'party-planner.prompt.mdx'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'story-teller.prompt.mdx'))).toBe(true);
    });
  });

  describe('claude-agent-sdk adapter', () => {
    it('returns only the language model — skips image and speech models', () => {
      const models = createExamplePrompts('anthropic/claude-sonnet-4-20250514', tempDir, 'claude-agent-sdk');
      expect(models).toContain('anthropic/claude-sonnet-4-20250514');
      expect(models).not.toContain('openai/dall-e-3');
      expect(models).not.toContain('openai/tts-1-hd');
      expect(models).toHaveLength(1);
    });

    it('skips animal-drawing and story-teller prompt files', () => {
      createExamplePrompts('anthropic/claude-sonnet-4-20250514', tempDir, 'claude-agent-sdk');
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'animal-drawing.prompt.mdx'))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'story-teller.prompt.mdx'))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'customer-support-agent.prompt.mdx'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'party-planner.prompt.mdx'))).toBe(true);
    });
  });

  describe('mastra adapter', () => {
    it('returns only the language model — skips image and speech models', () => {
      const models = createExamplePrompts('openai/gpt-4o', tempDir, 'mastra');
      expect(models).toContain('openai/gpt-4o');
      expect(models).not.toContain('openai/dall-e-3');
      expect(models).not.toContain('openai/tts-1-hd');
      expect(models).toHaveLength(1);
    });

    it('skips animal-drawing and story-teller prompt files', () => {
      createExamplePrompts('openai/gpt-4o', tempDir, 'mastra');
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'animal-drawing.prompt.mdx'))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'story-teller.prompt.mdx'))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'customer-support-agent.prompt.mdx'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'party-planner.prompt.mdx'))).toBe(true);
    });
  });

  describe('pydantic-ai adapter', () => {
    it('returns only the language model — skips image and speech models', () => {
      const models = createExamplePrompts('openai/gpt-4o', tempDir, 'pydantic-ai');
      expect(models).toContain('openai/gpt-4o');
      expect(models).not.toContain('openai/dall-e-3');
      expect(models).not.toContain('openai/tts-1-hd');
      expect(models).toHaveLength(1);
    });

    it('skips animal-drawing and story-teller prompt files', () => {
      createExamplePrompts('openai/gpt-4o', tempDir, 'pydantic-ai');
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'animal-drawing.prompt.mdx'))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'story-teller.prompt.mdx'))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'customer-support-agent.prompt.mdx'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'agentmark', 'party-planner.prompt.mdx'))).toBe(true);
    });
  });

  describe('deduplication', () => {
    it('returns unique model IDs even if the language model matches a template model', () => {
      // If somehow the user's chosen model matched a hardcoded template model, no duplicates
      const models = createExamplePrompts('openai/gpt-4o', tempDir, 'ai-sdk');
      const unique = [...new Set(models)];
      expect(models).toHaveLength(unique.length);
    });
  });
});
