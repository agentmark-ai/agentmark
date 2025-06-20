# Changelog

All notable changes to the `@agentmark/mastra-adapter` package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-XX

### Added

#### Core Adapter Functionality
- ✅ **MastraAdapter**: Core adapter class for converting AgentMark prompts to Mastra format
- ✅ **Full Modality Support**: Complete support for text, object, image, and speech prompt types
- ✅ **Type Safety**: Full TypeScript support with proper type inference and validation
- ✅ **Runtime Configuration**: Support for dynamic API keys, telemetry, and custom options

#### Model Management
- ✅ **MastraModelRegistry**: Flexible model registration and management system
- ✅ **Pattern Matching**: Support for exact matches, regex patterns, and arrays of model names
- ✅ **Default Fallback**: Configurable default agent creator for unmatched models
- ✅ **AgentCreator Interface**: Standardized interface for creating Mastra agents

#### Tool Integration
- ✅ **MastraToolRegistry**: Type-safe tool registration and execution
- ✅ **Function Calling**: Support for custom tools and function calling in text prompts
- ✅ **Tool Context**: Dynamic tool context passing for runtime configuration
- ✅ **Error Handling**: Graceful handling of unregistered or failed tool calls

#### Prompt Type Adaptations
- ✅ **Text Prompts**: Convert AgentMark text configs to Mastra text parameters
- ✅ **Object Prompts**: Convert AgentMark object configs with Zod schema integration
- ✅ **Image Prompts**: Convert AgentMark image configs to Mastra image parameters
- ✅ **Speech Prompts**: Convert AgentMark speech configs to Mastra speech parameters

#### Configuration Mapping
- ✅ **Temperature**: Map AgentMark temperature to Mastra options
- ✅ **Max Tokens**: Map AgentMark max_tokens to Mastra maxTokens
- ✅ **Top P/K**: Map AgentMark top_p and top_k to Mastra topP and topK
- ✅ **Penalties**: Map AgentMark frequency_penalty and presence_penalty
- ✅ **Stop Sequences**: Map AgentMark stop_sequences to Mastra stopSequences
- ✅ **Seed**: Map AgentMark seed for deterministic outputs
- ✅ **Tool Choice**: Map AgentMark tool_choice to Mastra toolChoice

#### Telemetry & Observability
- ✅ **Telemetry Integration**: Built-in support for Mastra telemetry configuration
- ✅ **Metadata Enrichment**: Automatic prompt name and props injection
- ✅ **Custom Metadata**: Support for custom telemetry metadata
- ✅ **Function ID Tracking**: Support for function-level telemetry tracking

#### Testing & Quality
- ✅ **Comprehensive Tests**: Full test suite covering all adapter functionality
- ✅ **Mock Integrations**: Proper mocking of Mastra agents for testing
- ✅ **Error Scenarios**: Testing of error conditions and edge cases
- ✅ **Type Safety Tests**: Validation of TypeScript type inference
- ✅ **Runtime Config Tests**: Testing of dynamic configuration scenarios

#### Documentation & Examples
- ✅ **Demo Application**: Complete demo app showcasing all modalities
- ✅ **API Documentation**: Comprehensive API reference documentation
- ✅ **Usage Examples**: Code examples for all major use cases
- ✅ **Troubleshooting Guide**: Common issues and solutions
- ✅ **Migration Guide**: Guidelines for adopting from other adapters

#### Developer Experience
- ✅ **ES Modules**: Full ES module support with proper exports
- ✅ **CommonJS**: Backward compatibility with CommonJS
- ✅ **TypeScript Definitions**: Complete type definitions for all interfaces
- ✅ **Build System**: Optimized build system with tsup
- ✅ **Development Tools**: Configured linting, formatting, and testing

### Technical Implementation

#### Architecture Decisions
- **Adapter Pattern**: Follows the established AgentMark adapter pattern for consistency
- **Type-First Design**: Prioritizes type safety and developer experience
- **Modular Structure**: Clean separation between registry, adapter, and tool management
- **Error Resilience**: Graceful error handling and meaningful error messages

#### Performance Optimizations
- **Lazy Loading**: Efficient loading of prompts and models
- **Memory Management**: Proper cleanup and resource management
- **Bundle Size**: Optimized for minimal bundle impact
- **Tree Shaking**: Full support for tree shaking unused code

#### Security Considerations
- **Input Validation**: Proper validation of all inputs and configurations
- **Safe Defaults**: Secure default configurations
- **Error Information**: Careful handling of sensitive information in errors
- **Dependency Security**: Regular security audits of dependencies

### Known Limitations

#### Current Scope
- **Mastra Version**: Currently supports Mastra Core `^0.1.0`
- **Node.js Version**: Requires Node.js 18+ for full functionality
- **TypeScript Version**: Requires TypeScript 5.0+ for optimal type safety

#### Future Enhancements
The following features are planned for future releases:
- **Streaming Support**: Real-time streaming for text and object outputs
- **Advanced Tool Context**: Enhanced tool context with state management
- **Custom Schema Validation**: Extended validation beyond Zod schemas
- **Performance Metrics**: Built-in performance monitoring and metrics
- **Plugin System**: Extensible plugin architecture for custom adapters

### Migration Notes

#### From Vercel AI v4 Adapter
- Model registry pattern is similar but agent-focused instead of model-focused
- Tool registration follows the same type-safe pattern
- Configuration mapping is largely compatible
- Telemetry structure is enhanced with additional metadata

#### Breaking Changes
- None in this initial release

### Dependencies

#### Peer Dependencies
- `@agentmark/agentmark-core`: `^3.2.0`
- `@mastra/core`: `^0.1.0`

#### Runtime Dependencies
- `zod`: `^3.23.8` (for schema validation)

#### Development Dependencies
- Full TypeScript toolchain
- Vitest for testing
- tsup for building
- Various type definitions

### Community & Support

#### Contributing
- Comprehensive contributing guidelines
- Issue templates for bug reports and feature requests
- Pull request templates for code contributions
- Code of conduct for community interactions

#### Documentation
- Complete API reference
- Usage examples and tutorials
- Troubleshooting guides
- Architecture documentation

This changelog represents the initial stable release of the Mastra adapter, providing a robust foundation for integrating AgentMark with the Mastra ecosystem while maintaining the flexibility and type safety that developers expect.