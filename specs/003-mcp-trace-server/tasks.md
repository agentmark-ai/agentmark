# Tasks: MCP Trace Server

**Input**: Design documents from `/specs/003-mcp-trace-server/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are included as the existing codebase uses vitest for testing.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Package location**: `packages/mcp-server/`
- **Source**: `packages/mcp-server/src/`
- **Tests**: `packages/mcp-server/test/`

---

## Phase 1: Setup

**Purpose**: Verify existing project structure and dependencies

- [x] T001 Verify existing package structure at packages/mcp-server/package.json
- [x] T002 [P] Verify TypeScript config at packages/mcp-server/tsconfig.json
- [x] T003 [P] Run existing tests to confirm baseline with `npm test` in packages/mcp-server/

**Checkpoint**: Existing codebase validated, ready for extensions

---

## Phase 2: Foundational (Type System Extensions)

**Purpose**: Core type definitions that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Add SpanFilter type to packages/mcp-server/src/data-source/types.ts
- [x] T005 Add GetSpansOptions type to packages/mcp-server/src/data-source/types.ts
- [x] T006 Add PaginatedResult<T> type to packages/mcp-server/src/data-source/types.ts
- [x] T007 Add ErrorResponse type with error codes to packages/mcp-server/src/data-source/types.ts
- [x] T008 Add ComparisonOperator type enum to packages/mcp-server/src/data-source/types.ts
- [x] T009 Update DataSource interface with getSpans(options: GetSpansOptions) signature in packages/mcp-server/src/data-source/types.ts
- [x] T010 ~~Extend DataSource interface with searchSpans method~~ (Consolidated into T009 - getSpans handles filtering)
- [x] T011 Export new types from packages/mcp-server/src/index.ts

**Checkpoint**: Foundation ready - type system complete, user story implementation can begin

---

## Phase 3: User Story 1 - Filter Spans by Attribute (Priority: P1) 🎯 MVP

**Goal**: Enable developers to filter spans within a trace using any attribute with AND logic and comparison operators

**Independent Test**: Invoke `get_spans` MCP tool with filters like `status = "2"` (errors) and `duration > 1000` (slow), verify matching spans returned

### Tests for User Story 1

- [x] T012 [P] [US1] Add getSpans with filters unit tests in packages/mcp-server/test/http-data-source.test.ts
- [x] T013 [P] [US1] Add get_spans tool integration test in packages/mcp-server/test/server.test.ts

### Implementation for User Story 1

- [x] T014 [US1] Implement getSpans method with filtering in packages/mcp-server/src/data-source/http-data-source.ts
- [x] T015 [US1] Add filter evaluation logic for comparison operators (eq, gt, gte, lt, lte, contains) in packages/mcp-server/src/data-source/http-data-source.ts
- [x] T016 [US1] Add field path resolution for nested attributes (e.g., data.type, data.model) in packages/mcp-server/src/data-source/http-data-source.ts
- [x] T017 [US1] Create Zod schema for SpanFilter in packages/mcp-server/src/server.ts
- [x] T018 [US1] Register get_spans MCP tool with filters parameter in packages/mcp-server/src/server.ts
- [x] T019 [US1] Add input validation and error handling for get_spans tool in packages/mcp-server/src/server.ts

**Checkpoint**: get_spans tool functional - can filter by any attribute with multiple filters

---

## Phase 4: User Story 2 - Filter Spans by Custom Attributes (Priority: P1)

**Goal**: Enable developers to filter spans using custom attributes like data.type, data.model

**Independent Test**: Invoke `get_spans` MCP tool with filter `data.type = "GENERATION"`, verify only LLM spans returned

### Tests for User Story 2

- [x] T020 [P] [US2] Add getSpans with nested attribute filters unit tests in packages/mcp-server/test/http-data-source.test.ts
- [x] T021 [P] [US2] Add get_spans custom attribute filter integration test in packages/mcp-server/test/server.test.ts

### Implementation for User Story 2

- [x] T022 [US2] ~~Implement searchSpans method~~ (Consolidated into getSpans - same method handles all filters)
- [x] T023 [US2] Ensure traceId is required parameter for get_spans in packages/mcp-server/src/server.ts
- [x] T024 [US2] ~~Create Zod schema for SearchSpansInput~~ (Uses SpanFilter schema from T017)
- [x] T025 [US2] ~~Register search_spans MCP tool~~ (Consolidated into get_spans tool)
- [x] T026 [US2] Add server-side filter mapping for supported fields (type, status, name, model) in packages/mcp-server/src/data-source/http-data-source.ts

**Checkpoint**: get_spans tool can filter by custom metadata attributes using dot notation

---

## Phase 5: User Story 6 - Paginate Span Results (Priority: P1)

**Goal**: Enable cursor-based pagination for get_spans operations

**Independent Test**: Call get_spans with limit=10, verify cursor returned, use cursor to get next page, verify no duplicates

### Tests for User Story 6

- [x] T027 [P] [US6] Add pagination unit tests for getSpans in packages/mcp-server/test/http-data-source.test.ts
- [x] T028 [P] [US6] Add pagination with filters unit tests in packages/mcp-server/test/http-data-source.test.ts

### Implementation for User Story 6

- [x] T029 [US6] Implement cursor encoding (Base64 JSON with offset) in packages/mcp-server/src/data-source/http-data-source.ts
- [x] T030 [US6] Implement cursor decoding and validation in packages/mcp-server/src/data-source/http-data-source.ts
- [x] T031 [US6] Add hasMore calculation to getSpans response in packages/mcp-server/src/data-source/http-data-source.ts
- [x] T032 [US6] ~~Add hasMore to searchSpans~~ (Consolidated into getSpans)
- [x] T033 [US6] Update list_traces to return pagination metadata (hasMore indicator) in packages/mcp-server/src/server.ts

**Checkpoint**: get_spans supports cursor-based pagination with hasMore metadata

---

## Phase 6: User Stories 3 & 4 - Existing Tools Enhancement (Priority: P2)

**Goal**: Enhance existing get_trace and list_traces tools with improved error handling

**Independent Test**: Request non-existent trace ID, verify structured error response with code and message

### Implementation for User Stories 3 & 4

- [x] T034 [US3] Update get_trace error response to use ErrorResponse format in packages/mcp-server/src/server.ts
- [x] T035 [US4] Update list_traces to use consistent response format in packages/mcp-server/src/server.ts
- [x] T036 [P] [US3] Add structured error handling test for get_trace in packages/mcp-server/test/server.test.ts
- [x] T037 [P] [US4] Add list_traces response format test in packages/mcp-server/test/server.test.ts

**Checkpoint**: All existing tools have consistent error handling and response formats

---

## Phase 7: User Story 5 - Debug Traces with AI Agent (Priority: P1)

**Goal**: Ensure end-to-end AI agent debugging workflow works with all tools

**Independent Test**: Start MCP server, connect AI agent, run sequence: list_traces → search_traces → get_trace → search_spans

### Implementation for User Story 5

- [x] T038 [US5] Add graceful degradation for connection failures in packages/mcp-server/src/data-source/http-data-source.ts
- [x] T039 [US5] Add timeout handling with configurable limits in packages/mcp-server/src/data-source/http-data-source.ts
- [x] T040 [US5] Update config.ts to use AGENTMARK_URL and AGENTMARK_API_KEY env vars in packages/mcp-server/src/config.ts
- [x] T041 [US5] Add auth header to requests when AGENTMARK_API_KEY is present in packages/mcp-server/src/data-source/http-data-source.ts
- [x] T042 [US5] Add MCP server setup instructions to create-agentmark generated README in packages/create-agentmark/
- [x] T043 [P] [US5] Add end-to-end workflow test in packages/mcp-server/test/server.test.ts

**Checkpoint**: Full AI agent debugging workflow functional from init to debug

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and final quality checks

- [x] T044 [P] Update README.md with search tools documentation in packages/mcp-server/README.md
- [x] T045 [P] Add JSDoc comments to all public functions in packages/mcp-server/src/
- [x] T046 Run full test suite and fix any failures
- [x] T047 Run linting and fix any issues with `npm run lint` in packages/mcp-server/
- [x] T048 Validate quickstart.md scenarios work correctly
- [x] T049 [P] Update package.json version for release in packages/mcp-server/package.json (v0.1.0)

---

## Consolidation Note

### Data Source Consolidation

The data source implementation was consolidated into a single `HttpDataSource` class that works for both local development and AM Cloud:

- **File**: `packages/mcp-server/src/data-source/http-data-source.ts`
- **Rationale**: Same API interface for local and cloud - only URL and auth differ
- **Configuration**: `AGENTMARK_URL` for endpoint, `AGENTMARK_API_KEY` for cloud auth

### Tool Consolidation

The original spec called for 4 MCP tools, but implementation was simplified to 3 tools:

| Original Spec | Final Implementation |
|---------------|----------------------|
| `search_traces` | ❌ Removed (over-engineered for debugging use case) |
| `search_spans` | ❌ Removed (consolidated into `get_spans`) |
| `get_trace` | ✅ Kept (trace summary) |
| `list_traces` | ✅ Kept (find traces) |
| `get_spans` (basic) | ✅ Enhanced with filters and pagination |

**Rationale**: For debugging traces, you need:
1. `list_traces` - find traces to debug (by session or dataset run)
2. `get_trace` - get trace summary (status, latency, cost)
3. `get_spans` with filters - find errors (`status=2`), slow spans (`duration>X`), specific types (`data.type=GENERATION`)

Cross-trace search is supported by calling `get_spans` without a `traceId` parameter.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - validation only
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phases 3-7)**: All depend on Foundational phase completion
  - US1 (search_traces) can start after Phase 2
  - US2 (search_spans) can start after Phase 2 (parallel with US1)
  - US6 (pagination) depends on US1 and US2 search implementations
  - US3/US4 (enhancements) can start after Phase 2 (parallel)
  - US5 (e2e) depends on US1, US2, US6 completion
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 2 (Foundational)
    │
    ├──► US1 (search_traces) ──┐
    │                          ├──► US6 (pagination) ──► US5 (e2e)
    ├──► US2 (search_spans) ───┘
    │
    └──► US3/US4 (enhancements) ─────────────────────────────────►
```

### Within Each User Story

- Tests FIRST, implementation follows
- DataSource methods before MCP tool registration
- Core implementation before validation/error handling

### Parallel Opportunities

- T002, T003 can run in parallel (Setup)
- T012, T013 can run in parallel (US1 tests)
- T020, T021 can run in parallel (US2 tests)
- T027, T028 can run in parallel (US6 tests)
- T036, T037 can run in parallel (US3/US4 tests)
- T044, T045, T049 can run in parallel (Polish)
- US1 and US2 can be worked on in parallel after Phase 2
- US3/US4 can be worked on in parallel with US1/US2

---

## Parallel Example: User Stories 1 & 2

```bash
# After Phase 2 completes, launch US1 and US2 in parallel:

# Team Member A - User Story 1:
Task: T012 [US1] Add searchTraces unit tests
Task: T013 [US1] Add search_traces tool integration test
Task: T014 [US1] Implement searchTraces method
# ... continue US1 tasks

# Team Member B - User Story 2:
Task: T020 [US2] Add searchSpans unit tests
Task: T021 [US2] Add search_spans tool integration test
Task: T022 [US2] Implement searchSpans method
# ... continue US2 tasks
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (verify baseline)
2. Complete Phase 2: Foundational (type system)
3. Complete Phase 3: User Story 1 (search_traces)
4. **STOP and VALIDATE**: Test search_traces independently
5. Can deploy/demo search_traces functionality

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 (search_traces) → Test → Demo (MVP!)
3. Add User Story 2 (search_spans) → Test → Demo
4. Add User Story 6 (pagination) → Test → Demo
5. Add User Story 5 (e2e integration) → Test → Demo
6. Polish and release

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (search_traces)
   - Developer B: User Story 2 (search_spans)
3. After US1 + US2 complete:
   - Developer A: User Story 6 (pagination)
   - Developer B: User Story 3/4 (enhancements)
4. Both converge on User Story 5 (e2e) and Polish

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- **Implementation Consolidation**: Original spec called for `search_traces` and `search_spans` tools. These were consolidated into an enhanced `get_spans` tool with filtering and pagination. This provides the same debugging capability (find errors, slow spans, filter by any attribute) with a simpler 3-tool API.
- **Final Tool Set**: `list_traces` (find traces), `get_trace` (trace summary), `get_spans` (spans with filtering + pagination)
- Config uses env vars: `AGENTMARK_URL` (required), `AGENTMARK_API_KEY` (optional for auth)
- HttpDataSource handles both local CLI (localhost:9418) and AM Cloud
- 71 tests passing across server.test.ts and http-data-source.test.ts
