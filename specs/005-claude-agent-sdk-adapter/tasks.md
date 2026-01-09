# Tasks: Claude Agent SDK Adapter

**Input**: Design documents from `/specs/005-claude-agent-sdk-adapter/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included (Vitest tests specified in plan.md testing gates)

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo package**: `packages/claude-agent-sdk-adapter/src/`, `packages/claude-agent-sdk-adapter/test/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Package initialization and configuration

- [x] T001 Create package directory structure per plan in packages/claude-agent-sdk-adapter/
- [x] T002 Initialize package.json with name @agentmark-ai/claude-agent-sdk-adapter and dependencies
- [x] T003 [P] Configure tsconfig.json for TypeScript 5.6.2+ with ESM/CJS dual output
- [x] T004 [P] Configure tsup build tool for dual format compilation in packages/claude-agent-sdk-adapter/
- [x] T005 [P] Setup Vitest configuration in packages/claude-agent-sdk-adapter/vitest.config.ts
- [x] T006 [P] Configure ESLint for the package in packages/claude-agent-sdk-adapter/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types and interfaces that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Define PermissionMode type union in packages/claude-agent-sdk-adapter/src/types.ts
- [x] T008 Define ClaudeAgentQueryOptions interface in packages/claude-agent-sdk-adapter/src/types.ts
- [x] T009 [P] Define ClaudeAgentAdapterOptions interface in packages/claude-agent-sdk-adapter/src/types.ts
- [x] T010 [P] Define HookCallback and HookInput/HookOutput types in packages/claude-agent-sdk-adapter/src/types.ts
- [x] T011 [P] Define ModelConfig and ModelConfigCreator types in packages/claude-agent-sdk-adapter/src/types.ts
- [x] T012 Create test fixtures setup in packages/claude-agent-sdk-adapter/test/setup-fixtures.ts
- [x] T013 Create test fixtures for text prompts in packages/claude-agent-sdk-adapter/test/fixtures/

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Execute Autonomous Agent Tasks (Priority: P1) 🎯 MVP

**Goal**: Bridge AgentMark prompts to Claude Agent SDK query format for autonomous execution

**Independent Test**: Load an AgentMark prompt, adapt it through the adapter, verify output contains prompt string, options with permissionMode defaulting to 'default', and original messages.

### Tests for User Story 1

- [x] T014 [P] [US1] Unit test for adaptText in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T015 [P] [US1] Unit test for default permissionMode behavior in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T016 [P] [US1] Unit test for maxTurns configuration in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T017 [P] [US1] Unit test for unsupported prompt types (image/speech) in packages/claude-agent-sdk-adapter/test/agentmark.test.ts

### Implementation for User Story 1

- [x] T018 [US1] Define ClaudeAgentTextParams interface in packages/claude-agent-sdk-adapter/src/types.ts
- [x] T019 [US1] Implement ClaudeAgentAdapter class with adaptText method in packages/claude-agent-sdk-adapter/src/adapter.ts
- [x] T020 [US1] Implement adaptImage method (throw unsupported error) in packages/claude-agent-sdk-adapter/src/adapter.ts
- [x] T021 [US1] Implement adaptSpeech method (throw unsupported error) in packages/claude-agent-sdk-adapter/src/adapter.ts
- [x] T022 [US1] Implement message flattening to prompt string in packages/claude-agent-sdk-adapter/src/adapter.ts
- [x] T023 [US1] Implement default permissionMode='default' behavior in packages/claude-agent-sdk-adapter/src/adapter.ts
- [x] T024 [US1] Create createAgentMarkClient factory function in packages/claude-agent-sdk-adapter/src/index.ts
- [x] T025 [US1] Export all public types and classes from packages/claude-agent-sdk-adapter/src/index.ts

**Checkpoint**: User Story 1 complete - basic prompt adaptation working

---

## Phase 4: User Story 2 - Register and Use Custom Tools (Priority: P2)

**Goal**: Enable custom tool registration and exposure via MCP

**Independent Test**: Register a custom tool with typed parameters, verify it appears in MCP server configuration, verify tool can be invoked with correct parameter types.

### Tests for User Story 2

- [x] T026 [P] [US2] Unit test for tool registration in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T027 [P] [US2] Unit test for tool retrieval in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T028 [P] [US2] Unit test for MCP server creation in packages/claude-agent-sdk-adapter/test/mcp.test.ts
- [x] T029 [P] [US2] Unit test for tool bridging to MCP format in packages/claude-agent-sdk-adapter/test/mcp.test.ts

### Implementation for User Story 2

- [x] T030 [US2] Define AgentMarkToolDefinition interface in packages/claude-agent-sdk-adapter/src/types.ts
- [x] T031 [US2] Implement ClaudeAgentToolRegistry class in packages/claude-agent-sdk-adapter/src/tool-registry.ts
- [x] T032 [US2] Implement register() chainable method in packages/claude-agent-sdk-adapter/src/tool-registry.ts
- [x] T033 [US2] Implement getTools(), getTool(), has(), size, getToolNames() methods in packages/claude-agent-sdk-adapter/src/tool-registry.ts
- [x] T034 [US2] Create MCP bridge directory packages/claude-agent-sdk-adapter/src/mcp/
- [x] T035 [US2] Implement createAgentMarkMcpServer function in packages/claude-agent-sdk-adapter/src/mcp/agentmark-mcp-bridge.ts
- [x] T036 [US2] Implement toClaudeAgentMcpServer conversion in packages/claude-agent-sdk-adapter/src/mcp/agentmark-mcp-bridge.ts
- [x] T037 [US2] Implement hasTools utility function in packages/claude-agent-sdk-adapter/src/mcp/agentmark-mcp-bridge.ts
- [x] T038 [US2] Integrate tool registry with adapter in packages/claude-agent-sdk-adapter/src/adapter.ts
- [x] T039 [US2] Export tool registry and MCP utilities from packages/claude-agent-sdk-adapter/src/index.ts

**Checkpoint**: User Story 2 complete - custom tools can be registered and bridged to MCP

---

## Phase 5: User Story 3 - Configure Model Settings (Priority: P2)

**Goal**: Pattern-based model configuration with extended thinking support

**Independent Test**: Register model configs with regex patterns, request a matching model name, verify correct config including maxThinkingTokens is applied.

### Tests for User Story 3

- [x] T040 [P] [US3] Unit test for exact string model matching in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T041 [P] [US3] Unit test for regex pattern matching in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T042 [P] [US3] Unit test for array pattern matching in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T043 [P] [US3] Unit test for default pass-through registry in packages/claude-agent-sdk-adapter/test/agentmark.test.ts

### Implementation for User Story 3

- [x] T044 [US3] Implement ClaudeAgentModelRegistry class in packages/claude-agent-sdk-adapter/src/model-registry.ts
- [x] T045 [US3] Implement registerModels() chainable method with pattern support in packages/claude-agent-sdk-adapter/src/model-registry.ts
- [x] T046 [US3] Implement getModelConfig() with pattern matching logic in packages/claude-agent-sdk-adapter/src/model-registry.ts
- [x] T047 [US3] Implement hasModel() method in packages/claude-agent-sdk-adapter/src/model-registry.ts
- [x] T048 [US3] Implement static createDefault() factory in packages/claude-agent-sdk-adapter/src/model-registry.ts
- [x] T049 [US3] Integrate model registry with adapter for maxThinkingTokens in packages/claude-agent-sdk-adapter/src/adapter.ts
- [x] T050 [US3] Export model registry from packages/claude-agent-sdk-adapter/src/index.ts

**Checkpoint**: User Story 3 complete - model configurations with patterns working

---

## Phase 6: User Story 4 - Capture Execution Telemetry (Priority: P3)

**Goal**: Hook-based telemetry for all 8 event types with OpenTelemetry span emission

**Independent Test**: Configure telemetry hooks and OTEL hooks, verify events are captured for session lifecycle, tool use, and errors. Verify OpenTelemetry spans are emitted with correct hierarchy and GenAI semantic convention attributes.

### Part A: Basic Telemetry Hooks (Complete)

- [x] T051 [P] [US4] Unit test for createTelemetryHooks function in packages/claude-agent-sdk-adapter/test/hooks.test.ts
- [x] T052 [P] [US4] Unit test for mergeHooks function in packages/claude-agent-sdk-adapter/test/hooks.test.ts
- [x] T053 [P] [US4] Unit test for all 8 hook event types in packages/claude-agent-sdk-adapter/test/hooks.test.ts
- [x] T054 [P] [US4] Unit test for hook event handler callback in packages/claude-agent-sdk-adapter/test/hooks.test.ts
- [x] T055 [US4] Define TelemetryConfig interface in packages/claude-agent-sdk-adapter/src/types.ts
- [x] T056 [US4] Create hooks directory packages/claude-agent-sdk-adapter/src/hooks/
- [x] T057 [US4] Implement createTelemetryHooks function in packages/claude-agent-sdk-adapter/src/hooks/telemetry-hooks.ts
- [x] T058 [US4] Implement hook handlers for all 8 event types in packages/claude-agent-sdk-adapter/src/hooks/telemetry-hooks.ts
- [x] T059 [US4] Implement mergeHooks utility function in packages/claude-agent-sdk-adapter/src/hooks/telemetry-hooks.ts
- [x] T060 [US4] Integrate hooks with adapter options in packages/claude-agent-sdk-adapter/src/adapter.ts
- [x] T061 [US4] Export telemetry utilities from packages/claude-agent-sdk-adapter/src/index.ts

**Checkpoint**: Part A complete - basic telemetry hooks capturing all events

### Part B: OpenTelemetry Span Emission (FR-013 to FR-018) ✅ Complete

**Goal**: Emit OpenTelemetry spans from hooks following GenAI semantic conventions

**Acceptance Criteria** (from spec.md):
1. Root session span created on SessionStart, ended on SessionEnd/Stop (FR-013, FR-016)
2. Child tool spans created on PreToolUse, ended on PostToolUse/PostToolUseFailure (FR-013, FR-016)
3. Tool failure spans marked with ERROR status and exception details (FR-016)
4. Spans follow OTEL GenAI semantic conventions (FR-015)
5. Trace context propagated through hook callbacks (FR-017)
6. AgentMark-specific attributes for correlation (FR-018)

#### Dependencies Setup

- [x] T082 [US4] Add @opentelemetry/api as optional peer dependency in packages/claude-agent-sdk-adapter/package.json
- [x] T083 [P] [US4] Add @opentelemetry/sdk-trace-base as dev dependency in packages/claude-agent-sdk-adapter/package.json
- [x] T084 [P] [US4] Add @opentelemetry/exporter-trace-otlp-http as dev dependency in packages/claude-agent-sdk-adapter/package.json
- [x] T085 [US4] Run yarn install to update yarn.lock

#### Type Definitions

> **FR-014 Note**: Users provide a `TracerProvider` instance from their OpenTelemetry setup. The adapter creates a tracer with scope name `'agentmark'` for proper span normalization, giving users control over their observability infrastructure (OTLP endpoint, sampling, etc.).

- [x] T086 [P] [US4] Define OtelHooksConfig interface with tracer, promptName, model, userId, and additionalAttributes fields in packages/claude-agent-sdk-adapter/src/types.ts
- [x] T087 [P] [US4] Define TelemetryContext interface in packages/claude-agent-sdk-adapter/src/types.ts

#### Constants and Configuration

- [x] T088 [P] [US4] Create GenAIAttributes constant object with OTEL semantic convention attribute names in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
- [x] T089 [P] [US4] Create AgentMarkAttributes constant object with agentmark-specific attribute names in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
- [x] T090 [P] [US4] Create SpanNames constant object with standard span names in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts

#### Context Management

- [x] T091 [US4] Implement createTelemetryContext() factory function in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
- [x] T092 [US4] Implement getCommonAttributes() helper function for shared span attributes in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts

#### Hook Implementations

- [x] T093 [US4] Implement SessionStart hook callback to create root span in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
- [x] T094 [US4] Implement SessionEnd hook callback to end root span with usage attributes in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
- [x] T095 [US4] Implement PreToolUse hook callback to create child tool span in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
- [x] T096 [US4] Implement PostToolUse hook callback to end tool span with OK status in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
- [x] T097 [US4] Implement PostToolUseFailure hook callback to end tool span with ERROR status and record exception in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
- [x] T098 [US4] Implement Stop hook callback to end root span (handles Stop before SessionEnd case) in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
- [x] T099 [US4] Implement SubagentStart hook callback to create subagent span in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
- [x] T100 [US4] Implement SubagentStop hook callback to end subagent span in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts

#### Main Factory and Utilities

- [x] T101 [US4] Implement createOtelHooks() function that assembles all hooks and returns HooksConfig in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts
- [x] T102 [US4] Implement combineWithOtelHooks() utility to merge OTEL hooks with other hook configurations in packages/claude-agent-sdk-adapter/src/hooks/otel-hooks.ts

#### Exports

- [x] T103 [US4] Export OTEL hooks functions and types from packages/claude-agent-sdk-adapter/src/index.ts

#### Tests

- [x] T104 [P] [US4] Create mock tracer helper that captures spans for testing in packages/claude-agent-sdk-adapter/test/otel.test.ts
- [x] T105 [P] [US4] Add test: root session span created on SessionStart in packages/claude-agent-sdk-adapter/test/otel.test.ts
- [x] T106 [P] [US4] Add test: root session span ended on SessionEnd in packages/claude-agent-sdk-adapter/test/otel.test.ts
- [x] T107 [P] [US4] Add test: root session span ended on Stop (before SessionEnd) in packages/claude-agent-sdk-adapter/test/otel.test.ts
- [x] T108 [P] [US4] Add test: child tool span created on PreToolUse in packages/claude-agent-sdk-adapter/test/otel.test.ts
- [x] T109 [P] [US4] Add test: tool span ended with OK status on PostToolUse in packages/claude-agent-sdk-adapter/test/otel.test.ts
- [x] T110 [P] [US4] Add test: tool span ended with ERROR status on PostToolUseFailure in packages/claude-agent-sdk-adapter/test/otel.test.ts
- [x] T111 [P] [US4] Add test: exception recorded on tool failure in packages/claude-agent-sdk-adapter/test/otel.test.ts
- [x] T112 [P] [US4] Add test: GenAI semantic convention attributes present on spans in packages/claude-agent-sdk-adapter/test/otel.test.ts
- [x] T113 [P] [US4] Add test: AgentMark-specific attributes present on spans in packages/claude-agent-sdk-adapter/test/otel.test.ts
- [x] T114 [P] [US4] Add test: multiple tool spans maintain correct hierarchy in packages/claude-agent-sdk-adapter/test/otel.test.ts
- [x] T115 [P] [US4] Add test: combineWithOtelHooks() merges hooks correctly in packages/claude-agent-sdk-adapter/test/otel.test.ts
- [x] T116 [US4] Run full test suite and verify all tests pass with npm run test in packages/claude-agent-sdk-adapter/

**Checkpoint**: User Story 4 complete - both basic telemetry and OTEL span emission working

---

## Phase 7: User Story 5 - Get Structured Output (Priority: P3)

**Goal**: JSON schema-based structured output support

**Independent Test**: Create prompt with JSON schema, adapt with adaptObject(), verify outputFormat contains schema in options.

### Tests for User Story 5

- [x] T062 [P] [US5] Unit test for adaptObject method in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T063 [P] [US5] Unit test for JSON schema in outputFormat in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T064 [P] [US5] Unit test for ClaudeAgentObjectParams type inference in packages/claude-agent-sdk-adapter/test/agentmark.test.ts

### Implementation for User Story 5

- [x] T065 [US5] Define ClaudeAgentObjectParams generic interface in packages/claude-agent-sdk-adapter/src/types.ts
- [x] T066 [US5] Implement adaptObject method in ClaudeAgentAdapter in packages/claude-agent-sdk-adapter/src/adapter.ts
- [x] T067 [US5] Add outputFormat schema extraction logic in packages/claude-agent-sdk-adapter/src/adapter.ts
- [x] T068 [US5] Add test fixture for object prompt in packages/claude-agent-sdk-adapter/test/fixtures/

**Checkpoint**: User Story 5 complete - structured output with JSON schema working

---

## Phase 8: CLI Integration & Polish

**Purpose**: CLI webhook handler and cross-cutting concerns

### CLI Integration (FR-010)

- [x] T069 [P] Unit test for ClaudeAgentWebhookHandler in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T070 Implement ClaudeAgentWebhookHandler class in packages/claude-agent-sdk-adapter/src/runner.ts
- [x] T071 Implement runPrompt method in packages/claude-agent-sdk-adapter/src/runner.ts
- [x] T072 Implement runExperiment method in packages/claude-agent-sdk-adapter/src/runner.ts
- [x] T073 Configure dual export (index.ts and runner.ts) in packages/claude-agent-sdk-adapter/package.json

### Polish & Documentation

- [x] T074 [P] Add JSDoc comments to all public exports in packages/claude-agent-sdk-adapter/src/
- [x] T075 [P] Verify all types exported correctly from packages/claude-agent-sdk-adapter/src/index.ts
- [x] T076 Run full test suite and ensure all tests pass
- [x] T077 Build package and verify ESM/CJS dual output
- [x] T078 Validate quickstart.md examples compile correctly and verify SC-001 (setup in ≤5 lines of code)
- [x] T117 [P] Update quickstart.md with OTEL telemetry usage example in specs/005-claude-agent-sdk-adapter/quickstart.md
- [x] T118 Verify OTEL exports work correctly by checking dist/ output

### Edge Case Validation

- [x] T079 [P] Unit test for tool execution timeout handling in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T080 [P] Unit test for maxTurns exhaustion behavior in packages/claude-agent-sdk-adapter/test/agentmark.test.ts
- [x] T081 [P] Unit test for MCP connection failure graceful degradation in packages/claude-agent-sdk-adapter/test/mcp.test.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 (P1): No dependencies on other stories - START HERE
  - US2 (P2): Can run parallel to US1
  - US3 (P2): Can run parallel to US1, US2
  - US4 (P3): Can run parallel to US1, US2, US3
  - US5 (P3): Depends on US1 (adaptText pattern)
- **CLI & Polish (Phase 8)**: Depends on all user stories complete

### User Story Dependencies

```
Foundation (T007-T013)
       │
       ▼
    ┌──┴───────────────────────────────────┐
    │                                      │
    ▼                                      ▼
  US1 (T014-T025)                    US2 (T026-T039)
  Core Adapter                       Tool Registry
    │                                      │
    │                                      ▼
    │                              US3 (T040-T050)
    │                              Model Registry
    │                                      │
    ├──────────────────────────────────────┤
    │                                      │
    ▼                                      ▼
  US5 (T062-T068)                    US4 (T051-T061)
  Structured Output                  Telemetry Hooks
  (needs adaptText)
    │                                      │
    └──────────────────────────────────────┘
                      │
                      ▼
              CLI & Polish (T069-T078)
```

### Within Each User Story

- Tests FIRST (write and verify they fail)
- Types/interfaces before implementation
- Core logic before integration
- Export updates last

### Parallel Opportunities

**Setup (Phase 1)**:
```bash
# Run in parallel:
T003: Configure tsconfig.json
T004: Configure tsup
T005: Setup Vitest
T006: Configure ESLint
```

**Foundational (Phase 2)**:
```bash
# Run in parallel:
T009: ClaudeAgentAdapterOptions
T010: Hook types
T011: Model types
```

**All User Stories (after Foundation)**:
```bash
# Can run US1, US2, US3, US4 in parallel (different teams/sessions)
# US5 should wait for US1 completion
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T013)
3. Complete Phase 3: User Story 1 (T014-T025)
4. **STOP and VALIDATE**: Test adapter with basic text prompt
5. Package can be published with core functionality

### Incremental Delivery

1. Setup + Foundational → Package skeleton ready
2. Add US1 → Core adapter working (MVP)
3. Add US2 → Custom tools via MCP
4. Add US3 → Model configuration
5. Add US4 → Telemetry hooks
6. Add US5 → Structured output
7. Add CLI → Full feature parity

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (core adapter)
   - Developer B: User Story 2 (tool registry) + User Story 3 (model registry)
   - Developer C: User Story 4 (telemetry hooks)
3. After US1 complete: Developer A moves to US5
4. All integrate for CLI & Polish phase

---

## Summary

| Phase | Tasks | Parallel Tasks | Status |
|-------|-------|----------------|--------|
| Setup | 6 | 4 | ✅ Complete |
| Foundational | 7 | 3 | ✅ Complete |
| US1 (P1 MVP) | 12 | 4 | ✅ Complete |
| US2 (P2) | 14 | 4 | ✅ Complete |
| US3 (P2) | 11 | 4 | ✅ Complete |
| US4 Part A (Basic Hooks) | 11 | 4 | ✅ Complete |
| US4 Part B (OTEL Spans) | 35 | 17 | ✅ Complete |
| US5 (P3) | 7 | 3 | ✅ Complete |
| CLI & Polish | 12 | 4 | ✅ Complete |
| Edge Cases | 3 | 3 | ✅ Complete |
| **Total** | **118** | **50** | |

### OTEL Telemetry Tasks (Complete)

| Category | Task IDs | Count | Parallel |
|----------|----------|-------|----------|
| Dependencies | T082-T085 | 4 | 2 |
| Type Definitions | T086-T087 | 2 | 2 |
| Constants | T088-T090 | 3 | 3 |
| Context Mgmt | T091-T092 | 2 | 0 |
| Hook Impl | T093-T100 | 8 | 0 |
| Factory/Utils | T101-T102 | 2 | 0 |
| Exports | T103 | 1 | 0 |
| Tests | T104-T116 | 13 | 12 |
| **Total OTEL** | T082-T118 | 37 | 19 |

### Requirements Coverage (OTEL)

| Requirement | Tasks |
|-------------|-------|
| FR-013 (Emit OTEL spans) | T093-T101 |
| FR-014 (OTLP endpoint config) | T086, T091 |
| FR-015 (GenAI semantic conventions) | T088, T112 |
| FR-016 (End spans on events) | T094, T096-T098, T100 |
| FR-017 (Trace context propagation) | T091-T092 |
| FR-018 (Tool call attributes) | T089, T095, T113 |

---

## Notes

- [P] tasks = different files, no dependencies
- [USn] label maps task to specific user story
- Tests included per plan.md testing gates
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- Each story delivers testable increment
