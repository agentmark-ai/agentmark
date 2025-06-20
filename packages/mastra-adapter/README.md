# @agentmark/mastra-adapter

An AgentMark adapter for the [Mastra](https://mastra.ai/) TypeScript AI agent framework.

## Installation

```bash
npm install @agentmark/mastra-adapter @mastra/core
```

## Usage

```typescript
import { createAgentMarkClient, MastraModelRegistry } from '@agentmark/mastra-adapter';
import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core';

// Create a model registry
const modelRegistry = new MastraModelRegistry();

// Register OpenAI models
modelRegistry.registerModels(['gpt-4o', 'gpt-4o-mini'], (modelName) => {
  return openai(modelName);
});

// Create an agent registry 
const agentRegistry = {
  'default': new Agent({
    name: 'Default Agent',
    instructions: 'You are a helpful assistant.',
    model: openai('gpt-4o-mini'),
  })
};

// Create the AgentMark client
const client = createAgentMarkClient({
  modelRegistry,
  agentRegistry,
});

// Use with your AgentMark prompts
const prompt = await client.loadObjectPrompt('path/to/prompt.md');
const result = await prompt.format({ input: 'Hello world' });
```

## Features

- **Agent Integration**: Seamlessly converts AgentMark configurations to Mastra agents
- **Model Registry**: Flexible model registration system supporting any AI provider
- **Tool Support**: Convert AgentMark tools to Mastra-compatible tools
- **Telemetry**: Built-in observability and logging support
- **Type Safety**: Full TypeScript support with proper type inference

## Configuration

### Model Registry

The `MastraModelRegistry` allows you to register models using patterns:

```typescript
const modelRegistry = new MastraModelRegistry();

// Register specific models
modelRegistry.registerModels(['gpt-4o', 'claude-3-5-sonnet'], (modelName) => {
  if (modelName.startsWith('gpt')) {
    return openai(modelName);
  } else {
    return anthropic(modelName);
  }
});

// Register with regex patterns
modelRegistry.registerModels(/^gpt-/, (modelName) => openai(modelName));

// Set a default model creator
modelRegistry.setDefaultCreator((modelName) => openai('gpt-4o-mini'));
```

### Agent Registry

Provide a registry of pre-configured Mastra agents:

```typescript
const agentRegistry = {
  'customer-service': new Agent({
    name: 'Customer Service Agent',
    instructions: 'You are a helpful customer service representative.',
    model: openai('gpt-4o'),
  }),
  'technical-support': new Agent({
    name: 'Technical Support Agent', 
    instructions: 'You provide technical assistance.',
    model: openai('gpt-4o'),
  }),
};
```

### Tool Registry

Register tools that can be used by your agents:

```typescript
import { MastraToolRegistry } from '@agentmark/mastra-adapter';

const toolRegistry = new MastraToolRegistry();

toolRegistry.register('searchWeb', async (args, context) => {
  // Implementation for web search
  return { results: [] };
});

const client = createAgentMarkClient({
  modelRegistry,
  agentRegistry,
  toolRegistry,
});
```

## License

MIT