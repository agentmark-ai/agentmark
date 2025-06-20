# @agentmark/mastra-adapter

An AgentMark adapter for the [Mastra](https://mastra.ai/) TypeScript AI agent framework.

## Installation

```bash
npm install @agentmark/mastra-adapter @mastra/core
```

## Overview

The Mastra adapter enables AgentMark prompts to work seamlessly with Mastra agents. Unlike model-based adapters, the Mastra adapter focuses on **agent orchestration** - converting AgentMark configurations into parameters that can be passed to Mastra agents' `generate()` method.

## Key Concepts

- **Agent Registry**: Maps model names to Mastra agent creators
- **Tool Registry**: Manages tool implementations for agent use
- **Parameter Generation**: Converts AgentMark configs to Mastra-compatible parameters

## Usage

### Basic Setup

```typescript
import { createAgentMarkClient, MastraAgentRegistry, MastraToolRegistry } from '@agentmark/mastra-adapter';
import { Agent } from '@mastra/core';
import { openai } from '@ai-sdk/openai';

// Create an agent registry
const agentRegistry = new MastraAgentRegistry();

// Register agents by model name
agentRegistry.registerAgents('gpt-4o', (modelName, options) => {
  return new Agent({
    name: `Agent for ${modelName}`,
    instructions: 'You are a helpful assistant.',
    model: openai('gpt-4o'),
  });
});

// Register multiple models with one agent creator
agentRegistry.registerAgents(['gpt-4o-mini', 'gpt-3.5-turbo'], (modelName) => {
  return new Agent({
    name: `OpenAI ${modelName}`,
    instructions: 'You are a helpful assistant.',
    model: openai(modelName),
  });
});

// Create AgentMark client
const client = createAgentMarkClient({
  agentRegistry,
  loader: yourLoader, // Your AgentMark loader
});
```

### Working with Tools

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Create a tool registry
const toolRegistry = new MastraToolRegistry<{
  getWeather: { args: { location: string } };
  sendEmail: { args: { to: string; subject: string; body: string } };
}>();

// Register tools
toolRegistry
  .register('getWeather', async (args) => {
    // Tool implementation
    return `Weather in ${args.location}: Sunny, 72°F`;
  })
  .register('sendEmail', async (args) => {
    // Email implementation
    return `Email sent to ${args.to}`;
  });

// Create client with tools
const client = createAgentMarkClient({
  agentRegistry,
  toolRegistry,
  loader: yourLoader,
});
```

### Using AgentMark Prompts

```typescript
// Load and format a text prompt
const textPrompt = client.text('chat-assistant');
const textParams = await textPrompt.format({
  userMessage: 'Hello, how are you?'
});

// Get the agent and generate response
const agent = agentRegistry.getAgentFunction('gpt-4o')('gpt-4o');
const response = await agent.generate(textParams.messages, {
  temperature: textParams.temperature,
  toolsets: textParams.toolsets,
});

// Load and format an object prompt
const objectPrompt = client.object('data-extractor');
const objectParams = await objectPrompt.format({
  document: 'Some document content...'
});

const structuredResponse = await agent.generate(objectParams.messages, {
  output: objectParams.output,
  temperature: objectParams.temperature,
});
```

### Advanced Agent Registry Patterns

```typescript
// Pattern-based registration
agentRegistry.registerAgents(/^claude-/, (modelName) => {
  return new Agent({
    name: `Anthropic ${modelName}`,
    instructions: 'You are Claude, an AI assistant.',
    model: anthropic(modelName),
  });
});

// Default fallback
agentRegistry.setDefaultCreator((modelName) => {
  console.warn(`No specific agent for ${modelName}, using default`);
  return new Agent({
    name: 'Default Agent',
    instructions: 'You are a helpful assistant.',
    model: openai('gpt-4o-mini'), // fallback model
  });
});
```

## API Reference

### MastraAgentRegistry

Manages the mapping between model names and Mastra agent creators.

```typescript
class MastraAgentRegistry {
  registerAgents(pattern: string | RegExp | string[], creator: AgentFunctionCreator): void
  getAgentFunction(agentName: string): AgentFunctionCreator
  setDefaultCreator(creator: AgentFunctionCreator): void
}

type AgentFunctionCreator = (agentName: string, options?: AdaptOptions) => Agent
```

### MastraToolRegistry

Type-safe tool registry for managing tool implementations.

```typescript
class MastraToolRegistry<TD, RM> {
  register<K, R>(name: K, fn: (args: TD[K]['args'], toolContext?: any) => R): MastraToolRegistry<TD, RM & {[K]: R}>
  get<K>(name: K): (args: TD[K]['args'], toolContext?: any) => RM[K]
  has<K>(name: K): boolean
}
```

### Parameter Types

The adapter generates these parameter objects for Mastra agents:

```typescript
// Text generation parameters
type MastraTextParams = {
  messages: RichChatMessage[];
  toolsets?: Record<string, any>;
  temperature?: number;
  maxSteps?: number;
  maxRetries?: number;
  // ... other Mastra options
}

// Structured output parameters  
type MastraObjectParams<T> = {
  messages: RichChatMessage[];
  output: z.ZodSchema<T>;
  temperature?: number;
  // ... other Mastra options
}
```

## Integration with Mastra Features

### Memory Management

```typescript
const textParams = await textPrompt.format({ query: 'Hello' });

const response = await agent.generate(textParams.messages, {
  ...textParams,
  memory: {
    thread: 'user-123',
    resource: 'conversation',
    options: {
      lastMessages: 10,
      semanticRecall: true,
    },
  },
});
```

### Telemetry

```typescript
const response = await agent.generate(textParams.messages, {
  ...textParams,
  telemetry: {
    isEnabled: true,
    recordInputs: true,
    recordOutputs: true,
    functionId: 'chat-assistant',
  },
});
```

## Migration from Other Adapters

If you're migrating from the Vercel AI adapter:

1. **Replace model registry with agent registry**
2. **Update tool definitions** - Mastra uses `createTool()` instead of direct tool objects
3. **Agent-centric approach** - Focus on agent capabilities rather than just model routing

## Examples

See the `examples/` directory for complete working examples including:

- Basic chat agent
- RAG agent with document processing  
- Multi-agent workflows
- Tool-using agents
- Voice-enabled agents

## Contributing

Contributions are welcome! Please see the main AgentMark repository for contribution guidelines.

## License

MIT