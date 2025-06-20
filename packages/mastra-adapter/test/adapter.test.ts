import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MastraAdapter, MastraAgentRegistry, MastraToolRegistry } from '../src/adapter';
import type { TextConfig, ObjectConfig } from '@agentmark/agentmark-core';

describe('MastraAdapter', () => {
  let agentRegistry: MastraAgentRegistry;
  let toolRegistry: MastraToolRegistry<any, any>;
  let adapter: MastraAdapter<any, any>;

  beforeEach(() => {
    agentRegistry = new MastraAgentRegistry();
    toolRegistry = new MastraToolRegistry();
    adapter = new MastraAdapter(agentRegistry, toolRegistry);
  });

  describe('MastraAgentRegistry', () => {
    it('should register agents by exact name', () => {
      const creator = (name: string) => ({ name, type: 'test' });
      agentRegistry.registerAgents('gpt-4', creator);
      
      const retrieved = agentRegistry.getAgentFunction('gpt-4');
      expect(retrieved).toBe(creator);
    });

    it('should register agents by array', () => {
      const creator = (name: string) => ({ name, type: 'test' });
      agentRegistry.registerAgents(['gpt-4', 'gpt-3.5-turbo'], creator);
      
      expect(agentRegistry.getAgentFunction('gpt-4')).toBe(creator);
      expect(agentRegistry.getAgentFunction('gpt-3.5-turbo')).toBe(creator);
    });

    it('should register agents by regex pattern', () => {
      const creator = (name: string) => ({ name, type: 'test' });
      agentRegistry.registerAgents(/^gpt-/, creator);
      
      const retrieved = agentRegistry.getAgentFunction('gpt-4o');
      expect(retrieved).toBe(creator);
    });

    it('should use default creator when no match found', () => {
      const defaultCreator = (name: string) => ({ name, type: 'default' });
      agentRegistry.setDefaultCreator(defaultCreator);
      
      const retrieved = agentRegistry.getAgentFunction('unknown-agent');
      expect(retrieved).toBe(defaultCreator);
    });

    it('should throw error when no agent found and no default', () => {
      expect(() => {
        agentRegistry.getAgentFunction('unknown-agent');
      }).toThrow('No agent function found for: unknown-agent');
    });
  });

  describe('MastraToolRegistry', () => {
    it('should register and retrieve tools', () => {
      const toolFn = (args: { input: string }) => `processed: ${args.input}`;
      
      const registry = new MastraToolRegistry<{ testTool: { args: { input: string } } }>();
      const updatedRegistry = registry.register('testTool', toolFn);
      
      expect(updatedRegistry.has('testTool')).toBe(true);
      const retrieved = updatedRegistry.get('testTool');
      expect(retrieved({ input: 'test' })).toBe(toolFn({ input: 'test' }));
    });

    it('should check tool existence', () => {
      const registry = new MastraToolRegistry<{ existingTool: { args: any } }>();
      
      expect(registry.has('existingTool')).toBe(false);
      
      registry.register('existingTool', () => 'result');
      expect(registry.has('existingTool')).toBe(true);
    });
  });

  describe('MastraAdapter', () => {
    it('should have correct adapter name', () => {
      expect(adapter.__name).toBe('mastra');
    });

    it('should adapt text config correctly', () => {
      // Mock agent creator
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      agentRegistry.registerAgents('test-model', () => mockAgent);

      const textConfig: TextConfig = {
        name: 'test-prompt',
        messages: [{ role: 'user', content: 'Hello' }],
        text_config: {
          model_name: 'test-model',
          temperature: 0.7,
          max_tokens: 100,
        },
      };

      const result = adapter.adaptText(textConfig, {}, { props: {}, path: undefined, template: {} });

      expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }]);
      expect(result.temperature).toBe(0.7);
      expect(result.maxSteps).toBe(1); // 100 / 100
    });

    it('should adapt object config correctly', () => {
      // Mock agent creator
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      agentRegistry.registerAgents('test-model', () => mockAgent);

      const objectConfig: ObjectConfig = {
        name: 'test-prompt',
        messages: [{ role: 'user', content: 'Generate JSON' }],
        object_config: {
          model_name: 'test-model',
          schema: { type: 'string' },
          temperature: 0.5,
        },
      };

      const result = adapter.adaptObject(objectConfig, {}, { props: {}, path: undefined, template: {} });

      expect(result.messages).toEqual([{ role: 'user', content: 'Generate JSON' }]);
      expect(result.temperature).toBe(0.5);
      expect(result.output).toBeDefined();
    });
  });
});