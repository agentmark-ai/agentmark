# Data Model: Trace Timeline View

**Feature**: 002-trace-timeline
**Date**: 2026-01-06

## Overview

The timeline view operates on existing `SpanData` with no data model changes. This document defines TypeScript interfaces for timeline-specific computed values.

## Existing Entities (No Changes)

### SpanData (from ui-components)

```typescript
interface SpanData {
  id: string;
  name: string;
  duration: number;          // milliseconds
  parentId?: string;
  timestamp: number;         // UNIX timestamp (milliseconds)
  traceId?: string;
  data: {
    type?: string;           // "GENERATION" for LLM
    toolCalls?: string;      // JSON string if tool call
    status?: string;
    statusMessage?: string;
    model?: string;
    cost?: number;
    // ... additional fields
  };
}
```

## New Timeline Entities

### TimelineBarLayout

Computed layout for a single span bar.

```typescript
interface TimelineBarLayout {
  /** Original span ID */
  spanId: string;

  /** Span name for display */
  name: string;

  /** Horizontal position (0-1 normalized) */
  x: number;

  /** Bar width (0-1 normalized) */
  width: number;

  /** Vertical row index (0-based) */
  row: number;

  /** Nesting depth (0 = root) */
  depth: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Start time in milliseconds */
  startTimeMs: number;

  /** Percentage of total trace duration */
  percentOfTrace: number;

  /** Node type for coloring (reuses WorkflowNodeType) */
  nodeType: WorkflowNodeType;

  /** Error indicator */
  hasError: boolean;

  /** Reference to original span */
  span: SpanData;
}
```

### TimelineViewState

Zoom/pan state.

```typescript
interface TimelineViewState {
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  scale: number;
  isPanning: boolean;
}
```

### TimelineMetrics

Aggregate metrics.

```typescript
interface TimelineMetrics {
  totalDurationMs: number;
  startTimeMs: number;
  endTimeMs: number;
  spanCount: number;
  maxDepth: number;
  typeBreakdown: Partial<Record<WorkflowNodeType, number>>;
}
```

### TimelineRulerTick

Time axis tick mark.

```typescript
interface TimelineRulerTick {
  position: number;  // 0-1 normalized
  label: string;     // "0ms", "500ms", "1.2s"
  isMajor: boolean;
}
```

## Reused from 001-auto-graph-nodes

### WorkflowNodeType

```typescript
type WorkflowNodeType =
  | "llm"
  | "tool"
  | "agent"
  | "retrieval"
  | "router"
  | "memory"
  | "default";
```

## Constants

```typescript
const TIMELINE_CONSTANTS = {
  ROW_HEIGHT: 28,
  MIN_BAR_WIDTH: 4,
  DEPTH_INDENT: 16,
  BAR_HEIGHT_RATIO: 0.7,
  MIN_SCALE: 0.5,
  MAX_SCALE: 10,
  RULER_HEIGHT: 24,
} as const;
```

## Entity Relationships

```
SpanData (existing)
    │
    │ useTimelineLayout()
    ▼
TimelineBarLayout[]
    │
    │ render
    ▼
TimelineBar components
    │
    │ inside
    ▼
TraceTimeline (SVG)
    │
    │ controlled by
    ▼
TimelineViewState
```
