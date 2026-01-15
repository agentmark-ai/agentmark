# Research: Claude Agent SDK Adapter

**Feature**: 005-claude-agent-sdk-adapter
**Date**: 2026-01-08
**Status**: Complete (implementation exists)

## Overview

This document captures the design decisions and research findings for the Claude Agent SDK adapter. Since implementation already exists, this serves as documentation of decisions made.

## Key Design Decisions

### 1. Adapter Returns Configuration, Not Execution Results

**Decision**: The adapter's `adaptText()` and `adaptObject()` methods return configuration objects (`ClaudeAgentTextParams`, `ClaudeAgentObjectParams`) rather than executing the Claude Agent SDK query directly.

**Rationale**:
- Claude Agent SDK's `query()` function returns an `AsyncGenerator` for streaming responses
- Developers need control over iteration, error handling, and cancellation
- Keeps adapter stateless and testable without live API calls
- Follows the pattern of other AgentMark adapters that prepare configuration

**Alternatives Considered**:
- Execute query and return full results: Rejected because it blocks, loses streaming, and limits developer control
- Return wrapped generator: Rejected due to complexity and unclear ownership of the async lifecycle

### 2. Custom Tools via MCP Bridge

**Decision**: Custom tools registered through `ClaudeAgentToolRegistry` are exposed to Claude Agent SDK via MCP (Model Context Protocol) servers.

**Rationale**:
- Claude Agent SDK natively supports MCP servers for tool extension
- Consistent with Claude Agent SDK's architecture and documentation
- Enables tool reuse across different agent configurations
- Provides standardized tool discovery and invocation

**Alternatives Considered**:
- Direct function injection: Not supported by Claude Agent SDK's current API
- Custom protocol: Would require SDK modifications and increase maintenance burden

### 3. Pattern-Based Model Registry

**Decision**: `ClaudeAgentModelRegistry` supports pattern matching via exact strings, RegExp, or string arrays for model configuration lookup.

**Rationale**:
- Model naming conventions vary (e.g., `claude-sonnet-4-*`, `claude-*-thinking`)
- Pattern matching enables configuring model families with single registration
- Supports fallback configurations when exact match not found

**Alternatives Considered**:
- Exact string only: Too rigid for model version variations
- Function-based matchers: More flexible but harder to serialize/debug

### 4. Telemetry via Hook Composition

**Decision**: Telemetry is implemented through Claude Agent SDK's hook system with `createTelemetryHooks()` and `mergeHooks()` utilities.

**Rationale**:
- Leverages Claude Agent SDK's native extensibility mechanism
- Supports 8 event types: SessionStart, SessionEnd, PreToolUse, PostToolUse, PostToolUseFailure, Stop, SubagentStart, SubagentStop
- Hook merging allows combining telemetry with other hook behaviors
- Non-intrusive; telemetry can be disabled without code changes

**Alternatives Considered**:
- Event emitter pattern: Would require wrapping SDK calls and managing listeners
- Callback parameters: Less composable and harder to extend

### 5. Default Permission Mode

**Decision**: When `permissionMode` is not specified, the adapter defaults to `'default'` (Claude Agent SDK's built-in permission prompts).

**Rationale**:
- Safest out-of-box behavior for tool execution
- Follows principle of least privilege
- Developers must explicitly opt-in to `'bypassPermissions'`

**Alternatives Considered**:
- `'bypassPermissions'` default: Security risk; tools could execute without consent
- Require explicit configuration: Would break ergonomics for simple use cases

### 6. Dual Package Exports

**Decision**: Package provides two entry points: `index.ts` (main) and `runner.ts` (CLI webhook handler).

**Rationale**:
- CLI runner has additional dependencies and setup requirements
- Separating allows tree-shaking for non-CLI usage
- Follows pattern used by other AgentMark packages

**Alternatives Considered**:
- Single entry point: Would bundle unnecessary CLI code for library users
- Separate package: Overhead for maintaining another package

## Technology Stack Validation

| Technology | Version | Purpose | Validated |
|------------|---------|---------|-----------|
| TypeScript | 5.6.2+ | Type safety, build | ✓ |
| @anthropic-ai/claude-agent-sdk | ^0.1.0 | Agent execution | ✓ |
| Vitest | ^3.0.8 | Testing framework | ✓ |
| tsup | ^8.3.5 | Build tool (ESM/CJS) | ✓ |
| Zod | ^3.24.0 | Runtime validation | ✓ |

### 7. OpenTelemetry Span Emission via Hooks

**Decision**: Telemetry hooks emit OpenTelemetry spans following GenAI semantic conventions, with hook callbacks creating/ending spans and propagating trace context.

**Rationale**:
- Claude Agent SDK does NOT emit OpenTelemetry spans natively
- Hooks provide the only instrumentation points (SessionStart, PreToolUse, etc.)
- OTEL GenAI semantic conventions ensure compatibility with standard observability tools
- Hook-based approach keeps spans in sync with actual execution events

**Implementation Approach**:
- SessionStart → Create root span (`gen_ai.session`)
- PreToolUse → Create child span (`gen_ai.tool.call`)
- PostToolUse → End tool span with success attributes
- PostToolUseFailure → End tool span with error status
- SessionEnd/Stop → End root span

**Span Attributes (OTEL GenAI Semantic Conventions)**:
- `gen_ai.system`: "anthropic"
- `gen_ai.request.model`: model name
- `gen_ai.usage.input_tokens`: token count (if available)
- `gen_ai.usage.output_tokens`: token count (if available)
- `gen_ai.response.finish_reason`: completion reason
- `gen_ai.tool.name`: tool name (for tool spans)
- `gen_ai.tool.call.id`: tool call ID

**AgentMark-Specific Attributes**:
- `agentmark.prompt_name`: prompt identifier
- `agentmark.session_id`: session correlation
- `agentmark.user_id`: user correlation

**Alternatives Considered**:
- Wrap `query()` function: Would only create one outer span, missing tool-level details
- External instrumentation: Not possible without SDK changes
- Custom span format: Would require custom backends, breaking OTEL ecosystem compatibility

### 8. Trace Context Propagation

**Decision**: Use a shared context object passed through hook callbacks to maintain span hierarchy.

**Rationale**:
- Hooks are called independently; no built-in context passing
- Need to associate tool spans with parent session span
- OpenTelemetry context API requires explicit propagation

**Implementation**:
```typescript
interface TelemetryContext {
  rootSpan?: Span;
  activeToolSpans: Map<string, Span>;
  tracer: Tracer;
}
```

## Open Questions (Resolved)

All initial questions have been resolved through implementation:

1. ~~How to expose custom tools?~~ → MCP bridge pattern
2. ~~How to handle structured output?~~ → JSON Schema in outputFormat option
3. ~~How to capture telemetry?~~ → Claude Agent SDK hooks
4. ~~Default permission behavior?~~ → 'default' mode (clarified in spec)
5. ~~How to emit OTLP spans?~~ → Hook-based span creation following OTEL GenAI conventions

## Technology Stack (Updated for OTLP)

| Technology | Version | Purpose | Validated |
|------------|---------|---------|-----------|
| TypeScript | 5.6.2+ | Type safety, build | ✓ |
| @anthropic-ai/claude-agent-sdk | ^0.1.0 | Agent execution | ✓ |
| @opentelemetry/api | ^1.9.0 | OTEL span API | Planned |
| @opentelemetry/sdk-trace-base | ^1.29.0 | Span processor | Planned |
| @opentelemetry/exporter-trace-otlp-http | ^0.57.0 | OTLP export | Planned |
| Vitest | ^3.0.8 | Testing framework | ✓ |
| tsup | ^8.3.5 | Build tool (ESM/CJS) | ✓ |
| Zod | ^3.24.0 | Runtime validation | ✓ |

## References

- [Claude Agent SDK Documentation](https://docs.anthropic.com/claude-agent-sdk)
- [Model Context Protocol (MCP) Specification](https://modelcontextprotocol.io/)
- [AgentMark Adapter Interface](../../../packages/prompt-core/src/adapter.ts)
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
