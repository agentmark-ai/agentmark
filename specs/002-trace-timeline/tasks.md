# Tasks: Trace Timeline View

**Input**: Design documents from `/specs/002-trace-timeline/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, quickstart.md ✓

**Tests**: Not explicitly requested in the feature specification. Tests are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/ui-components/src/` for source, `packages/ui-components/test/` for tests
- **Timeline location**: `packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for timeline feature

- [x] T001 Create trace-timeline directory structure at packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/
- [x] T002 [P] Create timeline-types.ts with TypeScript interfaces (TimelineBarLayout, TimelineViewState, TimelineMetrics, TimelineRulerTick, TIMELINE_CONSTANTS) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-types.ts
- [x] T003 [P] Create index.ts barrel export file in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core hooks that ALL user stories depend on - MUST complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement useTimelineLayout hook with depth-first traversal algorithm to compute TimelineBarLayout[] from SpanData[] in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/use-timeline-layout.ts
- [x] T005 Add ruler tick calculation to useTimelineLayout (TimelineRulerTick[]) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/use-timeline-layout.ts
- [x] T006 Add metrics calculation to useTimelineLayout (TimelineMetrics) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/use-timeline-layout.ts
- [x] T007 [P] Implement useTimelineZoom hook with SVG viewBox state management (zoom, pan, reset) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/use-timeline-zoom.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - View Span Execution Timeline (Priority: P1) 🎯 MVP

**Goal**: Display spans as horizontal bars positioned by start time with widths proportional to duration

**Independent Test**: Open any trace with multiple spans and verify timeline accurately represents span timing relationships

### Implementation for User Story 1

- [x] T008 [P] [US1] Create TimelineBar component rendering a single span bar (rect with x, width, y from layout) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-bar.tsx
- [x] T009 [P] [US1] Create TimelineRuler component rendering time axis with tick marks in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-ruler.tsx
- [x] T010 [US1] Create TraceTimeline main container component with SVG viewport, mapping layouts to TimelineBar components in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx
- [x] T011 [US1] Integrate TimelineRuler into TraceTimeline showing trace time range in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx
- [x] T012 [US1] Handle concurrent spans (siblings with overlapping time) on separate rows with correct time alignment in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/use-timeline-layout.ts
- [x] T013 [US1] Handle sequential spans without overlap, showing handoff between operations in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/use-timeline-layout.ts
- [x] T014 [US1] Export TraceTimeline and hooks from index.ts in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/index.ts

**Checkpoint**: User Story 1 complete - timeline displays spans with correct timing positions

---

## Phase 4: User Story 2 - Identify Performance Bottlenecks (Priority: P1)

**Goal**: Visually highlight slow spans and show hierarchical relationships through nesting

**Independent Test**: View a trace with one unusually slow span and verify it stands out visually

### Implementation for User Story 2

- [x] T015 [P] [US2] Add visual prominence for proportionally large spans (slow operations visible due to bar width) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-bar.tsx
- [x] T016 [US2] Implement depth-based indentation for child spans showing call hierarchy in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-bar.tsx
- [x] T017 [US2] Add error status visual distinction (different color/indicator) for failed spans using hasError from layout in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-bar.tsx
- [x] T018 [US2] Integrate inferNodeType() from utils/span-grouping.ts and getNodeTypeStyle() from utils/node-styling.ts for span type detection in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/use-timeline-layout.ts

**Checkpoint**: User Story 2 complete - bottlenecks and errors are visually identifiable

---

## Phase 5: User Story 3 - Navigate Between Timeline and Span Details (Priority: P2)

**Goal**: Click spans to view details and sync selection with TraceTree sidebar

**Independent Test**: Click a span in timeline and verify detail panel updates correctly

### Implementation for User Story 3

- [x] T019 [US3] Add onClick handler to TimelineBar calling onSelectSpan callback in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-bar.tsx
- [x] T020 [US3] Add selectedSpanId prop to TraceTimeline and pass to TimelineBar for visual highlighting in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx
- [x] T021 [US3] Style selected span bar with highlight/border in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-bar.tsx
- [x] T022 [US3] Implement scroll-to-selected behavior when selection changes from external source (TraceTree) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx
- [x] T023 [US3] Integrate with TraceDrawerContext for shared selection state in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx

**Checkpoint**: User Story 3 complete - selection syncs between timeline, TraceTree, and detail panel

---

## Phase 6: User Story 4 - Understand Time Distribution by Operation Type (Priority: P2)

**Goal**: Color-code spans by type with legend and show duration tooltips

**Independent Test**: View trace with multiple span types and verify visual differentiation

### Implementation for User Story 4

- [x] T024 [P] [US4] Create TimelineLegend component showing span type colors (llm, tool, agent, etc.) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-legend.tsx
- [x] T025 [P] [US4] Create TimelineTooltip component showing span name, duration, start time, and percentage of trace in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-tooltip.tsx
- [x] T026 [US4] Apply nodeType-based coloring to TimelineBar using getNodeTypeStyle() in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-bar.tsx
- [x] T027 [US4] Add onMouseEnter/onMouseLeave handlers to TimelineBar for tooltip display in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-bar.tsx
- [x] T028 [US4] Integrate TimelineTooltip into TraceTimeline with hover state management in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx
- [x] T029 [US4] Integrate TimelineLegend into TraceTimeline with showLegend prop in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx

**Checkpoint**: User Story 4 complete - spans are color-coded with legend and tooltips show timing details

---

## Phase 7: User Story 5 - Zoom and Pan Long Traces (Priority: P3)

**Goal**: Enable zoom/pan controls for navigating large traces

**Independent Test**: Test with a trace spanning 10+ seconds with 50+ spans

### Implementation for User Story 5

- [x] T030 [US5] Add mouse wheel zoom handler (adjust viewBox width around cursor) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/use-timeline-zoom.ts
- [x] T031 [US5] Add drag-to-pan handlers (adjust viewBox x/y) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/use-timeline-zoom.ts
- [x] T032 [US5] Add "fit all" reset control (double-click or button) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/use-timeline-zoom.ts
- [x] T033 [US5] Integrate useTimelineZoom into TraceTimeline SVG (viewBox, onWheel, panHandlers) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx
- [x] T034 [US5] Add zoom controls UI (zoom in/out buttons, reset button) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx
- [x] T035 [US5] Implement virtualization for traces with 1000+ spans (render only visible rows) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx

**Checkpoint**: User Story 5 complete - users can zoom/pan and large traces render efficiently

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, accessibility, and integration improvements

### Edge Cases & Loading States

- [x] T036 [P] Handle single-span trace (display full-width bar with duration label) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx
- [x] T037 [P] Handle zero-duration spans (display as thin vertical line or minimum-width bar) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-bar.tsx
- [x] T038 [P] Handle negative duration spans (display minimum-width bar with warning indicator) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-bar.tsx
- [x] T039 [P] Handle missing parent spans (display at root level with indicator) in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/use-timeline-layout.ts
- [x] T040 [P] Add loading skeleton state while layout is being calculated in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx
- [x] T041 [P] Add empty state "No spans to display" message in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx

### Accessibility (FR-018 to FR-020)

- [x] T042 Add tabIndex and role="grid" for keyboard focus to timeline container in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx
- [x] T043 Implement arrow key navigation between spans when timeline is focused in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx
- [x] T044 Add Enter key handler to select currently focused span in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/trace-timeline.tsx
- [x] T045 Add aria-labels to TimelineBar components for screen readers in packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/timeline-bar.tsx

### Integration with TraceDrawer

- [x] T046 Add view toggle UI (graph/timeline) in TraceDrawer sidebar header in packages/ui-components/src/sections/traces/trace-drawer/
- [x] T047 Implement localStorage persistence for user view preference in packages/ui-components/src/sections/traces/trace-drawer/
- [x] T048 Update trace-drawer barrel exports to include TraceTimeline in packages/ui-components/src/sections/traces/trace-drawer/index.ts

### Final Validation

- [x] T049 Run quickstart.md validation scenarios in packages/ui-components/
- [x] T050 Verify color consistency between timeline and workflow graph views

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 and US2 are both P1, can run in parallel after Foundational
  - US3 and US4 are both P2, can run in parallel after US1/US2
  - US5 (P3) can start after Foundational but depends on TraceTimeline from US1
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - Creates TraceTimeline base
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Enhances TimelineBar styling
- **User Story 3 (P2)**: Depends on TraceTimeline from US1 - Adds selection
- **User Story 4 (P2)**: Depends on TimelineBar from US1/US2 - Adds tooltips/legend
- **User Story 5 (P3)**: Depends on TraceTimeline from US1 - Adds zoom/pan

### Within Each User Story

- Models/types before components
- Hooks before components that use them
- Core components before integration
- Story complete before moving to next priority

### Parallel Opportunities

- T002, T003 can run in parallel (Phase 1)
- T007 can run in parallel with T004-T006 (Phase 2)
- T008, T009 can run in parallel (Phase 3)
- T024, T025 can run in parallel (Phase 6)
- T036-T041 can all run in parallel (Phase 8 edge cases)
- After Foundational: US1 and US2 can be worked on in parallel

---

## Parallel Example: User Story 1

```bash
# Launch TimelineBar and TimelineRuler together:
Task: "T008 [P] [US1] Create TimelineBar component..."
Task: "T009 [P] [US1] Create TimelineRuler component..."

# Then sequentially: TraceTimeline depends on both
Task: "T010 [US1] Create TraceTimeline main container..."
```

## Parallel Example: Phase 8 Edge Cases

```bash
# All edge case handlers can run in parallel:
Task: "T036 [P] Handle single-span trace..."
Task: "T037 [P] Handle zero-duration spans..."
Task: "T038 [P] Handle negative duration spans..."
Task: "T039 [P] Handle missing parent spans..."
Task: "T040 [P] Add loading skeleton state..."
Task: "T041 [P] Add empty state message..."
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 - Basic timeline display
4. Complete Phase 4: User Story 2 - Bottleneck visualization
5. **STOP and VALIDATE**: Test timeline displays spans with correct timing and highlighting
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 + 2 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 3 → Selection works → Deploy/Demo
4. Add User Story 4 → Tooltips/legend work → Deploy/Demo
5. Add User Story 5 → Zoom/pan works → Deploy/Demo
6. Complete Polish → Edge cases handled → Final release

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (TraceTimeline container)
   - Developer B: User Story 2 (TimelineBar styling)
3. After US1/US2:
   - Developer A: User Story 3 (Selection)
   - Developer B: User Story 4 (Tooltips/Legend)
4. User Story 5 and Polish can follow

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Reuse from 001-auto-graph-nodes: `inferNodeType()`, `getNodeTypeStyle()`, `SpanData`, `TraceDrawerContext`, `WorkflowNodeType`
- No new external dependencies required - uses React, MUI, existing utilities
