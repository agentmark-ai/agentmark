# Changelog

## [3.3.0] - 2025-01-10

### Added
- Initial release of the Mastra adapter for AgentMark
- Integration with Mastra TypeScript AI agent framework
- MastraAdapter class for converting AgentMark configurations to Mastra-compatible formats
- MastraModelRegistry for flexible model registration and management
- MastraToolRegistry for tool registration and execution
- Support for text, object, image, and speech configurations
- Agent registry system for managing pre-configured Mastra agents
- Telemetry and observability support
- Full TypeScript support with proper type inference
- createAgentMarkClient factory function for easy setup

### Features
- **Agent Integration**: Seamlessly converts AgentMark configurations to Mastra agents
- **Model Registry**: Flexible model registration supporting any AI provider through Vercel AI SDK
- **Tool Support**: Convert AgentMark tools to Mastra-compatible tools with createTool
- **Type Safety**: Full TypeScript support with proper type inference
- **Observability**: Built-in telemetry and logging capabilities