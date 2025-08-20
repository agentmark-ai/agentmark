# AgentMark Adapter Requirements

## Overview

An AgentMark adapter is a bridge between AgentMark's standardized prompt format and a specific AI framework (like Vercel AI SDK, Mastra, OpenAI, etc.). Adapters transform AgentMark's configuration objects into framework-specific parameters while maintaining type safety and supporting all AgentMark features.

## Core Adapter Interface

Every adapter must implement the `Adapter<T>` interface from `@agentmark/agentmark-core`:

**Required Implementation:**
- Create a class that implements the core `Adapter<T>` interface
- Include a unique `__name` identifier for your adapter
- Implement four adaptation methods: `adaptText`, `adaptObject`, `adaptImage`, and `adaptSpeech`
- Each method should transform AgentMark configuration objects into framework-specific parameters
- Support generic typing for prompt shapes and maintain type safety

### Required Transformations

Each adapt method must handle the following transformations (if applicable):

**Text Prompts:**
- Convert `TextConfig.messages` to framework's message format
- Map model settings (temperature, max_tokens, top_p, etc.)
- Handle tool configurations if supported
- Apply telemetry settings
- Support streaming and non-streaming modes

**Object Prompts:**
- Convert `ObjectConfig.messages` to framework's message format  
- Transform JSON schema to framework's schema format
- Map model settings
- Handle structured output generation

**Image Prompts:**
- Convert prompt text and image generation parameters
- Handle size, aspect ratio, number of images, etc.
- Map model-specific image generation settings

**Speech Prompts:**
- Transform text-to-speech parameters
- Handle voice selection, output format, speed controls
- Map framework-specific speech synthesis settings

## Model Registry

Adapters should provide a model registry for flexible model configuration:

**Registry Requirements:**
- Support exact model name matches
- Support regex pattern matching for model families
- Allow arrays of model names for bulk registration
- Include a default model creator as fallback
- Provide methods to register, retrieve, and set default model creators

**Model Function Creator Requirements:**
- Accept a model name and optional configuration parameters
- Return a framework-specific model instance ready for use
- Handle authentication and endpoint configuration from provided options
- Support both local and remote model configurations as appropriate
- Gracefully handle missing models with informative error messages

## Tool Registry

For frameworks that support function calling, provide a tool registry:

**Registry Requirements:**
- Support generic typing for tool definitions and return types
- Provide methods to register, retrieve, and check tool availability
- Maintain type safety between tool arguments and implementations
- Support tool context passing for additional runtime information
- Enable fluent interface pattern for chaining tool registrations

### Tool Integration

The adapter must:
- Transform AgentMark tool schemas to framework format
- Execute tools with proper context and error handling
- Support tool choice configurations (auto, none, required, specific)
- Handle tool results and continue conversations

## Client Creation Function

Provide a factory function for creating AgentMark clients:

**Factory Function Requirements:**
- Accept optional loader, required model registry, and optional tool registry
- Support generic typing for prompt shapes and tool registries
- Instantiate the adapter with provided registries
- Return a properly typed AgentMark client instance
- Enable seamless integration with AgentMark's core functionality

## Package Structure

### Required Files

**Directory Structure:**
- Root configuration files: `package.json`, `tsconfig.json`, `tsup.config.ts`
- Source directory with main exports, adapter implementation, registries, and types
- Test directory with comprehensive test files and fixture prompts
- Documentation with usage examples and API reference

**Key Source Files:**
- Main index file with all public exports
- Core adapter implementation with the four adapt methods
- Model registry for flexible model configuration
- Tool registry implementation (if framework supports function calling)
- Framework-specific type definitions

### Package.json Requirements

**Essential Configuration:**
- Use `@agentmark/framework-name-adapter` naming convention
- Configure as ES module with dual CJS/ESM exports
- Include proper TypeScript declaration files
- Set up build scripts using tsup for bundling
- Configure testing with vitest or similar framework
- Specify peer dependencies for AgentMark core and target framework
- Include proper export maps for Node.js compatibility

## Usage Examples

### Basic Usage

**Setup Steps:**
- Import the adapter's client creation function and model registry
- Configure the model registry with your target models
- Create an AgentMark client with appropriate loader and registries
- Load prompts using the client's load methods
- Format prompts with input parameters to get framework-specific results

### With Tools

**Tool Integration Steps:**
- Import and instantiate the framework's tool registry
- Register tool implementations with proper type safety
- Create the AgentMark client with both model and tool registries
- Use prompts that reference the registered tools
- Execute prompts with tool support enabled

### Advanced Configuration

**Configuration Options:**
- Support telemetry with custom metadata and function identification
- Allow custom API keys and base URLs for different endpoints
- Provide tool context for additional runtime information
- Enable streaming responses where supported by the framework
- Handle authentication and authorization as needed

### Framework-Specific Options
Adapters may extend `AdaptOptions` to support framework-specific configurations while maintaining compatibility with the base interface.

## Type Safety

### Prompt Shape Types

**Type Safety Requirements:**
- Define interfaces that extend `PromptShape<T>` for prompt type definitions
- Specify input and output types for each prompt in the shape
- Support generic type parameters in the client creation function
- Ensure type-safe prompt loading with proper return types
- Validate input parameters match the defined prompt input types

### Tool Type Safety

**Tool Typing Requirements:**
- Define tool interfaces with argument types for each tool
- Maintain type safety between tool definitions and implementations
- Ensure tool registry methods preserve and validate types
- Support generic tool registries with proper type inference
- Enable compile-time validation of tool arguments and return types

## Testing Requirements

### Required Test Coverage

1. **Unit Tests for Each Adapt Method**
   - Test that `adaptText` correctly transforms TextConfig to framework parameters
   - Verify `adaptObject` handles schema conversion and structured output
   - Ensure `adaptImage` maps image generation settings properly
   - Validate `adaptSpeech` transforms speech synthesis parameters

2. **Integration Tests with Real Prompts**
   - Test complete workflow from prompt loading to execution
   - Verify client creation and configuration work correctly
   - Ensure prompts can be loaded and formatted successfully
   - Test error handling with malformed prompts

3. **Model Registry Tests**
   - Test exact model name matching functionality
   - Verify regex pattern matching works for model families
   - Ensure array registration handles multiple models
   - Test default creator fallback behavior

4. **Tool Registry Tests** (if applicable)
   - Verify tool registration and retrieval mechanisms
   - Test type safety in tool argument passing
   - Ensure tool execution works with proper context
   - Validate error handling for missing tools

### Test Fixtures

Create `.prompt.mdx` files in `test/fixtures/` covering:
- Basic text prompts with system/user/assistant messages
- Object prompts with JSON schema output
- Image prompts with generation parameters  
- Speech prompts with voice synthesis options
- Prompts with tool usage
- Prompts with various parameter combinations

### Error Handling Tests

Test error scenarios:
- Invalid model names
- Missing tool registrations
- Malformed configurations
- Network failures (if applicable)
- Schema validation errors

## Implementation Checklist

When creating a new adapter, ensure:

- [ ] Core `Adapter<T>` interface implemented
- [ ] All four adapt methods handle their respective prompt types
- [ ] Model registry with pattern matching support
- [ ] Tool registry (if framework supports function calling)
- [ ] Client creation factory function
- [ ] Proper TypeScript types and generics
- [ ] Comprehensive test coverage
- [ ] Package exports configured correctly
- [ ] Peer dependencies specified
- [ ] Error handling for edge cases
- [ ] Telemetry support integration

