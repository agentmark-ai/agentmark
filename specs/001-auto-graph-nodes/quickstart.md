# Quickstart: Agentic Workflow Graph

**Feature Branch**: `001-auto-graph-nodes`
**Date**: 2025-12-11

## Overview

This guide covers the implementation of automatic workflow graph generation from trace data. After implementing this feature, users will see workflow graphs without needing to manually add `graph.node.*` metadata to their spans.

## Prerequisites

- Node.js 18+
- Yarn 4.x
- Familiarity with the AgentMark codebase structure (monorepo with packages/)

## Quick Setup

```bash
# Clone and checkout feature branch
git checkout 001-auto-graph-nodes

# Install dependencies
yarn install

# Start development server
yarn dev
```

## Platform Architecture

This feature must work across **two platforms**:

| Platform | Database | Data Layer | Frontend |
|----------|----------|------------|----------|
| CLI (Local) | SQLite | Express API | Next.js + ui-components |
| Cloud | ClickHouse | Cube.js | Next.js + ui-components |

**Key Decision**: Auto-graph generation logic lives in `ui-components` (frontend), NOT in backend APIs. This ensures a single implementation works for both platforms.

## Key Implementation Areas

### 0. Prerequisite: Normalizer Fix (`packages/shared-utils`)

**Location**: `packages/shared-utils/src/normalizer/`

**Required Change**: Update the normalizer to assign tool name to span name for tool call spans:

```typescript
// When processing tool call spans
if (isToolCallSpan(span) && span.toolCalls?.[0]?.toolName) {
  normalizedSpan.name = span.toolCalls[0].toolName;
}
```

**Why**: This simplifies grouping logic - all spans can be grouped by `{parentSpanId, spanName}` without special tool handling.

### 1. Frontend: Auto-Graph Generation (`packages/ui-components`) - PRIMARY

**Location**: `packages/ui-components/src/sections/traces/trace-drawer/trace-graph/`

**Why frontend?** The Cloud platform uses Cube.js + ClickHouse with different APIs than CLI's Express + SQLite. By implementing in ui-components:
- Single implementation works for both platforms
- No backend code duplication
- Backend only provides raw span data (already exists)

**New hook**: `useWorkflowGraph(spans)`:

```typescript
// packages/ui-components/src/sections/traces/trace-drawer/trace-graph/use-workflow-graph.ts
export function useWorkflowGraph(spans: SpanData[]): WorkflowGraphResult {
  return useMemo(() => {
    // 1. Group spans by {parentSpanId, spanName}
    const groups = groupSpansByKey(spans);

    // 2. Create WorkflowNode for each group
    const nodes = groups.map(group => ({
      nodeId: `${group.parentSpanId || 'root'}:${group.spanName}`,
      displayName: group.spanName,
      nodeType: inferNodeType(group.spans),
      spanIds: group.spans.map(s => s.spanId),
      parentNodeId: group.parentSpanId ? `${getParentKey(group)}` : undefined,
    }));

    // 3. Generate edges from execution order
    const edges = generateEdgesFromExecutionOrder(spans, nodes);

    return { nodes, edges };
  }, [spans]);
}
```

**Integration with existing hooks**:

```typescript
// Modify use-trace-graph.ts
export const useTraceGraph = (graphData: GraphData[], spans?: SpanData[]) => {
  // If manual graph data exists, use it (backward compatible)
  if (graphData.length > 0) {
    return useExistingGraphData(graphData);
  }

  // Otherwise, auto-generate from spans
  if (spans && spans.length > 0) {
    return useWorkflowGraph(spans);
  }

  return { nodes: [], edges: [] };
};
```

### 2. Frontend: Workflow Node Component (`packages/ui-components`)

**Location**: `packages/ui-components/src/sections/traces/trace-drawer/trace-graph/`

**Changes to `trace-node.tsx`**:
- Add span count badge (×N) for multi-span nodes (only when N >= 2)
- Add position indicator (e.g., "2/5") showing current selection
- Add click cycling through grouped spans

```tsx
// Pseudocode for TraceNode modifications
export const TraceNode = ({ data }: NodeProps<TraceNodeData>) => {
  const { spanIds, spanCount, currentIndex, onNodeClick } = data;

  const handleClick = () => {
    // Cycle to next span
    const nextIndex = (currentIndex + 1) % spanIds.length;
    onNodeClick?.(spanIds[nextIndex]);
  };

  // Format selection indicator: "2/5" (1-based for display)
  const selectionIndicator = spanCount > 1
    ? `${currentIndex + 1}/${spanCount}`
    : null;

  return (
    <Box onClick={handleClick}>
      {/* Existing node rendering */}
      {spanCount >= 2 && (
        <Badge>×{spanCount}</Badge>
      )}
      {selectionIndicator && (
        <SelectionIndicator>{selectionIndicator}</SelectionIndicator>
      )}
    </Box>
  );
};
```

**Changes to `trace-graph-canvas.tsx`**:
- Add loading skeleton while processing spans
- Show "No workflow data" message for empty results
- Add keyboard navigation support

```tsx
// Pseudocode for loading/empty states
export const TraceGraphCanvas = ({ spans, loadingState }) => {
  if (loadingState === 'loading') {
    return <GraphSkeleton />;  // Loading skeleton
  }

  if (loadingState === 'empty') {
    return <EmptyState message="No workflow data" />;
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodesFocusable={true}  // Enable Tab navigation
      onKeyDown={handleKeyboardNavigation}  // Arrow keys + Enter
      tabIndex={0}
    >
      {/* ... */}
    </ReactFlow>
  );
};
```

**Keyboard Navigation**:
- Tab: Focus graph container
- Arrow keys: Navigate between nodes
- Enter: Select/activate current node

**Changes to `use-trace-graph.ts`**:
- Handle `spanIds[]` in graph data
- Track current span index per node

### 3. Shared Types (`packages/ui-components`)

**Location**: `packages/ui-components/src/sections/traces/types/`

**New file**: `workflow-graph.ts`
- Add `WorkflowNode`, `WorkflowEdge`, `NodeGroup` types
- Add `TraceNodeData` extension with `spanIds`, `currentIndex`

## Implementation Order

1. **Normalizer fix first**: Update `packages/shared-utils` to assign tool name to span name
2. **Types**: Add new TypeScript types in `packages/ui-components`
3. **Frontend hooks**: Implement `useWorkflowGraph()` in `packages/ui-components` (works for both platforms!)
4. **Frontend integration**: Update `use-trace-graph.ts` to use auto-generation when no manual metadata
5. **UI component**: Update `TraceNode` for badge and click cycling
6. **Integration**: Test on both CLI (local) and Cloud platforms

## Testing

### Unit Tests

```bash
# Run all tests
yarn test

# Run specific package tests
yarn workspace @agentmark/cli test
yarn workspace @agentmark/ui-components test
yarn workspace @agentmark/shared-utils test
```

### Test Cases

1. **Normalizer fix**:
   - Create tool call span with toolCalls[0].toolName = "search_web"
   - Verify normalized span has name = "search_web"

2. **Auto-generation**:
   - Create trace with no `graph.node.*` metadata
   - Verify workflow graph displays automatically
   - Verify correct grouping by span name

3. **Backward compatibility**:
   - Create trace WITH `graph.node.*` metadata
   - Verify manual graph displays (not auto-generated)

4. **Click cycling**:
   - Create node with 3+ spans
   - Click node multiple times
   - Verify span selection cycles correctly

5. **Edge cases**:
   - Span with no name → "Operation" label
   - Single span under parent → no badge

## Environment Variables

No new environment variables required.

## Common Issues

### Graph not showing for existing trace

**Cause**: Trace may have partial `graph.node.*` metadata.
**Solution**: Either add complete metadata or remove all `graph.node.*` fields.

### Wrong node types displayed

**Cause**: Span type inference may not match expected behavior.
**Solution**: Check span `type` field and `toolCalls` array in trace data.

### Tool calls all grouped together

**Cause**: Normalizer fix not applied - tool calls still have generic "toolCall" name.
**Solution**: Ensure normalizer assigns tool name to span name for tool call spans.

## Architecture Notes

### Platform-Agnostic Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SHARED FRONTEND (ui-components)                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐ │
│  │ TraceGraphCanvas│───>│ useTraceGraph   │───>│ useWorkflowGraph        │ │
│  │ (React Flow)    │    │ (routing logic) │    │ (AUTO-GRAPH GENERATION) │ │
│  └─────────────────┘    └─────────────────┘    └─────────────────────────┘ │
│           │                     │                                           │
│           │          ┌─────────┴─────────┐                                 │
│           │          │ Manual metadata?  │                                 │
│           │          │ → Use existing    │                                 │
│           │          │ No metadata?      │                                 │
│           │          │ → Auto-generate   │                                 │
│           │          └───────────────────┘                                 │
│           │                                                                 │
└───────────┼─────────────────────────────────────────────────────────────────┘
            │
            │ Fetch spans (raw data)
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
┌─────────────┐  ┌─────────────┐
│ CLI (Local) │  │   Cloud     │
├─────────────┤  ├─────────────┤
│ Express API │  │  Cube.js    │
│ SQLite      │  │ ClickHouse  │
└─────────────┘  └─────────────┘
```

**Key Point**: The auto-graph generation happens in `ui-components`, making it work identically on both platforms. Backend only provides raw span data.

## Next Steps

After implementing this feature:

1. Run `/speckit.tasks` to generate detailed implementation tasks
2. Create GitHub issues for tracking
3. Implement in order: normalizer → types → backend → frontend → tests
