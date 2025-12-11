# Tasks: Agentic Workflow Graph

**Input**: Design documents from `/specs/001-auto-graph-nodes/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Unit tests are included as specified in plan.md (Vitest for algorithms).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Package**: `packages/ui-components/` for frontend graph logic
- **Shared**: `packages/shared-utils/` for normalizer types
- **Tests**: `packages/ui-components/test/` for unit tests

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prerequisites and foundational type definitions

- [x] T001 Verify existing graph components are working in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/
- [x] T002 [P] Create WorkflowNode, WorkflowEdge, WorkflowGraphData interfaces in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/types.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Normalizer fix required for proper span grouping - MUST be complete before user stories

**CRITICAL**: The normalizer must assign tool names to span names for tool call spans

- [x] T003 Update normalizer to assign tool name to span.name for tool call spans in packages/shared-utils/src/normalizer/transformers/ai-sdk/index.ts
- [x] T004 [P] Create span grouping utilities (makeGroupKey, groupSpansByKey) in packages/ui-components/src/sections/traces/utils/span-grouping.ts
- [x] T005 [P] Create node type inference function (inferNodeType) in packages/ui-components/src/sections/traces/utils/span-grouping.ts

**Checkpoint**: Foundation ready - span grouping and type inference utilities available

---

## Phase 3: User Story 1 - View Agentic Workflow Graph (Priority: P1) - MVP

**Goal**: Display workflow graph automatically from trace data without manual graph.node.* metadata

**Independent Test**: Create a trace with [generateText, toolCall:search, generateText, toolCall:search, generateText] and verify graph shows 2 grouped nodes with bidirectional edges

### Tests for User Story 1

- [x] T006 [P] [US1] Unit test for span grouping algorithm in packages/ui-components/test/workflow-graph/span-grouping.test.ts
- [x] T007 [P] [US1] Unit test for edge generation algorithm in packages/ui-components/test/workflow-graph/workflow-graph-generator.test.ts

### Implementation for User Story 1

- [x] T008 [US1] Implement workflowGraphGenerator function (grouping + edge generation) in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/workflow-graph-generator.ts
- [x] T009 [US1] Implement edge generation algorithm with bidirectional detection in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/workflow-graph-generator.ts
- [x] T010 [US1] Add hasManualGraphMetadata check function in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/workflow-graph-generator.ts
- [x] T011 [US1] Update use-trace-graph.ts to call workflowGraphGenerator when no manual metadata in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/use-trace-graph.ts
- [x] T012 [US1] Add backward compatibility: prioritize manual graph.node.* metadata over auto-generation in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/use-trace-graph.ts

**Checkpoint**: User Story 1 complete - workflow graph displays automatically for traces without manual metadata

---

## Phase 4: User Story 2 - Navigate to Spans via Graph Nodes (Priority: P1)

**Goal**: Click on workflow node to navigate to corresponding span, with cycling through grouped spans

**Independent Test**: Click a node representing 3 spans multiple times and verify each click selects the next span in sequence

### Implementation for User Story 2

- [x] T013 [US2] Add spanIds array and currentSpanIndex to TraceNode data interface in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/types.ts
- [x] T014 [US2] Add nodeSpanIndex state tracking in trace-graph-canvas.tsx for click cycling in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-graph-canvas.tsx
- [x] T015 [US2] Implement onNodeClick handler with span cycling logic in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-graph-canvas.tsx
- [x] T016 [US2] Pass spanIds and onNodeClick to TraceNode component in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-graph-canvas.tsx
- [x] T017 [US2] Update TraceNode to handle click events and call onNodeClick in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-node.tsx
- [x] T018 [US2] Add position indicator display (e.g., "2/5") for multi-span nodes in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-node.tsx

**Checkpoint**: User Stories 1 AND 2 complete - graph displays and clicking nodes navigates to spans with position indicator

---

## Phase 5: User Story 3 - Nested Agent Subgraphs (Priority: P2)

**Goal**: Display nested agents as contained subgraphs within parent agent's graph

**Independent Test**: Create trace with parent agent A calling sub-agent B, verify B appears as container within A's graph

### Implementation for User Story 3

- [ ] T019 [US3] Add agent detection logic (spans with children that have LLM/tool children) in packages/ui-components/src/sections/traces/utils/span-grouping.ts
- [ ] T020 [US3] Extend WorkflowNode to support parentNode for React Flow hierarchy in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/types.ts
- [ ] T021 [US3] Update workflowGraphGenerator to set parentNode for nested agent children in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/workflow-graph-generator.ts
- [ ] T022 [US3] Update use-graph-data.ts to apply dagre layout within parent bounds in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/use-graph-data.ts
- [ ] T023 [US3] Add container styling for agent nodes in packages/ui-components/src/sections/traces/utils/node-styling.ts

**Checkpoint**: User Stories 1, 2, AND 3 complete - nested agents render as visual containers

---

## Phase 6: User Story 4 - Automatic Node Type Detection (Priority: P2)

**Goal**: Nodes display appropriate icons and colors based on operation type (llm, tool, agent)

**Independent Test**: Create spans with GENERATION type, toolCalls, and nested children - verify correct icons appear

### Implementation for User Story 4

- [x] T024 [P] [US4] Add type detection mapping to existing NODE_STYLES in packages/ui-components/src/sections/traces/utils/node-styling.ts
- [x] T025 [US4] Update TraceNode to use inferred nodeType for icon/color selection in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-node.tsx
- [x] T026 [US4] Ensure inferNodeType handles edge cases (no name, no type) with fallback to "default" in packages/ui-components/src/sections/traces/utils/span-grouping.ts

**Checkpoint**: User Stories 1, 2, 3, AND 4 complete - nodes have correct visual styling

---

## Phase 7: User Story 5 - Span Count Badge (Priority: P3)

**Goal**: Display count badge (×N) for nodes representing 2+ spans

**Independent Test**: Create node with 5 spans and verify "×5" badge displays; create node with 1 span and verify no badge

### Implementation for User Story 5

- [x] T027 [US5] Add Badge component import and styling in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-node.tsx
- [x] T028 [US5] Implement conditional badge rendering (show only when spanIds.length >= 2) in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-node.tsx
- [x] T029 [US5] Position badge at top-right corner of node with appropriate z-index in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-node.tsx

**Checkpoint**: All core user stories complete - full workflow graph feature implemented

---

## Phase 8: Accessibility & UX Enhancements

**Goal**: Add loading/empty states and keyboard navigation per FR-017/FR-018/FR-019

**Independent Test**: Tab to focus graph, use arrow keys to navigate, Enter to select; verify loading skeleton and "No workflow data" states

### Implementation for Accessibility

- [x] T030 Add GraphLoadingState type and loading state management in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-graph-canvas.tsx
- [x] T031 Implement loading skeleton component for graph processing in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-graph-canvas.tsx
- [x] T032 Implement empty state "No workflow data" message in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-graph-canvas.tsx
- [x] T033 Add tabIndex={0} and nodesFocusable={true} to ReactFlow for Tab navigation in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-graph-canvas.tsx
- [x] T034 Implement onKeyDown handler for arrow key navigation between nodes in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-graph-canvas.tsx
- [x] T035 Implement Enter key to select/activate currently focused node in packages/ui-components/src/sections/traces/trace-drawer/trace-graph/trace-graph-canvas.tsx

**Checkpoint**: Full accessibility support - keyboard navigation and loading states working

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Testing, documentation, and final validation

- [x] T036 [P] Add mock workflow graph data to packages/ui-components/src/stories/mocks/traces.ts
- [ ] T037 [P] Create WorkflowGraph.stories.tsx for Storybook visual testing in packages/ui-components/src/stories/WorkflowGraph.stories.tsx
- [x] T038 Run full test suite with npm test
- [x] T039 Run linting with npm run lint and fix any issues
- [ ] T040 Validate quickstart.md scenarios manually

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 and US2 are both P1 - complete US1 first as foundation
  - US3 and US4 are both P2 - can proceed in parallel after US1/US2
  - US5 is P3 - complete after US3/US4
- **Accessibility (Phase 8)**: Can run after core user stories, but before final polish
- **Polish (Phase 9)**: Depends on all user stories and accessibility being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories - **MVP**
- **User Story 2 (P1)**: Depends on US1 (needs graph nodes to exist for clicking)
- **User Story 3 (P2)**: Can start after US1 - independent hierarchy feature
- **User Story 4 (P2)**: Can start after US1 - independent styling feature
- **User Story 5 (P3)**: Can start after US1 - independent badge feature
- **Accessibility**: Can start after US2 - enhances navigation experience

### Within Each User Story

- Tests MUST be written and FAIL before implementation (for US1)
- Types/utilities before main implementation
- Core logic before UI integration
- Story complete before moving to next priority

### Parallel Opportunities

- T002 (types) can run in parallel with T001 (verification)
- T004, T005 (span utilities) can run in parallel after T003
- T006, T007 (tests) can run in parallel before US1 implementation
- T024 (styling) can run in parallel with other US4 tasks
- T036, T037 (docs/stories) can run in parallel
- US3, US4, US5 can all run in parallel after US1/US2 complete

---

## Parallel Example: User Story 1

```bash
# Launch tests for User Story 1 together:
Task: "Unit test for span grouping algorithm in packages/ui-components/test/workflow-graph/span-grouping.test.ts"
Task: "Unit test for edge generation algorithm in packages/ui-components/test/workflow-graph/workflow-graph-generator.test.ts"
```

## Parallel Example: Foundational Phase

```bash
# After T003 (normalizer fix), launch utilities in parallel:
Task: "Create span grouping utilities in packages/ui-components/src/sections/traces/utils/span-grouping.ts"
Task: "Create node type inference function in packages/ui-components/src/sections/traces/utils/span-grouping.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (auto-graph generation)
4. Complete Phase 4: User Story 2 (click navigation)
5. **STOP and VALIDATE**: Test US1 + US2 independently
6. Deploy/demo if ready - users can view and navigate workflow graphs

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test → Deploy (basic graph view)
3. Add User Story 2 → Test → Deploy (click navigation)
4. Add User Story 3 + 4 → Test → Deploy (visual enhancements)
5. Add User Story 5 → Test → Deploy (badges)
6. Polish phase → Final release

### Single Developer Strategy

1. Complete phases sequentially: Setup → Foundational → US1 → US2 → US3 → US4 → US5 → Polish
2. Validate each story checkpoint before proceeding
3. Can stop after US1+US2 for MVP

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD for US1)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Frontend-only implementation - no backend changes required
- Test on both CLI (SQLite) and Cloud (ClickHouse) platforms
