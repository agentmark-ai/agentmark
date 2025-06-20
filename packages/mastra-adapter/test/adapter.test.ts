import { describe, it, expect, beforeEach } from 'vitest';
import { MastraAdapter, MastraModelRegistry, MastraToolRegistry } from '../src/adapter';
import type { TextConfig, ObjectConfig } from '@agentmark/agentmark-core';

describe('MastraAdapter', () => {
  let modelRegistry: MastraModelRegistry;
  let agentRegistry: Record<string, any>;
  let toolRegistry: MastraToolRegistry<any, any>;
  let adapter: MastraAdapter<any, any>;

  beforeEach(() => {
    modelRegistry = new MastraModelRegistry();
    agentRegistry = {};
    toolRegistry = new MastraToolRegistry();
    adapter = new MastraAdapter(modelRegistry, agentRegistry, toolRegistry);
  });

  describe('MastraModelRegistry', () => {
    it('should register models by exact name', () => {
      const creator = (name: string) => ({ name, type: 'test' });
      modelRegistry.registerModels('gpt-4', creator);
      
      const modelFunction = modelRegistry.getModelFunction('gpt-4');
      expect(modelFunction).toBe(creator);
    });

    it('should register models by array', () => {
      const creator = (name: string) => ({ name, type: 'test' });
      modelRegistry.registerModels(['gpt-4', 'gpt-3.5'], creator);
      
      expect(modelRegistry.getModelFunction('gpt-4')).toBe(creator);
      expect(modelRegistry.getModelFunction('gpt-3.5')).toBe(creator);
    });

    it('should register models by regex pattern', () => {
      const creator = (name: string) => ({ name, type: 'test' });
      modelRegistry.registerModels(/^gpt-/, creator);
      
      expect(modelRegistry.getModelFunction('gpt-4')).toBe(creator);
      expect(modelRegistry.getModelFunction('gpt-3.5-turbo')).toBe(creator);
    });

    it('should use default creator when no match found', () => {
      const defaultCreator = (name: string) => ({ name, type: 'default' });
      modelRegistry.setDefaultCreator(defaultCreator);
      
      expect(modelRegistry.getModelFunction('unknown-model')).toBe(defaultCreator);
    });

    it('should throw error when no model found and no default', () => {
      expect(() => {
        modelRegistry.getModelFunction('unknown-model');
      }).toThrow('No model function found for: unknown-model');
    });
  });

  describe('MastraToolRegistry', () => {
    it('should register and retrieve tools', () => {
      const toolFn = (args: any) => Promise.resolve({ result: 'test' });
      toolRegistry.register('testTool', toolFn);
      
      expect(toolRegistry.has('testTool')).toBe(true);
      expect(toolRegistry.get('testTool')).toBe(toolFn);
    });

    it('should check tool existence', () => {
      expect(toolRegistry.has('nonexistent')).toBe(false);
    });
  });

  describe('MastraAdapter', () => {
    it('should have correct adapter name', () => {
      expect(adapter.__name).toBe('mastra');
    });

    // Note: More comprehensive tests would require mocking @mastra/core
    // which is not available in the test environment
  });
});