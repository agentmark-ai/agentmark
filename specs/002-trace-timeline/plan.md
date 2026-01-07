# Implementation Plan: Trace Timeline View

**Branch**: `002-trace-timeline` | **Date**: 2026-01-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-trace-timeline/spec.md`

## Summary

Implement a waterfall/timeline visualization for trace spans within the existing TraceDrawer component. The timeline displays spans as horizontal bars positioned by start time and sized by duration, enabling rapid identification of performance bottlenecks and parallel/sequential execution patterns. Complements the existing workflow graph (001-auto-graph-nodes) by showing timing rather than execution flow.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: React 19.1.0, MUI 7.x, @xyflow/react 12.9.0, dagre 0.8.5
**Storage**: N/A (frontend-only transformation; reads existing span data)
**Testing**: Vitest with React Testing Library
**Target Platform**: Web (Next.js), works with both CLI (SQLite) and Cloud (ClickHouse)
**Project Type**: Turborepo monorepo - packages/ui-components + packages/cli
**Performance Goals**: < 2 seconds render for 100 spans, 60fps pan/zoom interactions
**Constraints**: Must work with both SQLite (CLI) and ClickHouse (Cloud) backends

## Project Structure

### Documentation (this feature)

```text
specs/002-trace-timeline/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Research decisions
├── data-model.md        # TypeScript interfaces
├── contracts/           # Component prop interfaces
├── quickstart.md        # Developer guide
└── tasks.md             # Implementation tasks
```

### Source Code (repository root)

```text
packages/ui-components/
├── src/
│   └── sections/traces/
│       └── trace-drawer/
│           ├── trace-graph/           # Existing workflow graph (001)
│           └── trace-timeline/        # NEW: Timeline view (002)
│               ├── trace-timeline.tsx
│               ├── timeline-bar.tsx
│               ├── timeline-ruler.tsx
│               ├── timeline-tooltip.tsx
│               ├── timeline-legend.tsx
│               ├── use-timeline-layout.ts
│               ├── use-timeline-zoom.ts
│               ├── timeline-types.ts
│               └── index.ts
└── test/
    └── trace-timeline/
        ├── trace-timeline.test.tsx
        ├── use-timeline-layout.test.ts
        └── use-timeline-zoom.test.ts
```

**Structure Decision**: Timeline component lives in `packages/ui-components/src/sections/traces/trace-drawer/trace-timeline/` as a sibling to the existing `trace-graph/` directory, following the pattern established by 001-auto-graph-nodes.

## Reusable Components from 001-auto-graph-nodes

| Component/Function | Location | Reuse in Timeline |
|-------------------|----------|-------------------|
| `inferNodeType()` | `utils/span-grouping.ts` | Detect span type for colors |
| `getNodeTypeStyle()` | `utils/node-styling.ts` | Get color/icon by type |
| `SpanData` interface | `types/index.ts` | Span data structure |
| `TraceDrawerContext` | `trace-drawer/` | Shared selection state |
| `WorkflowNodeType` | `utils/span-grouping.ts` | Type enum for span classification |

## Key Differences from 001-auto-graph-nodes

| Aspect | Workflow Graph (001) | Timeline (002) |
|--------|---------------------|----------------|
| Library | @xyflow/react + dagre | Pure SVG + custom hooks |
| Layout | DAG node positioning | Linear time axis + tree rows |
| Grouping | Spans grouped by name | Individual span per bar |
| Interactions | Click cycles through group | Click selects single span |

## Tab-Based Layout Pattern

Following industry standards (Jaeger, Datadog, LangSmith), the TraceDrawer uses a **tab-based layout** where Timeline, Graph, and Details are separate full-width views:

```
┌─────────────────────────────────────────────────────────────┐
│ Trace Drawer Header                                         │
├────────────┬────────────────────────────────────────────────┤
│            │ [Timeline] [Graph] [Details]  ← Tab navigation │
│ TraceTree  │────────────────────────────────────────────────│
│ (always    │                                                │
│  visible   │  Full-width content based on selected tab      │
│  for nav)  │                                                │
└────────────┴────────────────────────────────────────────────┘
```

**Design Rationale**:
- Timeline needs horizontal space to show duration bars meaningfully
- Graph and Timeline serve different purposes (flow vs. timing) and don't need to be viewed simultaneously
- Tab-based layout follows observability industry patterns (Jaeger, Datadog)
- TraceTree remains visible for navigation regardless of selected view

**Implementation Components**:
- `useTimelineViewPreference` hook: Manages tab state with localStorage persistence
- MUI `Tabs` component: Tab navigation UI
- Conditional rendering: Shows Timeline, Graph, or SpanInfo based on active tab
- Click-to-details: Selecting a span in Timeline or Graph auto-switches to Details tab
