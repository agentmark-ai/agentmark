# Data Model: Claude Agent SDK Adapter

**Feature**: 005-claude-agent-sdk-adapter
**Date**: 2026-01-09

## Overview

This document describes the data model for the Claude Agent SDK adapter. As a stateless adapter, there is no persistent storage; the model consists of configuration objects and runtime types.

## Core Entities

### ClaudeAgentAdapter

The main adapter class implementing AgentMark's `Adapter<T>` interface.

| Property | Type | Description |
|----------|------|-------------|
| modelRegistry | ClaudeAgentModelRegistry | Registry for model configurations |
| toolRegistry | ClaudeAgentToolRegistry | Registry for custom tools |
| options | ClaudeAgentAdapterOptions | Adapter-level default options |
| hooks | HookConfig[] | Telemetry and behavior hooks |

**Methods**:
- `adaptText(config, options)` → `ClaudeAgentTextParams`
- `adaptObject(config, options)` → `ClaudeAgentObjectParams<T>`
- `adaptImage(config, options)` → throws Error (unsupported)
- `adaptSpeech(config, options)` → throws Error (unsupported)

### ClaudeAgentTextParams

Configuration returned by `adaptText()` for Claude Agent SDK query.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| prompt | string | Yes | Flattened prompt string for agent |
| options | ClaudeAgentQueryOptions | Yes | Claude Agent SDK query options |
| messages | RichChatMessage[] | Yes | Original rich messages for reference |

### ClaudeAgentObjectParams\<T\>

Configuration returned by `adaptObject()` for structured output.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| prompt | string | Yes | Flattened prompt string |
| options | ClaudeAgentQueryOptions & outputFormat | Yes | Options with JSON schema |
| messages | RichChatMessage[] | Yes | Original messages |
| _outputType | T | No | TypeScript type marker |

### ClaudeAgentQueryOptions

Options passed to Claude Agent SDK's `query()` function.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| model | string | - | Model identifier |
| maxThinkingTokens | number | - | Extended thinking token limit |
| maxTurns | number | - | Maximum conversation turns |
| maxBudgetUsd | number | - | Budget cap in USD |
| permissionMode | PermissionMode | 'default' | Tool permission behavior |
| cwd | string | - | Working directory |
| systemPrompt | string \| SystemPromptPreset | - | System prompt configuration |
| allowedTools | string[] | - | Tool whitelist |
| disallowedTools | string[] | - | Tool blacklist |
| mcpServers | Record<string, unknown> | - | MCP server configurations |
| hooks | Record<string, HookCallbackMatcher[]> | - | Event hooks |
| outputFormat | { type, schema } | - | Structured output schema |

### ClaudeAgentToolRegistry

Type-safe registry for custom tools.

| Property | Type | Description |
|----------|------|-------------|
| tools | Map<string, ToolDefinition> | Registered tool definitions |

**Generic Type Parameters**:
- `TD` - Tool definitions record type (maps tool names to args types)
- `RM` - Return map type (maps tool names to return types)

**Methods**:
- `register(name, fn)` → returns `this` (chainable)
- `get(name)` → `(args) => ReturnType`
- `has(name)` → `boolean`
- `getToolNames()` → `string[]`

### ClaudeAgentModelRegistry

Registry for model configurations with pattern matching.

| Property | Type | Description |
|----------|------|-------------|
| configs | Map<Pattern, ModelConfigCreator> | Pattern-to-config mappings |

**Pattern Types**:
- `string` - Exact model name match
- `RegExp` - Regular expression match
- `string[]` - Match any in array

**Methods**:
- `registerModels(pattern, creator)` → returns `this` (chainable)
- `getModelConfig(modelName, options?)` → `ModelConfig`
- `hasModel(modelName)` → `boolean`
- `static createDefault()` → default pass-through registry

### TelemetryConfig

Configuration for basic telemetry hooks.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| isEnabled | boolean | Yes | Enable/disable telemetry |
| functionId | string | No | Unique function identifier |
| metadata | Record<string, unknown> | No | Additional metadata |
| promptName | string | Yes | Name of the prompt being executed |
| props | Record<string, unknown> | Yes | Props passed to the prompt |

## OpenTelemetry Entities

### OtelHooksConfig

Configuration for OpenTelemetry span-emitting hooks.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tracerProvider | TracerProvider | No | Optional TracerProvider; falls back to global tracer |
| promptName | string | Yes | Prompt name for correlation (agentmark.prompt_name) |
| model | string | No | Model name being used (gen_ai.request.model) |
| userId | string | No | User ID for correlation (agentmark.user_id) |
| userPrompt | string | No | User's input prompt (gen_ai.request.input) |
| additionalAttributes | Record<string, string \| number \| boolean> | No | Extra span attributes |

**Note**: If `tracerProvider` is not provided, the adapter uses the global tracer from `AgentMarkSDK.initialize()` or OpenTelemetry's global provider. The tracer is created with scope name `'agentmark'`.

### TelemetryContext

Context object for maintaining span hierarchy across hook callbacks.

| Field | Type | Description |
|-------|------|-------------|
| rootSpan | Span \| undefined | Root session span |
| activeToolSpans | Map<string, Span> | Active tool spans keyed by tool_use_id |
| activeSubagentSpans | Map<string, Span> | Active subagent spans keyed by session_id |
| tracer | Tracer | OpenTelemetry tracer instance |
| config | OtelHooksConfig | Configuration reference |

### GenAIAttributes (Constants)

OpenTelemetry GenAI semantic convention attribute names.

| Constant | Value | Description |
|----------|-------|-------------|
| SYSTEM | "gen_ai.system" | AI system identifier |
| REQUEST_MODEL | "gen_ai.request.model" | Requested model name |
| REQUEST_MAX_TOKENS | "gen_ai.request.max_tokens" | Max tokens requested |
| REQUEST_TEMPERATURE | "gen_ai.request.temperature" | Temperature setting |
| RESPONSE_ID | "gen_ai.response.id" | Response identifier |
| RESPONSE_MODEL | "gen_ai.response.model" | Model that responded |
| RESPONSE_FINISH_REASONS | "gen_ai.response.finish_reasons" | Completion reasons |
| USAGE_INPUT_TOKENS | "gen_ai.usage.input_tokens" | Input token count |
| USAGE_OUTPUT_TOKENS | "gen_ai.usage.output_tokens" | Output token count |
| TOOL_NAME | "gen_ai.tool.name" | Tool name |
| TOOL_CALL_ID | "gen_ai.tool.call.id" | Tool call identifier |
| REQUEST_INPUT | "gen_ai.request.input" | User input prompt |
| RESPONSE_OUTPUT | "gen_ai.response.output" | Agent response output |
| TOOL_INPUT | "gen_ai.tool.input" | Tool input parameters |
| TOOL_OUTPUT | "gen_ai.tool.output" | Tool execution result |

### AgentMarkAttributes (Constants)

AgentMark-specific span attribute names.

| Constant | Value | Description |
|----------|-------|-------------|
| PROMPT_NAME | "agentmark.prompt_name" | AgentMark prompt identifier |
| SESSION_ID | "agentmark.session_id" | Session correlation ID |
| USER_ID | "agentmark.user_id" | User correlation ID |
| FUNCTION_ID | "agentmark.function_id" | Function identifier |
| SUBAGENT_TYPE | "agentmark.subagent_type" | Subagent type (e.g., "explore") |
| AGENT_ID | "agentmark.agent_id" | Agent instance identifier |

### SpanNames (Constants)

Standard span names following OTEL conventions.

| Constant | Value | Description |
|----------|-------|-------------|
| SESSION | "gen_ai.session" | Root session span |
| TOOL_CALL | "gen_ai.tool.call" | Tool invocation span |
| SUBAGENT | "gen_ai.subagent" | Subagent execution span |

### TRACER_SCOPE_NAME (Constant)

The instrumentation scope name used for all AgentMark spans.

| Value | Description |
|-------|-------------|
| "agentmark" | Scope name registered in the normalizer for proper span transformation |

## Enumerations

### PermissionMode

```typescript
type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
```

| Value | Description |
|-------|-------------|
| default | Claude Agent SDK's built-in permission prompts |
| acceptEdits | Auto-accept file edit permissions |
| bypassPermissions | Skip all permission checks |
| plan | Planning mode (limited tool access) |

### Hook Event Names

**Basic Telemetry Hooks (createTelemetryHooks)**:

| Event | Trigger |
|-------|---------|
| SessionStart | Agent session begins |
| SessionEnd | Agent session completes |
| PreToolUse | Before tool execution |
| PostToolUse | After successful tool execution |
| PostToolUseFailure | After tool execution fails |
| Stop | Agent stopped (by user or limit) |
| SubagentStart | Subagent spawned |
| SubagentStop | Subagent completed |

**OTEL Hooks (createOtelHooks)**:

| Event | Trigger | Span Action |
|-------|---------|-------------|
| UserPromptSubmit | User submits prompt | Creates root session span |
| PreToolUse | Before tool execution | Creates child tool span |
| PostToolUse | After successful tool execution | Ends tool span (OK status) |
| PostToolUseFailure | After tool execution fails | Ends tool span (ERROR status) |
| Stop | Agent stopped | Adds final metrics to session span |
| SubagentStart | Subagent spawned | Creates child subagent span |
| SubagentStop | Subagent completed | Ends subagent span |

**Note**: OTEL hooks use `UserPromptSubmit` instead of `SessionStart` to capture the user's input prompt in the span. The session span is finalized via `completeSession()` after query() completes.

## Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                    createAgentMarkClient()                       │
│                           │                                      │
│    ┌─────────────────────┼─────────────────────┐                │
│    │                     │                     │                │
│    ▼                     ▼                     ▼                │
│ ClaudeAgent          ClaudeAgent          ClaudeAgent           │
│ ModelRegistry        ToolRegistry         Adapter               │
│    │                     │                     │                │
│    │ getModelConfig()    │ get()               │ adaptText()    │
│    │                     │                     │ adaptObject()  │
│    └─────────────────────┴─────────────────────┘                │
│                           │                                      │
│                           ▼                                      │
│                 ClaudeAgentTextParams                            │
│                 ClaudeAgentObjectParams                          │
│                 + TelemetryContext                               │
│                           │                                      │
│                           ▼                                      │
│              Claude Agent SDK query()                            │
│                           │                                      │
│                           ▼                                      │
│              ┌────────────────────────┐                          │
│              │   OTEL Hook Callbacks  │                          │
│              └────────────────────────┘                          │
│                           │                                      │
│    ┌──────────────────────┼──────────────────────┐              │
│    ▼                      ▼                      ▼              │
│ UserPromptSubmit     PreToolUse              Stop               │
│    │                      │                      │              │
│    ▼                      ▼                      ▼              │
│ Create Root          Create Tool          Add Metrics           │
│   Span                 Span              to Session             │
│    │                      │                      │              │
│    └──────────────────────┼──────────────────────┘              │
│                           ▼                                      │
│              TelemetryContext                                   │
│              (span hierarchy)                                   │
│                           │                                      │
│                           ▼                                      │
│              completeSession(context, result)                   │
│              (ends session span with response)                  │
│                           │                                      │
│                           ▼                                      │
│              OTLP Exporter                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Validation Rules

1. **Model name**: Must be non-empty string
2. **Tool parameters**: Must be valid JSON Schema
3. **Permission mode**: Must be one of the PermissionMode values
4. **maxTurns**: Must be positive integer if specified
5. **maxBudgetUsd**: Must be positive number if specified
6. **outputFormat.schema**: Must be valid JSON Schema if structured output requested
7. **OtelHooksConfig.tracerProvider**: If provided, must be a valid OpenTelemetry TracerProvider instance
8. **OtelHooksConfig.promptName**: Must be non-empty string

## Utility Functions

### completeSession(context, result, usage?)

Finalizes the session span after query() completes, adding the agent's response to telemetry.

**Parameters**:
- `context: TelemetryContext` - Context from createOtelHooks()
- `result: string | Record<string, unknown>` - Agent's final response
- `usage?: { inputTokens?: number; outputTokens?: number }` - Optional token usage

**Behavior**:
- Adds result to span attribute (gen_ai.response.output)
- Adds usage metrics if provided
- Sets span status to OK
- Ends the root session span

**Note**: This is optional if you don't need to capture the final result. The session span will have metrics from the Stop hook regardless.
