# Implementation Plan: Agentic Workflow Graph

**Branch**: `001-auto-graph-nodes` | **Date**: 2025-12-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-auto-graph-nodes/spec.md`

## Summary

Automatically generate workflow graph nodes by grouping spans with the same name under the same parent, creating edges based on execution order transitions. This eliminates the need for manual `graph.node.*` metadata while providing an agentic workflow visualization that shows execution patterns (e.g., "LLM → tool → LLM loop"). Implementation is frontend-only in `ui-components`, with a prerequisite normalizer enhancement in `shared-utils` to handle SDK-specific tool call span naming.

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: @xyflow/react 12.9.0, dagre 0.8.5, React 19.1.0, MUI 7.x
**Storage**: N/A (frontend-only transformation; reads existing span data)
**Testing**: Vitest 4.0.4 (ui-components), Vitest 3.1.4 (shared-utils)
**Target Platform**: Web (Next.js + React, works with CLI/SQLite and Cloud/ClickHouse backends)
**Project Type**: Monorepo (Yarn workspaces + Turbo)
**Performance Goals**: Graph view loads within 2 seconds for traces with up to 100 unique span operations
**Constraints**: Must be implemented in frontend (ui-components) for platform-agnostic design
**Scale/Scope**: Renders all spans without limits; relies on existing dagre layout performance

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Markdown-First Design** | ✅ Pass | N/A - this feature is UI visualization, not prompt/config related |
| **II. Adapter Neutrality** | ✅ Pass | Feature is SDK-agnostic; normalizer handles SDK variance |
| **III. Type Safety** | ✅ Pass | All interfaces typed (WorkflowNode, WorkflowEdge, NodeGroup); TypeScript throughout |
| **IV. Testability** | ✅ Pass | Vitest setup exists; grouping/edge logic testable as pure functions |
| **V. Composability** | ✅ Pass | Auto-graph generation is a composable transformation layer on existing span data |

**Testing Gates (from constitution):**
- Unit tests for core parsing and transformation logic → Required for span grouping, edge generation
- Integration tests for adapter transformations → Required for normalizer tool name extraction
- Manual verification for UI/UX changes → Required for graph rendering, keyboard nav

**Gate Result**: ✅ PASS - No constitution violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-auto-graph-nodes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (internal interfaces only - no REST API)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/
├── ui-components/src/
│   └── sections/traces/
│       ├── trace-drawer/trace-graph/
│       │   ├── use-trace-graph.ts        # MODIFY: Add auto-grouping logic
│       │   ├── use-graph-data.ts         # MODIFY: Handle WorkflowNode structure
│       │   ├── trace-graph-canvas.tsx    # MODIFY: Add keyboard nav, loading states
│       │   └── trace-node.tsx            # MODIFY: Add count badge, position indicator
│       ├── utils/
│       │   ├── graph-layout.ts           # MODIFY: Support nested subgraphs
│       │   ├── node-styling.ts           # MODIFY: Auto-detect node types
│       │   └── workflow-grouping.ts      # NEW: Span grouping & edge generation
│       └── types/
│           └── index.ts                  # MODIFY: Add WorkflowNode, WorkflowEdge types
│
└── shared-utils/src/
    └── normalizer/
        ├── transformers/
        │   ├── ai-sdk/strategies/*.ts    # MODIFY: Extract tool name to span.name
        │   └── mastra/index.ts           # MODIFY: Extract tool name to span.name
        └── types.ts                      # MODIFY: Ensure tool name in span interface

tests/ (co-located in each package)
├── ui-components: *.test.tsx (Vitest + Storybook)
└── shared-utils/test/: *.test.ts (Vitest)
```

**Structure Decision**: Monorepo with changes across two packages:
1. `shared-utils` - Normalizer enhancement (prerequisite)
2. `ui-components` - Auto-graph generation (main feature)

## Complexity Tracking

> No constitution violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

---

## Post-Design Constitution Re-Check

*Verified after Phase 1 design completion.*

| Principle | Status | Verification |
|-----------|--------|--------------|
| **I. Markdown-First Design** | ✅ Pass | N/A - UI feature, no prompt/config changes |
| **II. Adapter Neutrality** | ✅ Pass | Normalizer handles SDK variance internally; graph generation is SDK-agnostic |
| **III. Type Safety** | ✅ Pass | All contracts defined in TypeScript (`contracts/types.ts`); strict typing throughout |
| **IV. Testability** | ✅ Pass | Pure functions for grouping/edge generation; testable with mock span data |
| **V. Composability** | ✅ Pass | `useWorkflowGraph` hook composable with existing trace view architecture |

**Testing Gates Satisfied**:
- Unit tests: For grouping algorithm, edge generation, type inference (pure functions)
- Integration tests: For normalizer tool name extraction (SDK-specific)
- Manual verification: Required for graph rendering, keyboard navigation, loading states

---

## Generated Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| Implementation Plan | [plan.md](./plan.md) | This file |
| Research | [research.md](./research.md) | Phase 0: All unknowns resolved |
| Data Model | [data-model.md](./data-model.md) | Entity definitions and relationships |
| Type Contracts | [contracts/types.ts](./contracts/types.ts) | TypeScript interfaces |
| API Contracts | [contracts/api.yaml](./contracts/api.yaml) | OpenAPI spec (backend unchanged) |
| Quickstart | [quickstart.md](./quickstart.md) | Implementation guide |

---

## Next Steps

Run `/speckit.tasks` to generate detailed implementation tasks from this plan.
