import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  MastraAdapter, 
  MastraAgentRegistry, 
  MastraToolRegistry, 
  MastraExecutor,
} from '../src/adapter';
import { createMastraExecutor } from '../src/index';
import { z } from 'zod';
import type { TextConfig, ObjectConfig, ImageConfig, SpeechConfig } from '@agentmark/agentmark-core';

describe('MastraAdapter', () => {
  let agentRegistry: MastraAgentRegistry;
  let toolRegistry: MastraToolRegistry<any, any>;
  let adapter: MastraAdapter<any, any>;
  let executor: MastraExecutor;

  beforeEach(() => {
    agentRegistry = new MastraAgentRegistry();
    toolRegistry = new MastraToolRegistry();
    adapter = new MastraAdapter(agentRegistry, toolRegistry);
    executor = createMastraExecutor(adapter);
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

    it('should get agent directly using getAgent method', () => {
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      const creator = vi.fn().mockReturnValue(mockAgent);
      agentRegistry.registerAgents('test-model', creator);

      const agent = agentRegistry.getAgent('test-model', { apiKey: 'test' });
      expect(agent).toBe(mockAgent);
      expect(creator).toHaveBeenCalledWith('test-model', { apiKey: 'test' });
    });

    it('should prioritize exact matches over regex patterns', () => {
      const exactCreator = (name: string) => ({ name, type: 'exact' });
      const regexCreator = (name: string) => ({ name, type: 'regex' });
      
      agentRegistry.registerAgents(/^test-/, regexCreator);
      agentRegistry.registerAgents('test-model', exactCreator);
      
      const retrieved = agentRegistry.getAgentFunction('test-model');
      expect(retrieved).toBe(exactCreator);
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

    it('should get all tools as Mastra-compatible tools', () => {
      const registry = new MastraToolRegistry<{ 
        tool1: { args: { input: string } };
        tool2: { args: { value: number } };
      }>();
      
      registry
        .register('tool1', (args) => `result: ${args.input}`)
        .register('tool2', (args) => args.value * 2);

      const allTools = registry.getAllTools();
      expect(Object.keys(allTools)).toEqual(['tool1', 'tool2']);
      expect(allTools.tool1).toBeDefined();
      expect(allTools.tool2).toBeDefined();
    });

    it('should allow chaining multiple tool registrations', () => {
      const registry = new MastraToolRegistry<{ 
        tool1: { args: { a: string } };
        tool2: { args: { b: number } };
        tool3: { args: { c: boolean } };
      }>();
      
      const result = registry
        .register('tool1', (args) => args.a)
        .register('tool2', (args) => args.b)
        .register('tool3', (args) => args.c);

      expect(result.has('tool1')).toBe(true);
      expect(result.has('tool2')).toBe(true);
      expect(result.has('tool3')).toBe(true);
    });
  });

  describe('MastraAdapter', () => {
    it('should have correct adapter name', () => {
      expect(adapter.__name).toBe('mastra');
    });

    it('should adapt text config correctly with enhanced parameters', () => {
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
          max_retries: 2,
          tool_choice: 'auto',
          stop_sequences: ['STOP'],
        },
      };

      const result = adapter.adaptText(textConfig, {}, { props: {}, path: undefined, template: {} });

      expect(result.agent).toBe(mockAgent);
      expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }]);
      expect(result.temperature).toBe(0.7);
      expect(result.maxSteps).toBe(1); // 100 / 100
      expect(result.maxRetries).toBe(2);
      expect(result.toolChoice).toBe('auto');
      expect(result.instructions).toBe('Stop generation when encountering: STOP');
    });

    it('should adapt text config with complex tool definitions', () => {
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      agentRegistry.registerAgents('test-model', () => mockAgent);

      const toolRegistry = new MastraToolRegistry<{
        complexTool: { args: { query: string; options: { limit: number; sort: string } } };
      }>();
      
      toolRegistry.register('complexTool', async (args) => {
        return { results: [], count: args.options.limit };
      });

      const adapterWithTools = new MastraAdapter(agentRegistry, toolRegistry);

      const textConfig: TextConfig = {
        name: 'test-prompt',
        messages: [{ role: 'user', content: 'Use the tool' }],
        text_config: {
          model_name: 'test-model',
          tools: {
            complexTool: {
              description: 'A complex tool with nested parameters',
              parameters: {
                query: { type: 'string', description: 'Search query' },
                options: { 
                  type: 'object',
                  properties: {
                    limit: { type: 'number', description: 'Result limit' },
                    sort: { type: 'string', enum: ['asc', 'desc'] }
                  }
                },
              },
            },
          },
        },
      };

      const result = adapterWithTools.adaptText(textConfig, {}, { 
        props: {}, 
        path: undefined, 
        template: {} 
      });

      expect(result.agent).toBe(mockAgent);
      expect(result.toolsets).toBeDefined();
      expect(result.toolsets?.['test-prompt']).toBeDefined();
    });

    it('should adapt object config correctly with enhanced parameters', () => {
      // Mock agent creator
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      agentRegistry.registerAgents('test-model', () => mockAgent);

      const objectConfig: ObjectConfig = {
        name: 'test-prompt',
        messages: [{ role: 'user', content: 'Generate JSON' }],
        object_config: {
          model_name: 'test-model',
          schema: { name: { type: 'string' }, age: { type: 'number' } },
          temperature: 0.5,
          max_tokens: 200,
          schema_name: 'Person',
          schema_description: 'A person object',
        },
      };

      const result = adapter.adaptObject(objectConfig, {}, { props: {}, path: undefined, template: {} });

      expect(result.agent).toBe(mockAgent);
      expect(result.messages).toEqual([{ role: 'user', content: 'Generate JSON' }]);
      expect(result.temperature).toBe(0.5);
      expect(result.maxSteps).toBe(2); // 200 / 100
      expect(result.output).toBeDefined();
      expect(result.experimental_output).toBeDefined();
      expect(result.instructions).toBe('Generate a Person. A person object');
    });

    it('should adapt image config with all parameters', () => {
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      agentRegistry.registerAgents('dall-e-3', () => mockAgent);

      const imageConfig: ImageConfig = {
        name: 'test-image',
        image_config: {
          model_name: 'dall-e-3',
          prompt: 'A beautiful sunset',
          num_images: 2,
          size: '1024x1024',
          aspect_ratio: '16:9',
          seed: 42,
        },
      };

      const result = adapter.adaptImage(imageConfig, {});

      expect(result.agent).toBe(mockAgent);
      expect(result.prompt).toBe('A beautiful sunset');
      expect(result.n).toBe(2);
      expect(result.size).toBe('1024x1024');
      expect(result.aspectRatio).toBe('16:9');
      expect(result.seed).toBe(42);
      expect(result.instructions).toContain('Generate exactly 2 images');
      expect(result.instructions).toContain('Image size should be 1024x1024');
      expect(result.instructions).toContain('Use aspect ratio 16:9');
      expect(result.instructions).toContain('Use seed 42 for reproducibility');
    });

    it('should adapt speech config with all parameters', () => {
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      agentRegistry.registerAgents('tts-1', () => mockAgent);

      const speechConfig: SpeechConfig = {
        name: 'test-speech',
        speech_config: {
          model_name: 'tts-1',
          text: 'Hello, world!',
          voice: 'nova',
          output_format: 'mp3',
          speed: 1.2,
          instructions: 'Speak clearly',
        },
      };

      const result = adapter.adaptSpeech(speechConfig, {});

      expect(result.agent).toBe(mockAgent);
      expect(result.text).toBe('Hello, world!');
      expect(result.voice).toBe('nova');
      expect(result.outputFormat).toBe('mp3');
      expect(result.speed).toBe(1.2);
      expect(result.instructions).toContain('Use voice: nova');
      expect(result.instructions).toContain('Speak at speed: 1.2');
      expect(result.instructions).toContain('Output format: mp3');
      expect(result.instructions).toContain('Speak clearly');
    });

    it('should handle telemetry configuration', () => {
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      agentRegistry.registerAgents('test-model', () => mockAgent);

      const textConfig: TextConfig = {
        name: 'test-prompt',
        messages: [{ role: 'user', content: 'Hello' }],
        text_config: { model_name: 'test-model' },
      };

      const options = {
        telemetry: {
          isEnabled: true,
          functionId: 'custom-function',
          metadata: { userId: 'user123' },
        },
      };

      const result = adapter.adaptText(textConfig, options, { 
        props: { test: 'value' }, 
        path: undefined, 
        template: {} 
      });

      expect(result.telemetry).toBeDefined();
      expect(result.telemetry?.isEnabled).toBe(true);
      expect(result.telemetry?.functionId).toBe('custom-function');
      expect(result.telemetry?.metadata).toMatchObject({
        userId: 'user123',
        prompt: 'test-prompt',
        props: '{"test":"value"}',
      });
    });

    it('should convert tool choice correctly', () => {
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      agentRegistry.registerAgents('test-model', () => mockAgent);

      const textConfig: TextConfig = {
        name: 'test-prompt',
        messages: [{ role: 'user', content: 'Hello' }],
        text_config: {
          model_name: 'test-model',
          tool_choice: { type: 'tool', tool_name: 'specificTool' },
        },
      };

      const result = adapter.adaptText(textConfig, {}, { props: {}, path: undefined, template: {} });

      expect(result.toolChoice).toEqual({
        type: 'tool',
        toolName: 'specificTool',
      });
    });

    it('should handle empty configurations gracefully', () => {
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      agentRegistry.registerAgents('test-model', () => mockAgent);

      const textConfig: TextConfig = {
        name: 'minimal-prompt',
        messages: [{ role: 'user', content: 'Hello' }],
        text_config: {
          model_name: 'test-model',
        },
      };

      const result = adapter.adaptText(textConfig, {}, { props: {}, path: undefined, template: {} });

      expect(result.agent).toBe(mockAgent);
      expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }]);
      expect(result.temperature).toBeUndefined();
      expect(result.maxSteps).toBeUndefined();
      expect(result.toolsets).toBeUndefined();
    });

    it('should handle undefined optional parameters', () => {
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      agentRegistry.registerAgents('test-model', () => mockAgent);

      const textConfig: TextConfig = {
        name: 'test-prompt',
        messages: [{ role: 'user', content: 'Hello' }],
        text_config: {
          model_name: 'test-model',
          temperature: undefined,
          max_tokens: undefined,
          stop_sequences: undefined,
        },
      };

      const result = adapter.adaptText(textConfig, {}, { props: {}, path: undefined, template: {} });

      expect(result.temperature).toBeUndefined();
      expect(result.maxSteps).toBeUndefined();
      expect(result.instructions).toBeUndefined();
    });
  });

  describe('MastraExecutor', () => {
    it('should execute text generation', async () => {
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ text: 'Generated text', toolCalls: [] })
      };

      const params = {
        agent: mockAgent,
        messages: [{ role: 'user' as const, content: 'Hello' }],
        temperature: 0.7,
        maxSteps: 5,
      };

      const result = await executor.executeText(params);

      expect(mockAgent.generate).toHaveBeenCalledWith(
        [{ role: 'user', content: 'Hello' }],
        expect.objectContaining({
          temperature: 0.7,
          maxSteps: 5,
        })
      );
      expect(result).toEqual({ text: 'Generated text', toolCalls: [] });
    });

    it('should execute object generation', async () => {
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ object: { name: 'John', age: 30 } })
      };

      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const params = {
        agent: mockAgent,
        messages: [{ role: 'user' as const, content: 'Extract data' }],
        output: schema,
        temperature: 0.1,
      };

      const result = await executor.executeObject(params);

      expect(mockAgent.generate).toHaveBeenCalledWith(
        [{ role: 'user', content: 'Extract data' }],
        expect.objectContaining({
          output: schema,
          temperature: 0.1,
        })
      );
      expect(result).toEqual({ object: { name: 'John', age: 30 } });
    });

    it('should handle execution errors gracefully', async () => {
      const mockAgent = {
        generate: vi.fn().mockRejectedValue(new Error('Generation failed'))
      };

      const params = {
        agent: mockAgent,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(executor.executeText(params)).rejects.toThrow('Mastra text generation failed: Generation failed');
    });

    it('should execute image generation', async () => {
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ images: ['image-url'] })
      };

      const params = {
        agent: mockAgent,
        messages: [{ role: 'user' as const, content: 'Generate an image' }],
        instructions: 'Generate exactly 1 images.',
        temperature: 0.8,
      };

      const result = await executor.executeImage(params);

      expect(mockAgent.generate).toHaveBeenCalledWith(
        [{ role: 'user', content: 'Generate an image' }],
        expect.objectContaining({
          instructions: 'Generate exactly 1 images.',
          temperature: 0.8,
        })
      );
      expect(result).toEqual({ images: ['image-url'] });
    });

    it('should execute speech generation', async () => {
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ audio: 'audio-data' })
      };

      const params = {
        agent: mockAgent,
        messages: [{ role: 'user' as const, content: 'Say hello' }],
        instructions: 'Use voice: nova.',
        temperature: 0.9,
      };

      const result = await executor.executeSpeech(params);

      expect(mockAgent.generate).toHaveBeenCalledWith(
        [{ role: 'user', content: 'Say hello' }],
        expect.objectContaining({
          instructions: 'Use voice: nova.',
          temperature: 0.9,
        })
      );
      expect(result).toEqual({ audio: 'audio-data' });
    });

    it('should handle network errors in execution', async () => {
      const mockAgent = {
        generate: vi.fn().mockRejectedValue(new Error('Network timeout'))
      };

      const params = {
        agent: mockAgent,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      await expect(executor.executeText(params)).rejects.toThrow('Mastra text generation failed: Network timeout');
    });

    it('should pass all parameters to agent.generate correctly', async () => {
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ text: 'Success' })
      };

      const onStepFinish = vi.fn();
      const mockAbortController = new AbortController();

      const params = {
        agent: mockAgent,
        messages: [{ role: 'user' as const, content: 'Hello' }],
        temperature: 0.5,
        maxSteps: 10,
        maxRetries: 3,
        toolChoice: 'auto' as const,
        abortSignal: mockAbortController.signal,
        context: [{ key: 'value' }],
        instructions: 'Be helpful',
        memory: {
          thread: 'thread-123',
          resource: 'resource-456',
          options: { lastMessages: 5 }
        },
        telemetry: {
          isEnabled: true,
          functionId: 'test-function'
        },
        onStepFinish,
      };

      await executor.executeText(params);

      expect(mockAgent.generate).toHaveBeenCalledWith(
        [{ role: 'user', content: 'Hello' }],
        {
          toolsets: undefined,
          clientTools: undefined,
          temperature: 0.5,
          maxSteps: 10,
          maxRetries: 3,
          toolChoice: 'auto',
          abortSignal: mockAbortController.signal,
          context: [{ key: 'value' }],
          instructions: 'Be helpful',
          memory: {
            thread: 'thread-123',
            resource: 'resource-456',
            options: { lastMessages: 5 }
          },
          telemetry: {
            isEnabled: true,
            functionId: 'test-function'
          },
          onStepFinish,
        }
      );
    });
  });

  describe('Integration', () => {
    it('should work end-to-end with tools', async () => {
      // Setup tool registry
      const toolRegistry = new MastraToolRegistry<{
        testTool: { args: { input: string } }
      }>();
      
      toolRegistry.register('testTool', async (args) => {
        return `processed: ${args.input}`;
      });

      // Setup agent registry
      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ 
          text: 'Tool result used', 
          toolCalls: [{ toolName: 'testTool', result: 'processed: test' }]
        })
      };
      agentRegistry.registerAgents('test-model', () => mockAgent);

      // Create adapter with tools
      const adapterWithTools = new MastraAdapter(agentRegistry, toolRegistry);

      const textConfig: TextConfig = {
        name: 'test-prompt',
        messages: [{ role: 'user', content: 'Use the tool' }],
        text_config: {
          model_name: 'test-model',
          tools: {
            testTool: {
              description: 'A test tool',
              parameters: {
                input: { type: 'string' },
              },
            },
          },
        },
      };

      const result = adapterWithTools.adaptText(textConfig, {}, { 
        props: {}, 
        path: undefined, 
        template: {} 
      });

      expect(result.agent).toBe(mockAgent);
      expect(result.toolsets).toBeDefined();
      expect(result.toolsets?.['test-prompt']).toBeDefined();
    });

    it('should handle tool execution errors gracefully', async () => {
      const toolRegistry = new MastraToolRegistry<{
        failingTool: { args: { input: string } }
      }>();
      
      toolRegistry.register('failingTool', async () => {
        throw new Error('Tool execution failed');
      });

      const mockAgent = {
        generate: vi.fn().mockResolvedValue({ text: 'Success despite tool error' })
      };
      agentRegistry.registerAgents('test-model', () => mockAgent);

      const adapterWithTools = new MastraAdapter(agentRegistry, toolRegistry);

      const textConfig: TextConfig = {
        name: 'test-prompt',
        messages: [{ role: 'user', content: 'Use the tool' }],
        text_config: {
          model_name: 'test-model',
          tools: {
            failingTool: {
              description: 'A failing tool',
              parameters: {
                input: { type: 'string' },
              },
            },
          },
        },
      };

      const result = adapterWithTools.adaptText(textConfig, {}, { 
        props: {}, 
        path: undefined, 
        template: {} 
      });

      // Tool should be included but execution will be handled by Mastra
      expect(result.toolsets?.['test-prompt']).toBeDefined();
    });

    it('should work with multiple agent patterns simultaneously', () => {
      agentRegistry.registerAgents(/^openai-/, (name) => ({ name, provider: 'openai' }));
      agentRegistry.registerAgents(/^anthropic-/, (name) => ({ name, provider: 'anthropic' }));
      agentRegistry.registerAgents('special-model', () => ({ name: 'special-model', provider: 'special' }));

      expect(agentRegistry.getAgentFunction('openai-gpt4').toString()).toContain('openai');
      expect(agentRegistry.getAgentFunction('anthropic-claude').toString()).toContain('anthropic');
      expect(agentRegistry.getAgentFunction('special-model').toString()).toContain('special');
    });

    it('should maintain type safety across complex tool definitions', () => {
      type ComplexToolDefs = {
        searchTool: { 
          args: { 
            query: string; 
            filters: { category?: string; dateRange?: [string, string] } 
          } 
        };
        analysisTool: { args: { data: number[]; method: 'mean' | 'median' | 'mode' } };
      };

      const complexRegistry = new MastraToolRegistry<ComplexToolDefs>()
        .register('searchTool', async (args) => {
          return { results: [], query: args.query, appliedFilters: args.filters };
        })
        .register('analysisTool', async (args) => {
          const result = args.method === 'mean' 
            ? args.data.reduce((a, b) => a + b, 0) / args.data.length
            : args.data[0];
          return { method: args.method, result };
        });

      expect(complexRegistry.has('searchTool')).toBe(true);
      expect(complexRegistry.has('analysisTool')).toBe(true);
      
      const searchTool = complexRegistry.get('searchTool');
      const analysisResult = complexRegistry.get('analysisTool');
      
      expect(typeof searchTool).toBe('function');
      expect(typeof analysisResult).toBe('function');
    });
  });

  describe('Schema Conversion', () => {
    it('should convert complex JSON schema to Zod correctly', () => {
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      agentRegistry.registerAgents('test-model', () => mockAgent);

      const objectConfig: ObjectConfig = {
        name: 'complex-schema',
        messages: [{ role: 'user', content: 'Generate complex object' }],
        object_config: {
          model_name: 'test-model',
          schema: {
            name: { type: 'string', description: 'Person name' },
            age: { type: 'integer', description: 'Person age' },
            isActive: { type: 'boolean' },
            tags: { type: 'array', items: { type: 'string' } },
            metadata: { 
              type: 'object',
              properties: {
                createdAt: { type: 'string' },
                updatedAt: { type: 'string' }
              }
            },
            status: { type: 'string', enum: ['active', 'inactive', 'pending'] }
          },
        },
      };

      const result = adapter.adaptObject(objectConfig, {}, { props: {}, path: undefined, template: {} });

      expect(result.output).toBeDefined();
      expect(result.experimental_output).toBeDefined();
      // The schema should be a Zod object that can validate the expected structure
    });

    it('should handle missing or malformed schema gracefully', () => {
      const mockAgent = { name: 'test-agent', generate: vi.fn() };
      agentRegistry.registerAgents('test-model', () => mockAgent);

      const objectConfig: ObjectConfig = {
        name: 'malformed-schema',
        messages: [{ role: 'user', content: 'Generate object' }],
        object_config: {
          model_name: 'test-model',
          schema: {
            // Malformed schema without proper type definitions
            name: 'string',
            age: 25,
            nested: { someValue: true }
          },
        },
      };

      // Should not throw an error, should handle gracefully
      expect(() => {
        adapter.adaptObject(objectConfig, {}, { props: {}, path: undefined, template: {} });
      }).not.toThrow();
    });
  });
});