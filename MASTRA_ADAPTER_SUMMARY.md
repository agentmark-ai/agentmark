# Mastra Adapter for AgentMark

## Overview

I have successfully created a comprehensive Mastra adapter for AgentMark, enabling seamless integration between AgentMark prompts and the Mastra TypeScript AI agent framework.

## What Was Implemented

### 1. Package Structure
- **Location**: `packages/mastra-adapter/`
- **Package Name**: `@agentmark/mastra-adapter`
- **Version**: 3.3.0
- **License**: MIT

### 2. Core Components

#### MastraAdapter Class
- Implements the AgentMark `Adapter` interface
- Supports all AgentMark configuration types:
  - Text configurations (with tool support)
  - Object configurations (structured output)
  - Image configurations
  - Speech configurations
- Converts AgentMark configurations to Mastra-compatible formats

#### MastraModelRegistry
- Flexible model registration system
- Supports exact model name matching
- Supports regex pattern matching
- Supports array-based registration
- Fallback to default model creator
- Compatible with any AI provider through Vercel AI SDK

#### MastraToolRegistry
- Type-safe tool registration and execution
- Maps AgentMark tool definitions to Mastra tools
- Supports tool context passing
- Uses Mastra's `createTool` function for compatibility

### 3. Key Features

#### Agent Management
- Dynamic agent creation and caching
- Automatic conversion of AgentMark messages to Mastra agent instructions
- Proper model binding and configuration

#### Tool Integration
- Seamless conversion of AgentMark tools to Mastra tools
- Support for tool parameters and validation
- Integration with Mastra's tool execution system

#### Type Safety
- Full TypeScript support with proper type inference
- Compatible with AgentMark's type system
- Proper generic type handling

#### Telemetry Support
- Built-in observability integration
- Metadata passing for tracking and debugging
- Compatible with AgentMark's telemetry system

### 4. API Interface

#### Main Factory Function
```typescript
export function createAgentMarkClient<
  D extends PromptShape<D> = any,
  T extends MastraToolRegistry<any, any> = MastraToolRegistry<any, any>
>(opts: {
  loader?: Loader<D>;
  modelRegistry: MastraModelRegistry;
  agentRegistry: Record<string, any>;
  toolRegistry?: T;
}): MastraAgentMark<D, T>
```

#### Example Usage
```typescript
import { createAgentMarkClient, MastraModelRegistry } from '@agentmark/mastra-adapter';
import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core';

// Create model registry
const modelRegistry = new MastraModelRegistry();
modelRegistry.registerModels(['gpt-4o', 'gpt-4o-mini'], (modelName) => {
  return openai(modelName);
});

// Create agent registry
const agentRegistry = {
  'default': new Agent({
    name: 'Default Agent',
    instructions: 'You are a helpful assistant.',
    model: openai('gpt-4o-mini'),
  })
};

// Create client
const client = createAgentMarkClient({
  modelRegistry,
  agentRegistry,
});
```

### 5. Dependencies
- **Core**: `@agentmark/agentmark-core` (peer dependency)
- **Framework**: `@mastra/core` (peer dependency)
- **Schema Validation**: `zod`

### 6. Build System
- Uses tsup for building ESM and CJS formats
- Generates TypeScript declaration files
- Full source maps support
- Compatible with the monorepo build system

### 7. Testing
- Comprehensive unit tests using Vitest
- Tests for model registry functionality
- Tests for tool registry functionality
- Tests for adapter core functionality

## Benefits

1. **Seamless Integration**: Allows AgentMark users to leverage the Mastra ecosystem
2. **Type Safety**: Full TypeScript support with proper type inference
3. **Flexibility**: Supports any AI provider through model registry system
4. **Tool Compatibility**: Converts AgentMark tools to Mastra-compatible format
5. **Performance**: Efficient agent caching and reuse
6. **Observability**: Built-in telemetry and logging support

## Architecture

The adapter follows the same pattern as the existing `vercel-ai-v4-adapter`, ensuring consistency with the AgentMark ecosystem. It acts as a bridge between AgentMark's prompt-based configuration system and Mastra's agent-based architecture.

### Key Design Decisions

1. **Agent Caching**: Agents are created once and cached for reuse across multiple invocations
2. **Dynamic Agent Creation**: Agents are created on-demand based on AgentMark configurations
3. **Tool Conversion**: AgentMark tools are converted to Mastra tools using the `createTool` function
4. **Type Compatibility**: Uses type assertions and casting to bridge type differences between systems
5. **Error Handling**: Graceful error handling for missing dependencies and configuration issues

## Installation and Usage

```bash
npm install @agentmark/mastra-adapter @mastra/core
```

The adapter is now ready for use and can be imported and used just like the existing vercel-ai-v4 adapter, providing AgentMark users with access to the powerful Mastra framework ecosystem.

## Status

✅ **Complete and Tested**: The adapter is fully implemented, tested, and builds successfully as part of the AgentMark monorepo.