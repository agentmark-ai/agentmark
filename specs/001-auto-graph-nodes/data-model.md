# Data Model: Agentic Workflow Graph

**Feature Branch**: `001-auto-graph-nodes`
**Date**: 2025-12-11

## Platform Architecture

This data model is designed to work across both platforms:

| Platform | Database | Data Layer | Where Graph Logic Lives |
|----------|----------|------------|------------------------|
| CLI (Local) | SQLite | Express API | **ui-components** (frontend) |
| Cloud | ClickHouse | Cube.js | **ui-components** (frontend) |

**Key Design Decision**: Auto-graph generation logic is implemented in `ui-components` (frontend), NOT in backend. This ensures:
- Single implementation for both platforms
- Backend only provides raw span data
- No duplication between Express routes and Cube.js queries

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXISTING ENTITIES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐           ┌─────────────────┐                         │
│  │ NormalizedSpan  │ 1───────* │   ToolCall      │                         │
│  ├─────────────────┤           ├─────────────────┤                         │
│  │ spanId (PK)     │           │ toolCallId      │                         │
│  │ parentSpanId    │───┐       │ toolName        │                         │
│  │ traceId         │   │       │ args            │                         │
│  │ name            │   │       │ result          │                         │
│  │ type            │   │       └─────────────────┘                         │
│  │ startTime       │   │                                                   │
│  │ toolCalls[]     │   └──────────────────────┐                           │
│  │ metadata        │                          │                           │
│  └─────────────────┘                          │ (self-reference)          │
│          │                                    ▼                           │
│          │                          ┌─────────────────┐                   │
│          │                          │ Parent Span     │                   │
│          │                          └─────────────────┘                   │
│          │                                                                 │
└──────────┼─────────────────────────────────────────────────────────────────┘
           │
           │ AUTO-GENERATION
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEW ENTITIES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐                                                   │
│  │ NodeGroup           │ (intermediate grouping structure)                 │
│  ├─────────────────────┤                                                   │
│  │ key (computed)      │ = parentSpanId:spanName                           │
│  │ parentSpanId        │                                                   │
│  │ spanName            │                                                   │
│  │ spanIds[]           │                                                   │
│  └─────────────────────┘                                                   │
│          │                                                                 │
│          │ TRANSFORMS TO                                                   │
│          ▼                                                                 │
│  ┌─────────────────────┐       ┌─────────────────────┐                    │
│  │ WorkflowNode        │ *───* │ WorkflowEdge        │                    │
│  ├─────────────────────┤       ├─────────────────────┤                    │
│  │ nodeId (PK)         │◄──────│ source              │                    │
│  │ displayName         │◄──────│ target              │                    │
│  │ nodeType            │       │ bidirectional       │                    │
│  │ spanIds[]           │       └─────────────────────┘                    │
│  │ parentNodeId?       │                                                   │
│  │ spanCount           │ (derived: spanIds.length)                        │
│  └─────────────────────┘                                                   │
│          │                                                                 │
│          │ RENDERS AS                                                      │
│          ▼                                                                 │
│  ┌─────────────────────┐       ┌─────────────────────┐                    │
│  │ GraphNode (RF)      │ *───* │ GraphEdge (RF)      │                    │
│  ├─────────────────────┤       ├─────────────────────┤                    │
│  │ id                  │       │ id                  │                    │
│  │ type: "traceNode"   │       │ source              │                    │
│  │ position: {x, y}    │       │ target              │                    │
│  │ data: {             │       │ animated            │                    │
│  │   label             │       │ markerEnd?          │                    │
│  │   spanIds[]         │       │ markerStart?        │                    │
│  │   spanCount         │       └─────────────────────┘                    │
│  │   nodeType          │                                                   │
│  │   currentIndex      │ (UI state for cycling)                           │
│  │   color             │                                                   │
│  │   icon              │                                                   │
│  │   branchColor       │                                                   │
│  │   onNodeClick       │                                                   │
│  │ }                   │                                                   │
│  └─────────────────────┘                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Entity Definitions

### NodeGroup (Intermediate)

Groups spans with the same operation under the same parent.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `key` | `string` | Composite key: `{parentSpanId}:{spanName}` | Required, unique |
| `parentSpanId` | `string \| undefined` | ID of parent span, undefined for root-level | Optional |
| `spanName` | `string` | Name of the operation (e.g., "generateText", "search_web") | Required, non-empty |
| `spanIds` | `string[]` | Array of span IDs in this group | Required, min length 1 |

**Note**: `toolName` field removed - with normalizer fix, tool call spans have tool name as their `spanName`.

**State Transitions**: N/A (stateless intermediate structure)

### WorkflowNode

A grouped representation of one or more spans.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `nodeId` | `string` | Unique identifier: `{parentSpanId\|'root'}:{spanName}` | Required, unique |
| `displayName` | `string` | Human-readable label for the node (same as spanName) | Required, non-empty |
| `nodeType` | `'llm' \| 'tool' \| 'agent' \| 'retrieval' \| 'router' \| 'memory' \| 'default'` | Inferred operation type | Required |
| `spanIds` | `string[]` | All span IDs grouped in this node | Required, min length 1 |
| `parentNodeId` | `string \| undefined` | Parent node ID for hierarchy | Optional |

**Computed Properties**:
- `spanCount`: `spanIds.length`
- `showBadge`: `spanCount >= 2`

### WorkflowEdge

A directional connection representing execution flow.

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `id` | `string` | Edge identifier: `{source}->{target}` | Required, unique |
| `source` | `string` | Source node ID | Required, must exist |
| `target` | `string` | Target node ID | Required, must exist |
| `bidirectional` | `boolean` | True if both A→B and B→A transitions occurred | Required |

### GraphNode (React Flow)

Extended React Flow node with workflow-specific data.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Node ID (same as WorkflowNode.nodeId) |
| `type` | `'traceNode'` | Custom node type |
| `position` | `{x: number, y: number}` | Calculated by Dagre |
| `data.label` | `string` | Display name |
| `data.spanIds` | `string[]` | All span IDs for click cycling |
| `data.spanCount` | `number` | Number of spans (for badge display) |
| `data.nodeType` | `string` | For icon/color styling |
| `data.currentIndex` | `number` | Current selected span index (UI state) |
| `data.color` | `string` | Node type color from theme |
| `data.icon` | `string` | Node type icon (iconify format) |
| `data.branchColor` | `string` | Branch family color |
| `data.onNodeClick` | `(spanId: string) => void` | Click handler |

### GraphEdge (React Flow)

Extended React Flow edge with bidirectional support.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Edge ID |
| `source` | `string` | Source node ID |
| `target` | `string` | Target node ID |
| `animated` | `boolean` | Animation enabled |
| `markerEnd` | `EdgeMarker \| undefined` | Arrow at target |
| `markerStart` | `EdgeMarker \| undefined` | Arrow at source (for bidirectional) |

## Type Inference Rules

### Node Type Detection

```typescript
function inferNodeType(
  spans: NormalizedSpan[],
  hasChildren: boolean
): NodeType {
  // Check first span for type indicators
  const span = spans[0];

  // 1. LLM detection: GENERATION type
  if (span.type === SpanType.GENERATION) {
    return 'llm';
  }

  // 2. Tool detection: has tool calls
  if (span.toolCalls && span.toolCalls.length > 0) {
    return 'tool';
  }

  // 3. Agent detection: has child spans with LLM/tool activity
  if (hasChildren) {
    return 'agent';
  }

  // 4. Name-based fallbacks
  const name = span.name.toLowerCase();
  if (name.includes('retrieval') || name.includes('rag')) {
    return 'retrieval';
  }
  if (name.includes('router') || name.includes('route')) {
    return 'router';
  }
  if (name.includes('memory') || name.includes('store')) {
    return 'memory';
  }

  // 5. Default
  return 'default';
}
```

### Display Name Generation

```typescript
function generateDisplayName(spanName: string): string {
  // Use span name directly (already meaningful after normalizer fix)
  return spanName || 'Operation';
}
```

### Node ID Generation

```typescript
function generateNodeId(
  parentSpanId: string | undefined,
  spanName: string
): string {
  const parent = parentSpanId || 'root';
  return `${parent}:${spanName}`;
}
```

## Validation Rules

### WorkflowNode

1. `nodeId` must be unique within a trace
2. `displayName` must be non-empty (fallback to "Operation")
3. `spanIds` must contain at least one valid span ID
4. `nodeType` must be one of the allowed enum values

### WorkflowEdge

1. `source` and `target` must reference existing nodes
2. `source` and `target` must not be the same node
3. No duplicate edges (same source-target pair)

### Backward Compatibility

When spans have `graph.node.id` metadata:
1. Use existing `GraphData` structure (unchanged)
2. Do not generate `WorkflowNode`/`WorkflowEdge` for these traces
3. All manual metadata fields take priority over auto-generation
