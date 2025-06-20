# @agentmark/mastra-adapter

An AgentMark adapter for the [Mastra](https://mastra.ai/) TypeScript AI agent framework.

## Installation

```bash
npm install @agentmark/mastra-adapter @mastra/core
```

## Overview

The Mastra adapter enables AgentMark prompts to work seamlessly with Mastra agents. Unlike model-based adapters, the Mastra adapter focuses on **agent orchestration** - converting AgentMark configurations into parameters that can be passed to Mastra agents' `generate()` method.

## Key Features

✅ **Complete AgentMark Integration** - Supports all four configuration types (text, object, image, speech)  
✅ **Agent Registry System** - Flexible agent management with pattern matching  
✅ **Tool Integration** - Type-safe tool registration and execution  
✅ **Memory & Context Support** - Full support for Mastra's memory and context features  
✅ **Telemetry & Observability** - Built-in telemetry and monitoring support  
✅ **Error Handling & Retries** - Comprehensive error handling with retry logic  
✅ **TypeScript Support** - Full type safety and inference  
✅ **Execution Helpers** - Easy-to-use execution utilities  

## Key Concepts

- **Agent Registry**: Maps model names to Mastra agent creators
- **Tool Registry**: Manages tool implementations for agent use
- **Parameter Generation**: Converts AgentMark configs to Mastra-compatible parameters
- **Execution Helpers**: Utilities for easy execution with error handling

## Quick Start

### Basic Setup

```typescript
import { 
  createAgentMarkClient, 
  createMastraExecutor,
  MastraAgentRegistry, 
  MastraToolRegistry 
} from '@agentmark/mastra-adapter';
import { Agent } from '@mastra/core';
import { openai } from '@ai-sdk/openai';

// 1. Create agent registry
const agentRegistry = new MastraAgentRegistry();

// 2. Register agents
agentRegistry.registerAgents('gpt-4o', (modelName) => {
  return new Agent({
    name: 'GPT-4o Assistant',
    instructions: 'You are a helpful AI assistant.',
    model: openai('gpt-4o'),
  });
});

// 3. Create AgentMark client
const client = createAgentMarkClient({
  agentRegistry,
  loader: yourLoader, // Your AgentMark loader
});

// 4. Create executor for easy execution
const executor = createMastraExecutor(client.adapter);
```

### Agent Registry Patterns

```typescript
const agentRegistry = new MastraAgentRegistry();

// Exact name matching
agentRegistry.registerAgents('gpt-4o', (name) => createAgent(name));

// Multiple models
agentRegistry.registerAgents(['gpt-4o', 'gpt-4o-mini'], (name) => createAgent(name));

// Pattern matching with regex
agentRegistry.registerAgents(/^claude-/, (name) => createClaudeAgent(name));

// Default fallback
agentRegistry.setDefaultCreator((name) => createDefaultAgent(name));

// Direct agent access
const agent = agentRegistry.getAgent('gpt-4o', { temperature: 0.7 });
```

### Tool Integration

```typescript
// Define tool types
type ToolDefinitions = {
  getWeather: { args: { location: string; unit?: 'celsius' | 'fahrenheit' } };
  sendEmail: { args: { to: string; subject: string; body: string } };
};

// Create tool registry
const toolRegistry = new MastraToolRegistry<ToolDefinitions>();

// Register tool implementations
toolRegistry
  .register('getWeather', async (args) => {
    // Implement weather API call
    return { location: args.location, temperature: 22, unit: args.unit || 'celsius' };
  })
  .register('sendEmail', async (args) => {
    // Implement email sending
    return { messageId: `msg_${Date.now()}`, status: 'sent' };
  });

// Use with AgentMark client
const client = createAgentMarkClient({
  agentRegistry,
  toolRegistry,
  loader: yourLoader,
});
```

## Usage Examples

### Text Generation with Tools

```typescript
// Format AgentMark prompt
const textPrompt = client.text('assistant-with-tools');
const params = await textPrompt.format({ query: 'What\'s the weather in NYC?' });

// Execute with Mastra
const result = await executor.executeText(params);
console.log(result.text); // Generated response
console.log(result.toolCalls); // Tool calls made
```

### Structured Output Generation

```typescript
// Format object prompt
const objectPrompt = client.object('data-extractor');
const params = await objectPrompt.format({ 
  document: 'John Doe, age 30, works at ACME Corp.' 
});

// Execute structured output
const result = await executor.executeObject(params);
console.log(result.object); // { name: 'John Doe', age: 30, company: 'ACME Corp' }
```

### Advanced Configuration

```typescript
// Enhanced parameters with memory and telemetry
const params = {
  agent: agentRegistry.getAgent('gpt-4o'),
  messages: [{ role: 'user', content: 'Hello!' }],
  
  // Generation settings
  temperature: 0.7,
  maxSteps: 5,
  maxRetries: 3,
  toolChoice: 'auto',
  
  // Memory configuration
  memory: {
    thread: 'conversation-123',
    resource: 'user-456',
    options: {
      lastMessages: 10,
      semanticRecall: {
        topK: 5,
        messageRange: { before: 5, after: 5 },
      },
      workingMemory: { enabled: true },
    },
  },
  
  // Telemetry
  telemetry: {
    isEnabled: true,
    recordInputs: true,
    recordOutputs: true,
    functionId: 'my-function',
    metadata: { userId: 'user-123' },
  },
  
  // Step monitoring
  onStepFinish: (step) => {
    console.log('Step completed:', step);
  },
};

const result = await executor.executeText(params);
```

### Multi-Agent Workflows

```typescript
// Register specialized agents
agentRegistry.registerAgents('research-agent', () => new Agent({
  name: 'Research Specialist',
  instructions: 'Expert at research and fact-finding.',
  model: openai('gpt-4o'),
}));

agentRegistry.registerAgents('writing-agent', () => new Agent({
  name: 'Writing Specialist', 
  instructions: 'Expert at writing and communication.',
  model: openai('gpt-4o'),
}));

// Research phase
const researchResult = await executor.executeText({
  agent: agentRegistry.getAgent('research-agent'),
  messages: [{ role: 'user', content: 'Research AI trends' }],
  toolsets: { search: toolRegistry.getAllTools() },
});

// Writing phase
const articleResult = await executor.executeText({
  agent: agentRegistry.getAgent('writing-agent'),
  messages: [
    { role: 'user', content: `Write an article based on: ${researchResult.text}` }
  ],
});
```

## Error Handling

```typescript
try {
  const result = await executor.executeText({
    agent: agentRegistry.getAgent('gpt-4o'),
    messages: [{ role: 'user', content: 'Hello' }],
    maxRetries: 3,
    maxSteps: 10,
  });
} catch (error) {
  if (error.message.includes('Mastra text generation failed')) {
    // Handle Mastra-specific errors
    console.error('Generation failed:', error);
  }
  // Handle other errors
}
```

## API Reference

### Core Classes

#### `MastraAdapter<T, R>`
Main adapter class implementing the AgentMark Adapter interface.

- **Methods**: `adaptText()`, `adaptObject()`, `adaptImage()`, `adaptSpeech()`
- **Properties**: `__name: "mastra"`, `__dict: T`

#### `MastraAgentRegistry`
Manages agent creators and resolution.

- **Methods**: `registerAgents()`, `getAgentFunction()`, `getAgent()`, `setDefaultCreator()`

#### `MastraToolRegistry<TD, RM>`
Type-safe tool registration and management.

- **Methods**: `register()`, `get()`, `has()`, `getAllTools()`

#### `MastraExecutor`
Execution helper with error handling.

- **Methods**: `executeText()`, `executeObject()`, `executeImage()`, `executeSpeech()`

### Parameter Types

#### `MastraTextParams<TS>`
Parameters for text generation with Mastra agents.

```typescript
{
  agent: Agent;
  messages: RichChatMessage[];
  toolsets?: Record<string, TS>;
  clientTools?: TS;
  // ... plus all MastraGenerateOptions
}
```

#### `MastraObjectParams<T>`
Parameters for structured output generation.

```typescript
{
  agent: Agent;
  messages: RichChatMessage[];
  output: z.ZodSchema<T>;
  experimental_output?: z.ZodSchema<T>;
  // ... plus all MastraGenerateOptions
}
```

#### `MastraGenerateOptions`
Comprehensive generation options matching Mastra's API.

```typescript
{
  temperature?: number;
  maxSteps?: number;
  maxRetries?: number;
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string };
  context?: any[];
  instructions?: string;
  memory?: MastraMemoryConfig;
  telemetry?: MastraTelemetryConfig;
  onStepFinish?: (step: any) => void;
}
```

### Factory Functions

#### `createAgentMarkClient<T, Tools>(options)`
Creates an AgentMark client with Mastra adapter.

#### `createMastraExecutor(adapter)`
Creates an executor helper for easy execution.

## Integration with AgentMark Ecosystem

The Mastra adapter seamlessly integrates with the AgentMark ecosystem:

- **Loaders**: Works with any AgentMark loader (file, database, etc.)
- **Datasets**: Supports dataset processing with `formatWithDataset()`
- **Validation**: Full schema validation for inputs and outputs
- **Type Safety**: Complete TypeScript support with proper inference
- **Telemetry**: Built-in integration with AgentMark telemetry

## Best Practices

1. **Agent Registration**: Use pattern matching for similar models
2. **Tool Management**: Register tools with proper error handling
3. **Memory Configuration**: Use appropriate memory settings for your use case
4. **Error Handling**: Always wrap execution in try-catch blocks
5. **Type Safety**: Define proper tool types for better development experience
6. **Resource Management**: Clean up agents and tools when done

## Differences from Other Adapters

Unlike model-based adapters (like Vercel AI), the Mastra adapter is **agent-centric**:

- **Agents vs Models**: Works with Mastra Agent instances rather than raw models
- **Orchestration**: Focuses on agent orchestration and workflow management
- **Memory**: Built-in support for persistent memory and context
- **Tools**: Native tool integration with agent capabilities
- **Multi-Step**: Support for multi-step reasoning and tool use

## License

MIT License - see the [LICENSE](../../LICENSE) file for details.

## Contributing

Contributions are welcome! Please see the [contributing guidelines](../../CONTRIBUTING.md) for details.