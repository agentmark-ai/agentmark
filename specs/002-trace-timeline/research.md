# Research: Trace Timeline View

**Feature**: 002-trace-timeline
**Date**: 2026-01-06
**Status**: Complete

## Research Questions

### Q1: Where should timeline integrate in the TraceDrawer?

**Decision**: Add as a switchable view alongside the existing TraceGraphCanvas

**Rationale**:
- The workflow graph (001) shows execution patterns; timeline shows timing
- Both are valuable but serve different purposes
- A view toggle allows users to switch based on what they're investigating
- Follows the pattern from APM tools (Datadog, Jaeger) that offer multiple trace views

**Implementation**:
- Add toggle in TraceDrawer sidebar header
- Default to graph view (maintains current behavior)
- Remember user preference in localStorage

### Q2: What rendering approach for timeline bars?

**Decision**: SVG with React components (no additional libraries)

**Rationale**:
- Consistent with the rest of ui-components (MUI + custom React)
- SVG scales well with zoom without pixelation
- React component model enables easy event handling, tooltips, accessibility
- No new dependencies required
- The workflow graph uses @xyflow/react which is designed for DAG, not appropriate for timeline

**Alternatives Considered**:
1. @xyflow/react - Rejected: designed for node graphs, not linear timelines
2. HTML Canvas - Rejected: harder to integrate with React, poor accessibility
3. d3.js - Rejected: would add significant dependency for simple bar rendering

### Q3: How to reuse span type detection from 001?

**Decision**: Import `inferNodeType()` and `getNodeTypeStyle()` directly

**Rationale**:
- Functions already exist in `utils/` (`inferNodeType` in `span-grouping.ts`, `getNodeTypeStyle` in `node-styling.ts`)
- Ensures color consistency between graph and timeline views
- No code duplication
- Same detection logic: GENERATION → "llm", toolCalls → "tool", etc.

**Usage**:
```typescript
import { inferNodeType } from '../utils/span-grouping';
import { getNodeTypeStyle } from '../utils/node-styling';

const nodeType = inferNodeType(span);
const { color } = getNodeTypeStyle(nodeType, theme);
```

### Q4: How to handle zoom/pan?

**Decision**: Custom hooks with SVG viewBox manipulation

**Rationale**:
- SVG viewBox provides native pan/zoom without re-rendering
- Mouse wheel for zoom, drag for pan (standard pattern)
- Simpler than adding a zoom library
- Already using this pattern in other parts of the app

**Implementation**:
```typescript
// use-timeline-zoom.ts
interface ZoomState {
  viewBox: { x: number; y: number; width: number; height: number };
  scale: number;
}

// Wheel → adjust viewBox width (zoom around cursor)
// Drag → adjust viewBox x/y (pan)
// Double-click → reset to fit all
```

### Q5: How to calculate row positions for hierarchical spans?

**Decision**: Depth-first traversal with indentation

**Rationale**:
- Matches the TraceTree structure users already understand
- Parent spans contain child spans visually (indentation)
- Y-position determined by traversal order
- X-position determined by timestamp

**Algorithm**:
```typescript
function calculateLayout(spans: SpanData[]): TimelineBarLayout[] {
  const layouts: TimelineBarLayout[] = [];
  let rowIndex = 0;

  function traverse(parentId: string | null, depth: number) {
    const children = spans.filter(s => s.parentId === parentId)
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const span of children) {
      layouts.push({
        spanId: span.id,
        row: rowIndex++,
        depth,
        x: normalize(span.timestamp),
        width: normalize(span.duration),
        // ...
      });
      traverse(span.id, depth + 1);
    }
  }

  traverse(null, 0);
  return layouts;
}
```

### Q6: How to handle large traces (1000+ spans)?

**Decision**: Virtualization - only render visible rows

**Rationale**:
- Same approach as virtual scrolling in lists
- Only render spans whose row index is in the visible viewport
- Calculate visible range from scroll position and container height

**Implementation**:
- When `spanCount > 100` and `rowHeight * spanCount > viewportHeight * 2`: enable virtualization
- Calculate `startRow` and `endRow` from scroll position
- Only render spans in that range
- Use `useMemo` to avoid recalculating on every scroll

## Integration Points

### Shared with 001-auto-graph-nodes

| What | Location | How Timeline Uses It |
|------|----------|---------------------|
| `inferNodeType()` | `utils/span-grouping.ts` | Detect span type for bar color |
| `getNodeTypeStyle()` | `utils/node-styling.ts` | Get color by type |
| `SpanData` | `types/index.ts` | Span interface |
| Selection context | `trace-drawer/` | Shared selected span state |
| `WorkflowNodeType` | `utils/span-grouping.ts` | Type enum for span classification |

### New Components

| Component | Responsibility |
|-----------|---------------|
| `TraceTimeline` | Main container, SVG viewport, zoom/pan |
| `TimelineBar` | Individual span bar with click/hover |
| `TimelineRuler` | Time axis with tick marks |
| `TimelineTooltip` | Hover popup with span details |
| `TimelineLegend` | Span type color key |
| `useTimelineLayout` | Compute bar positions from spans |
| `useTimelineZoom` | Manage zoom/pan state |

## Performance Targets

| Scenario | Target | Approach |
|----------|--------|----------|
| 10 spans | < 100ms render | Direct SVG |
| 100 spans | < 500ms render | Memoized layout |
| 1000 spans | < 2s render | Virtualization |
| Zoom/pan | 60fps | ViewBox manipulation |
| Selection | < 50ms | CSS class toggle |

## Dependencies

**No new external dependencies required**. Using existing:
- React 19.1.0
- MUI 7.x (for Tooltip, theme)
- Existing ui-components utilities
