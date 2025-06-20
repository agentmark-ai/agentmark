# @agentmark/mastra-adapter

AgentMark adapter for [Mastra](https://mastra.ai/) - the TypeScript AI agent framework.

## Installation

```bash
npm install @agentmark/mastra-adapter @mastra/core
```

## Usage

```typescript
import { createAgentMarkClient, MastraAgentRegistry } from '@agentmark/mastra-adapter';
import { Agent } from '@mastra/core';
import { openai } from '@ai-sdk/openai';

// Create an agent registry
const agentRegistry = new MastraAgentRegistry();

// Register agents
agentRegistry.registerAgents('gpt-4o-mini', (name, instructions, model, options) => {
  return new Agent({
    name,
    instructions,
    model: openai('gpt-4o-mini'),
    // Add other Mastra agent options
  });
});

// Create AgentMark client
const client = createAgentMarkClient({
  agentRegistry,
  // toolRegistry: optional tool registry
});

// Use with AgentMark prompts
const prompt = await client.loadObjectPrompt('my-prompt');
const result = await prompt.format({ /* your data */ });
```

## Features

- ✅ Text generation with Mastra agents
- ✅ Object/structured output with schema validation
- ✅ Image generation support
- ✅ Speech/audio generation support
- ✅ Tool calling integration
- ✅ Memory and context management
- ✅ Workflow integration