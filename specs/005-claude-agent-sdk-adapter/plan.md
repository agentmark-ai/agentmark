# Implementation Plan: Claude Agent SDK Adapter

**Branch**: `005-claude-agent-sdk-adapter` | **Date**: 2026-01-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-claude-agent-sdk-adapter/spec.md`

## Summary

Create a Claude Agent SDK adapter for AgentMark that bridges prompt management with Anthropic's autonomous agent execution capabilities. The adapter transforms AgentMark prompts to Claude Agent SDK query format, supports custom tools via MCP bridge, and emits OpenTelemetry spans following GenAI semantic conventions for observability.

## Technical Context

**Language/Version**: TypeScript 5.6.2+
**Primary Dependencies**: @anthropic-ai/claude-agent-sdk, @opentelemetry/api, @opentelemetry/sdk-trace-base, zod
**Storage**: N/A (stateless adapter)
**Testing**: Vitest ^3.0.8
**Target Platform**: Node.js (ESM/CJS dual export)
**Project Type**: Single package within AgentMark monorepo
**Performance Goals**: N/A (adapter transforms config, does not execute queries)
**Constraints**: Must follow AgentMark adapter interface patterns
**Scale/Scope**: Integration adapter, ~10-15 source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Markdown-First Design | ✓ Pass | Prompts remain in MDX format; adapter transforms at runtime |
| II. Adapter Neutrality | ✓ Pass | This IS an adapter; core AgentMark unchanged |
| III. Type Safety | ✓ Pass | Full TypeScript with generics, Zod for runtime validation |
| IV. Testability | ✓ Pass | Vitest tests, adapter returns config for deterministic testing |
| V. Composability | ✓ Pass | Tool registry, model registry, hook composition all composable |

**Post-Design Re-check**: All principles satisfied. No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/005-claude-agent-sdk-adapter/
├── plan.md              # This file
├── research.md          # Design decisions and rationale
├── data-model.md        # Entity definitions
├── quickstart.md        # Usage guide
├── contracts/           # API contracts
└── tasks.md             # Implementation tasks (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/claude-agent-sdk-adapter/
├── src/
│   ├── index.ts                    # Main exports, createAgentMarkClient
│   ├── adapter.ts                  # ClaudeAgentAdapter class
│   ├── runner.ts                   # CLI webhook handler
│   ├── tool-registry.ts            # ClaudeAgentToolRegistry
│   ├── model-registry.ts           # ClaudeAgentModelRegistry
│   ├── types.ts                    # Type definitions
│   ├── hooks/
│   │   ├── telemetry-hooks.ts      # Event-based telemetry hooks, mergeHooks utility
│   │   └── otel-hooks.ts           # OpenTelemetry span emission
│   └── mcp/
│       └── agentmark-mcp-bridge.ts # MCP server for custom tools
├── test/
│   ├── agentmark.test.ts           # Integration tests
│   ├── hooks.test.ts               # Hook tests
│   ├── mcp.test.ts                 # MCP bridge tests
│   ├── otel.test.ts                # OTLP telemetry tests
│   └── fixtures/                   # Test prompt fixtures
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

**Structure Decision**: Single package within existing monorepo structure at `packages/claude-agent-sdk-adapter/`. Follows established AgentMark adapter patterns.

## Complexity Tracking

> No violations requiring justification. Standard adapter pattern with hook-based telemetry.

## Phase 0: Research Summary

See [research.md](./research.md) for complete details. Key decisions:

1. **Adapter returns config, not results** - Developers control async iteration
2. **Custom tools via MCP bridge** - Uses Claude SDK's native tool mechanism
3. **Pattern-based model registry** - Flexible model family configuration
4. **Telemetry via hooks** - 8 event types mapped to OTLP spans
5. **OTEL GenAI semantic conventions** - Standard attribute names for observability
6. **Trace context propagation** - Shared context object for span hierarchy

## Phase 1: Design Artifacts

### Data Model

See [data-model.md](./data-model.md) for complete entity definitions.

Key entities:
- `ClaudeAgentAdapter`: Core transformation logic
- `ClaudeAgentToolRegistry`: Type-safe tool registration
- `ClaudeAgentModelRegistry`: Pattern-based model config
- `TelemetryContext`: OTEL span management
- `OtelHooksConfig`: OTLP configuration

### API Contracts

See [contracts/](./contracts/) for OpenAPI specifications.

Key interfaces:
- `createAgentMarkClient()` - Factory function
- `adaptText()` / `adaptObject()` - Prompt transformation
- `createOtelHooks()` - OTLP telemetry hook factory

### Quickstart

See [quickstart.md](./quickstart.md) for usage examples.

## Phase 2: Implementation Tasks

The following tasks implement the OTEL telemetry functionality (FR-013 to FR-018):

### Task 1: Add OpenTelemetry Dependencies

Add required OTEL packages to package.json:
- `@opentelemetry/api` (peer dependency, optional)
- `@opentelemetry/sdk-trace-base` (dev dependency for testing)
- `@opentelemetry/exporter-trace-otlp-http` (dev dependency for testing)

### Task 2: Create OTEL Hooks Module

Create `src/hooks/otel-hooks.ts` with:

1. **GenAI Semantic Convention Constants**:
   - `gen_ai.system` = "anthropic"
   - `gen_ai.request.model` = model name
   - `gen_ai.usage.input_tokens` / `output_tokens`
   - `gen_ai.response.finish_reason`
   - `gen_ai.tool.name` / `gen_ai.tool.call.id`

2. **AgentMark-Specific Attributes**:
   - `agentmark.prompt_name`
   - `agentmark.session_id`
   - `agentmark.user_id`

3. **OtelHooksConfig Interface**:
   ```typescript
   interface OtelHooksConfig {
     tracerProvider: TracerProvider;  // We create tracer with scope 'agentmark'
     promptName: string;
     model?: string;
     userId?: string;
     additionalAttributes?: Record<string, string | number | boolean>;
   }
   ```

4. **TelemetryContext Interface**:
   ```typescript
   interface TelemetryContext {
     rootSpan?: Span;
     activeToolSpans: Map<string, Span>;
     activeSubagentSpans: Map<string, Span>;
     tracer: Tracer;
     config: OtelHooksConfig;
   }
   ```

5. **createOtelHooks() Function**:
   - SessionStart → Create root span (`gen_ai.session`)
   - PreToolUse → Create child span (`gen_ai.tool.call {tool_name}`)
   - PostToolUse → End tool span with OK status
   - PostToolUseFailure → End tool span with ERROR status, record exception
   - SessionEnd/Stop → End root span with usage attributes
   - SubagentStart/Stop → Create/end subagent spans

6. **combineWithOtelHooks() Utility**:
   - Merge OTEL hooks with other hook configurations
   - OTEL hooks execute first to ensure spans created before other hooks

### Task 3: Export OTEL Hooks from Index

Update `src/index.ts` to export:
- `createOtelHooks`
- `combineWithOtelHooks`
- `createTelemetryContext`
- `GenAIAttributes` (constant object)
- `AgentMarkAttributes` (constant object)
- `SpanNames` (constant object)
- `OtelHooksConfig` (type)
- `TelemetryContext` (type)

### Task 4: Create OTEL Tests

Create `test/otel.test.ts` with:

1. **Mock Tracer Setup**: Create mock tracer that captures spans
2. **Session Span Tests**:
   - Verify root span created on SessionStart
   - Verify root span ended on SessionEnd/Stop
   - Verify GenAI attributes present
3. **Tool Span Tests**:
   - Verify child span created on PreToolUse
   - Verify span ended with OK on PostToolUse
   - Verify span ended with ERROR on PostToolUseFailure
   - Verify tool name and call ID attributes
4. **Hierarchy Tests**:
   - Verify tool spans are children of session span
   - Verify multiple tool spans maintain correct order
5. **Attribute Tests**:
   - Verify all GenAI semantic convention attributes
   - Verify AgentMark-specific attributes

### Task 5: Update Data Model Documentation

Add to data-model.md:
- `OtelHooksConfig` entity definition
- `TelemetryContext` entity definition
- `GenAIAttributes` constant definitions
- Updated relationships diagram showing OTEL flow

## Next Steps

Run `/speckit.tasks` to generate detailed implementation tasks from this plan.
