# Feature Specification: Claude Agent SDK Adapter

**Feature Branch**: `005-claude-agent-sdk-adapter`
**Created**: 2026-01-08
**Updated**: 2026-01-12
**Status**: Implementation Complete
**Input**: User description: "Create Claude Agent SDK adapter for AgentMark that bridges the AgentMark prompt framework with Anthropic's Claude Agent SDK, enabling autonomous agent execution with built-in tools support"

## Clarifications

### Session 2026-01-08

- Q: What is the default permissionMode when not explicitly configured? → A: 'default' - Claude Agent SDK's built-in permission prompts

### Session 2026-01-12 (Implementation Review)

- Q: How does permissionMode default work in implementation? → A: The adapter only passes permissionMode to SDK when explicitly configured. Claude Agent SDK natively defaults to 'default' mode, so omitting the parameter achieves the same behavior.
- Q: What hook events does OTEL telemetry use? → A: OTEL hooks use `UserPromptSubmit` (not `SessionStart`) to create the root session span, following the claude_telemetry architecture. The `Stop` hook adds final metrics; `completeSession()` utility ends the span with the agent's response.
- Q: What hook events does basic telemetry use? → A: Basic telemetry hooks (createTelemetryHooks) use all 8 standard events: SessionStart, SessionEnd, PreToolUse, PostToolUse, PostToolUseFailure, Stop, SubagentStart, SubagentStop.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Execute Autonomous Agent Tasks (Priority: P1)

As a developer, I want to use AgentMark prompts with Claude Agent SDK so that I can leverage AgentMark's prompt management while enabling Claude to autonomously execute multi-step tasks with tool access.

**Why this priority**: This is the core value proposition - bridging AgentMark's structured prompt format with Claude Agent SDK's autonomous execution capabilities. Without this, the adapter has no purpose.

**Independent Test**: Can be fully tested by creating an AgentMark prompt with agent configuration and executing it through the adapter to perform a multi-step task (e.g., reading files, making decisions, writing outputs).

**Acceptance Scenarios**:

1. **Given** an AgentMark prompt configured for agent execution, **When** the developer runs the prompt through the adapter, **Then** Claude autonomously executes the task using available tools and returns results.
2. **Given** a prompt with maxTurns configuration, **When** execution begins, **Then** the agent respects the turn limit and stops appropriately.
3. **Given** a prompt with permissionMode settings, **When** tools require permissions, **Then** the agent follows the configured permission behavior.

---

### User Story 2 - Register and Use Custom Tools (Priority: P2)

As a developer, I want to register custom tools that Claude can use during autonomous execution so that I can extend the agent's capabilities beyond built-in tools.

**Why this priority**: Custom tools enable domain-specific functionality, making the adapter useful for real-world applications beyond basic file operations.

**Independent Test**: Can be tested by registering a custom tool (e.g., a search function), creating a prompt that would benefit from that tool, and verifying Claude uses it correctly.

**Acceptance Scenarios**:

1. **Given** a custom tool registered with the tool registry, **When** Claude needs that capability during execution, **Then** Claude discovers and uses the custom tool appropriately.
2. **Given** multiple custom tools registered, **When** a task requires several tools, **Then** Claude can chain tool calls effectively.
3. **Given** a tool with typed parameters, **When** Claude invokes the tool, **Then** the parameters are validated and the tool receives correct input types.

---

### User Story 3 - Configure Model Settings (Priority: P2)

As a developer, I want to configure model settings through a registry so that I can customize model behavior (like extended thinking tokens) for different use cases.

**Why this priority**: Model configuration flexibility is essential for optimizing agent behavior for different task types and cost considerations.

**Independent Test**: Can be tested by registering model configurations with different settings and verifying the adapter applies correct settings based on model name patterns.

**Acceptance Scenarios**:

1. **Given** a model registry with pattern-based configurations, **When** a prompt requests a matching model, **Then** the corresponding configuration is applied.
2. **Given** a thinking-enabled model configuration with maxThinkingTokens, **When** the prompt uses that model, **Then** extended thinking is enabled with the specified token limit.
3. **Given** no explicit model configuration, **When** a prompt specifies a model, **Then** a sensible default pass-through configuration is used.

---

### User Story 4 - Capture Execution Telemetry with OpenTelemetry Spans (Priority: P3)

As a developer, I want agent execution to emit OpenTelemetry spans so that I can integrate with standard observability tools (Jaeger, Zipkin, OTLP collectors) and correlate agent traces with my application traces.

**Why this priority**: Telemetry is important for production observability but is not required for basic functionality. OTLP-based telemetry enables integration with existing monitoring infrastructure.

**Independent Test**: Can be tested by configuring an OTLP exporter, running an agent task, and verifying spans appear in the collector with correct hierarchy and attributes.

**Acceptance Scenarios**:

1. **Given** telemetry enabled with an OTLP endpoint, **When** agent execution starts and ends, **Then** a root session span is created with timing information and exported to the collector.
2. **Given** telemetry enabled, **When** the agent uses a tool, **Then** a child span is created under the session span with tool name, inputs, outputs, and duration.
3. **Given** a tool execution failure, **When** the error occurs, **Then** the tool span is marked with error status and includes error details in span attributes.
4. **Given** multiple tool calls in one session, **When** execution completes, **Then** all tool spans appear as children of the session span in the trace hierarchy.
5. **Given** telemetry metadata (user_id, session_id, trace_name), **When** spans are created, **Then** the metadata appears as span attributes for filtering and correlation.

---

### User Story 5 - Get Structured Output (Priority: P3)

As a developer, I want to request structured JSON output from agent tasks so that I can programmatically process agent responses.

**Why this priority**: Structured output is valuable for integration scenarios but many use cases work fine with unstructured text responses.

**Independent Test**: Can be tested by creating a prompt with JSON schema configuration and verifying the agent returns validated structured data.

**Acceptance Scenarios**:

1. **Given** a prompt configured with a JSON schema, **When** the agent completes its task, **Then** the response conforms to the specified schema.
2. **Given** an invalid schema response, **When** validation fails, **Then** an appropriate error is raised.

---

### Edge Cases

- What happens when tool execution times out? Claude Agent SDK handles tool timeouts natively; the adapter reports timeout errors via PostToolUseFailure hook if telemetry is enabled.
- How does the system handle when Claude cannot complete a task within maxTurns? Claude Agent SDK stops at the limit; the Stop hook fires with reason indicating the limit was reached. The adapter does not add custom status indication beyond what the SDK provides.
- What happens when custom tools throw exceptions? The error is captured in PostToolUseFailure telemetry hook (with ERROR span status for OTEL), and Claude Agent SDK decides how to proceed.
- How does the adapter handle when MCP server connection fails? Connection failures are reported by Claude Agent SDK; the adapter surfaces errors through telemetry hooks if enabled.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST adapt AgentMark text prompts to Claude Agent SDK query format.
- **FR-002**: System MUST adapt AgentMark object prompts (structured output) to Claude Agent SDK format with JSON schema validation.
- **FR-003**: System MUST support configuring agent execution parameters (maxTurns, permissionMode, allowedTools, disallowedTools). When permissionMode is not specified, the adapter omits the parameter, allowing Claude Agent SDK to use its native 'default' mode (built-in permission prompts).
- **FR-004**: System MUST provide a tool registry for registering custom tools with typed parameters and return values.
- **FR-005**: System MUST bridge custom tools to Claude Agent SDK via MCP (Model Context Protocol) format.
- **FR-006**: System MUST provide a model registry supporting pattern-based model configuration matching.
- **FR-007**: System MUST support extended thinking configuration with maxThinkingTokens for compatible models.
- **FR-008**: System MUST provide telemetry hooks for capturing execution events (session lifecycle, tool usage, errors, subagent activities).
- **FR-009**: System MUST merge multiple hook configurations when provided by concatenating callback arrays for matching event types. Later hooks execute after earlier hooks for the same event.
- **FR-010**: System MUST support CLI integration through a webhook handler for running prompts and experiments.
- **FR-011**: System MUST gracefully reject unsupported prompt types (image, speech) with clear error messages.
- **FR-012**: System MUST preserve original rich message format alongside simplified prompt string.
- **FR-013**: System MUST emit OpenTelemetry spans from hooks when telemetry is enabled. OTEL hooks create a root session span on `UserPromptSubmit` (which captures the user's input prompt), child spans for each tool call on `PreToolUse`, and finalize the session on `Stop`. A `completeSession()` utility MUST be provided to add the agent's final response to the session span.
- **FR-014**: System MUST support flexible tracer configuration. Users MAY provide an optional `TracerProvider` instance, or the adapter MUST fall back to the global tracer (from `AgentMarkSDK.initialize()` or OpenTelemetry's global provider). The adapter creates a tracer with scope name `'agentmark'` for proper span identification.
- **FR-015**: System MUST follow OpenTelemetry Semantic Conventions for GenAI/LLM operations, including standard attribute names (gen_ai.system, gen_ai.request.model, gen_ai.usage.input_tokens, gen_ai.usage.output_tokens, gen_ai.response.finish_reason) and span naming conventions.
- **FR-016**: System MUST properly end spans on corresponding end events. For OTEL hooks: `Stop` adds final metrics and `completeSession()` ends the root span; `PostToolUse`/`PostToolUseFailure` end tool spans. For basic telemetry hooks: `SessionEnd` marks session completion.
- **FR-017**: System MUST propagate trace context through hook callbacks to maintain span hierarchy.
- **FR-018**: System MUST use semantic convention attributes for tool calls (gen_ai.tool.name, gen_ai.tool.call.id) and include AgentMark-specific attributes (agentmark.prompt_name, agentmark.session_id, agentmark.user_id) for correlation.

### Key Entities

- **ClaudeAgentAdapter**: Core adapter bridging AgentMark prompts to Claude Agent SDK format.
- **ClaudeAgentToolRegistry**: Type-safe registry for custom tools exposed via MCP.
- **ClaudeAgentModelRegistry**: Registry for model configurations with pattern-based matching.
- **ClaudeAgentWebhookHandler**: CLI integration handler for prompt execution.
- **TelemetryHooks**: Configuration for capturing execution events (basic telemetry via createTelemetryHooks).
- **OtelHooks**: OpenTelemetry span-emitting hooks (via createOtelHooks) following GenAI semantic conventions.
- **TelemetryContext**: Context object for maintaining span hierarchy across hook callbacks; returned by createOtelHooks.
- **completeSession**: Utility function to finalize the session span with the agent's response after query() completes.
- **MCPServer**: Model Context Protocol server configuration for tool exposure.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can execute AgentMark prompts with Claude Agent SDK in under 5 lines of setup code.
- **SC-002**: Custom tools can be registered and used by Claude within a single prompt execution cycle.
- **SC-003**: Basic telemetry hooks support all 8 event types (SessionStart, SessionEnd, PreToolUse, PostToolUse, PostToolUseFailure, Stop, SubagentStart, SubagentStop). OTEL hooks support 7 events (UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Stop, SubagentStart, SubagentStop) optimized for span lifecycle.
- **SC-007**: OpenTelemetry spans are exported to configured OTLP endpoint with correct parent-child hierarchy.
- **SC-008**: Span attributes include all metadata provided in telemetry configuration (user_id, session_id, trace_name, prompt_name).
- **SC-004**: Model configurations apply correctly based on exact string match, regex pattern, or array of patterns.
- **SC-005**: 100% of adapted prompts include both simplified prompt string and original rich messages.
- **SC-006**: Structured output prompts return data conforming to specified JSON schema.

## Assumptions

- Developers are familiar with both AgentMark prompt format and Claude Agent SDK basics.
- Claude Agent SDK's `query()` function is the primary execution interface and returns an AsyncGenerator.
- MCP (Model Context Protocol) is the standard mechanism for exposing tools to Claude Agent SDK.
- Permission modes ('default', 'acceptEdits', 'bypassPermissions', 'plan') are provided by Claude Agent SDK.
- The adapter returns configuration for `query()` rather than executing it directly, giving developers control over the async iteration.
- OpenTelemetry Semantic Conventions for GenAI (https://opentelemetry.io/docs/specs/semconv/gen-ai/) define standard attribute names and span naming patterns.
- Claude Agent SDK does not emit OpenTelemetry spans natively; telemetry must be implemented via hooks.
