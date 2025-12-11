# Research: Agentic Workflow Graph

**Feature Branch**: `001-auto-graph-nodes`
**Date**: 2025-12-11

## Research Tasks

### 1. Span Grouping Strategy

**Decision**: Group spans by `{parentSpanId, spanName}` key

**Rationale**:
- Spans naturally have parent-child relationships via `parentSpanId`
- `spanName` indicates the operation type (e.g., "generateText", "search_web", "read_file")
- **Simplified**: With normalizer fix, tool call spans will have tool name as their span name, so no special `toolName` field needed in grouping key
- This produces the workflow pattern (e.g., "generateText ×3, search_web ×2") rather than flat span list

**Alternatives considered**:
- Group by `spanName` only: Rejected because spans under different parents would merge incorrectly
- Group by `spanId`: Rejected because this gives 1:1 span-to-node mapping (no grouping)
- Use existing `graph.node.*` metadata: Rejected because this is manual; we want automatic generation
- Group by `{parentSpanId, spanName, toolName}`: Rejected - unnecessary complexity after normalizer fix

### 2. Node ID Generation

**Decision**: Generate node ID as `${parentSpanId || 'root'}:${spanName}`

**Rationale**:
- Deterministic: Same spans always produce same node ID
- Unique within parent scope: Different parents with same span names get different nodes
- Reversible: Can parse back to components if needed
- URL-safe: No special characters that need encoding
- **Simplified**: No `toolName` suffix needed since tool name is now the span name

**Alternatives considered**:
- UUID: Rejected because non-deterministic and doesn't convey structure
- Hash of span IDs: Rejected because doesn't convey semantic meaning
- Sequential counter: Rejected because depends on processing order
- Include toolName suffix: Rejected - redundant after normalizer fix

### 3. Edge Generation from Execution Order

**Decision**: Create edges based on consecutive span transitions sorted by `startTime`

**Algorithm**:
1. Sort spans by `startTime` within each parent group
2. For consecutive spans A, B: create edge A → B (if A.endTime ≤ B.startTime or overlapping)
3. Track seen transitions to detect bidirectional edges (A→B and B→A both exist)
4. Mark bidirectional edges for special rendering (double arrows)

**Rationale**:
- `startTime` is reliably available on all spans
- Consecutive execution implies workflow transition
- Handles loops (A→B→A) naturally by tracking both directions

**Alternatives considered**:
- Use parent-child relationships: Rejected because spec wants execution flow, not hierarchy
- Use span links: Rejected because links aren't consistently available
- Use span end times only: Rejected because overlapping spans are common in async code

### 4. Node Type Inference

**Decision**: Infer type from span `type` field and attributes

**Mapping**:
| Span Condition | Inferred Node Type |
|----------------|-------------------|
| `type === 'GENERATION'` | `llm` |
| `toolCalls[]` present and non-empty | `tool` |
| Has child spans (is a parent) | `agent` |
| `spanName` contains "retrieval" | `retrieval` |
| `spanName` contains "router" | `router` |
| `spanName` contains "memory" | `memory` |
| Default | `default` (uses primary color) |

**Rationale**:
- `SpanType.GENERATION` is explicitly set for LLM calls by normalizers
- `toolCalls` array presence indicates tool execution
- Child span presence indicates orchestration (agent pattern)
- Name-based fallbacks handle common AI SDK patterns

**Alternatives considered**:
- Require explicit type annotation: Rejected because defeats auto-generation purpose
- Use model name presence: Rejected because not all LLM calls have model in attributes
- Use icon based on span name only: Rejected because miss semantic classification

### 5. Backward Compatibility Strategy

**Decision**: Check for existing `graph.node.*` metadata first; skip auto-generation if present

**Algorithm**:
1. Query spans with `graph.node.id` IS NOT NULL (existing behavior)
2. If any spans have manual metadata, return those (existing code path)
3. If no manual metadata, run auto-graph generation on all spans

**Rationale**:
- Existing traces with manual metadata continue working identically (FR-015, FR-016)
- Zero regression risk: auto-graph is additive, not replacement
- Users who prefer manual control can still add metadata

**Alternatives considered**:
- Merge manual + auto: Rejected because conflict resolution is complex
- Deprecate manual metadata: Rejected because breaks existing users
- Per-span toggle: Rejected because adds unnecessary complexity

### 6. Display Name Generation

**Decision**: Use `spanName` directly as display name

**Rationale**:
- After normalizer fix, span name is already meaningful (e.g., "search_web" not "toolCall")
- Simple and consistent
- Falls back to "Operation" for empty/null names

**Alternatives considered**:
- Format as "Type: Name": Rejected because verbose
- Use span ID: Rejected because not human-readable

### 7. Nested Agent (Subgraph) Detection

**Decision**: Detect agents as spans that have their own child spans with LLM/tool activity

**Algorithm**:
1. Build span tree from parentSpanId relationships
2. For each span with children, check if children contain GENERATION or tool spans
3. If yes, mark as "agent" type and create subgraph container
4. Render children's workflow graph inside the container

**Rationale**:
- Agent is defined by orchestration: "something that coordinates LLM + tools"
- Child activity detection is deterministic and doesn't require naming conventions
- Matches FR-011, FR-012 requirements for nested subgraphs

**Alternatives considered**:
- Require "agent" in span name: Rejected because not all frameworks use this
- Use span depth only: Rejected because not all deep spans are agents
- Manual annotation only: Rejected because defeats auto-generation purpose

### 8. Click-to-Navigate Span Cycling

**Decision**: Store all span IDs per node; cycle through on repeated clicks

**Implementation**:
- `WorkflowNode.spanIds: string[]` stores all spans in the group
- Track `currentSpanIndex` per node in component state
- On click: increment index (mod length), call `onNodeClick(spanIds[currentSpanIndex])`

**Rationale**:
- Matches FR-008, FR-009, FR-010 requirements
- Simple state management in React component
- No backend changes needed

**Alternatives considered**:
- Dropdown menu to select span: Rejected because adds UI complexity
- Always select first span: Rejected because can't access other spans in group
- Open panel with all spans: Rejected because changes existing UX pattern

### 9. Performance Considerations

**Decision**: Process all spans without limit; rely on Dagre/React Flow virtualization

**Rationale**:
- Spec explicitly states "render all spans (no limit)" (clarification from spec)
- React Flow has built-in virtualization for large graphs
- Dagre layout is O(V + E) which handles 1000+ nodes in <1s
- SC-004 target of 2s for 100 unique operations is achievable

**Alternatives considered**:
- Limit to first N nodes: Rejected per spec clarification
- Pagination: Rejected because breaks graph continuity
- Server-side rendering: Rejected because adds latency

### 10. Platform-Agnostic Architecture

**Decision**: Implement auto-graph generation in `ui-components` (frontend), not backend APIs

**Platform Context**:
| Platform | Database | Data Layer | Frontend |
|----------|----------|------------|----------|
| CLI (Local) | SQLite | Express API | Next.js + ui-components |
| Cloud | ClickHouse | Cube.js | Next.js + ui-components |

**Rationale**:
- **Single implementation**: Works for both CLI and Cloud platforms
- **No backend duplication**: Avoid implementing same logic in Express routes AND Cube.js queries
- **Backend simplicity**: Backend only fetches raw spans (already exists on both platforms)
- **Shared code**: 100% of graph generation code shared via ui-components package

**Implementation**:
1. Backend (both platforms) returns raw span data with `parentSpanId`, `name`, `type`, `startTime`
2. Frontend `ui-components` receives spans and generates workflow graph
3. New hook `useWorkflowGraph(spans)` transforms spans → nodes/edges
4. Existing `useTraceGraph` checks for manual metadata first, falls back to auto-generation

**Alternatives considered**:
- Backend auto-generation (CLI only): Rejected because doesn't work for Cloud (Cube.js)
- Duplicate logic in both backends: Rejected because maintenance burden
- Shared backend library: Rejected because Cube.js uses different query patterns than Express

## Prerequisites

### Normalizer Enhancement (packages/shared-utils)

**Issue**: Tool call spans currently use generic names (e.g., "toolCall") instead of specific tool names (e.g., "search_web").

**SDK/Version Variance**: Tool call span naming differs across SDKs and versions:
- AI SDK v4: Tool name in `ai.toolCall.name` attribute
- AI SDK v5: Similar pattern with `ai.toolCall.*` attributes
- Mastra: Different attribute paths for tool information

**Decision**: All SDK/version variance handling is isolated within the normalizer's transformer layer. The graph generator receives consistent `span.name = toolName` output regardless of source SDK or version.

**Required Fix**: Update the normalizer transformers to assign tool name to span name for tool call spans:

```typescript
// In AiSdkTransformer and MastraTransformer
// When detecting a tool call span, override the name
if (isToolCallSpan(span, attributes)) {
  const toolName = extractToolName(attributes); // SDK-specific extraction
  return {
    ...normalizedFields,
    name: toolName || span.name  // Override span name with tool name
  };
}
```

**Locations**:
- `packages/shared-utils/src/normalizer/transformers/ai-sdk/index.ts`
- `packages/shared-utils/src/normalizer/transformers/ai-sdk/strategies/v4.ts`
- `packages/shared-utils/src/normalizer/transformers/ai-sdk/strategies/v5.ts`
- `packages/shared-utils/src/normalizer/transformers/mastra/index.ts`

**Impact on Auto-Graph**: Without this fix, all tool calls would group into a single "toolCall" node instead of separate nodes per tool (e.g., "search_web ×2", "read_file ×1").

## Technology Decisions

### React Flow Best Practices

**Decision**: Use existing component architecture with extensions

**Implementation**:
- Extend `TraceNode` component to show span count badge
- Add `spanIds[]` to node data for click cycling
- No changes to Dagre layout configuration

**Rationale**:
- Existing architecture is well-suited for this feature
- Minimal changes reduce regression risk
- Badge and cycling are isolated to node component

### Type Definitions

**Decision**: Add new types to ui-components package

**New types**:
```typescript
interface WorkflowNode {
  nodeId: string;
  displayName: string;
  nodeType: string;
  spanIds: string[];
  parentNodeId?: string;
}

interface WorkflowEdge {
  source: string;
  target: string;
  bidirectional: boolean;
}

interface NodeGroup {
  key: string; // parentSpanId:spanName
  spanIds: string[];
  displayName: string;
  nodeType: string;
  parentSpanId?: string;
}
```

**Rationale**:
- Clear separation from existing `GraphData` type
- Explicit `spanIds[]` for multi-span nodes
- `bidirectional` flag for edge rendering

## Open Questions (Resolved)

1. ~~Should auto-graph be opt-in or opt-out?~~ → Opt-in by absence of manual metadata
2. ~~What happens if a trace has both manual and auto-graph candidates?~~ → Manual takes priority
3. ~~Should we cache auto-generated graphs?~~ → No, generation is fast enough
4. ~~How to handle spans with null/undefined names?~~ → Fall back to "Operation" label (edge case in spec)
5. ~~How are tool call spans named?~~ → Need normalizer fix to assign tool name to span name
