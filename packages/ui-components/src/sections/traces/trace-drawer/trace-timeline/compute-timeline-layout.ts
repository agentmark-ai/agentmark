/**
 * computeTimelineLayout - Pure function for timeline layout computation
 *
 * Computes timeline bar layouts from span data using depth-first traversal.
 * Handles hierarchical positioning, concurrent span detection, and time normalization.
 *
 * This is extracted as a pure function to enable direct unit testing without React context.
 */

import type { SpanData } from "../../types";
import { inferNodeType, type WorkflowNodeType } from "../../utils/span-grouping";
import type {
  TimelineBarLayout,
  TimelineMetrics,
  TimelineRulerTick,
  UseTimelineLayoutResult,
} from "./timeline-types";

/**
 * Format duration for display.
 * @param ms Duration in milliseconds
 * @returns Formatted string (e.g., "500ms", "1.2s", "2m 30s")
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Calculate appropriate tick interval based on total duration.
 * @param totalMs Total duration in milliseconds
 * @returns Object with major and minor tick intervals
 */
export function calculateTickIntervals(totalMs: number): {
  major: number;
  minor: number;
} {
  // Target approximately 5-10 major ticks
  const targetMajorTicks = 6;
  const idealInterval = totalMs / targetMajorTicks;

  // Round to nice intervals
  const niceIntervals = [
    1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 30000,
    60000, 120000, 300000, 600000,
  ];

  let major = niceIntervals[0]!;
  for (const interval of niceIntervals) {
    if (interval >= idealInterval) {
      major = interval;
      break;
    }
    major = interval;
  }

  // Minor ticks are 1/5 of major
  const minor = major / 5;

  return { major, minor };
}

/**
 * Check if a span has an error status.
 */
export function hasErrorStatus(span: SpanData): boolean {
  const status = span.data?.status?.toLowerCase();
  return status === "error" || status === "failed" || status === "failure";
}

/**
 * Build a lookup map from span ID to span data.
 */
function buildSpanLookup(spans: SpanData[]): Map<string, SpanData> {
  const lookup = new Map<string, SpanData>();
  for (const span of spans) {
    lookup.set(span.id, span);
  }
  return lookup;
}

/**
 * Build a map of parent ID to child spans.
 */
function buildChildrenMap(spans: SpanData[]): Map<string | undefined, SpanData[]> {
  const childrenMap = new Map<string | undefined, SpanData[]>();

  for (const span of spans) {
    const parentId = span.parentId;
    const children = childrenMap.get(parentId) || [];
    children.push(span);
    childrenMap.set(parentId, children);
  }

  // Sort children by start time
  for (const [, children] of childrenMap) {
    children.sort((a, b) => a.timestamp - b.timestamp);
  }

  return childrenMap;
}

/**
 * Check if a span has children.
 */
function spanHasChildren(
  spanId: string,
  childrenMap: Map<string | undefined, SpanData[]>
): boolean {
  const children = childrenMap.get(spanId);
  return children !== undefined && children.length > 0;
}

/**
 * Compute timeline layouts from span data.
 *
 * @param spans Array of span data to visualize
 * @returns Computed layouts, metrics, and ruler ticks
 */
export function computeTimelineLayout(spans: SpanData[]): UseTimelineLayoutResult {
  // Handle empty spans
  if (spans.length === 0) {
    return {
      layouts: [],
      metrics: {
        totalDurationMs: 0,
        startTimeMs: 0,
        endTimeMs: 0,
        spanCount: 0,
        maxDepth: 0,
        typeBreakdown: {},
      },
      rulerTicks: [],
    };
  }

  // Build lookup structures
  const spanLookup = buildSpanLookup(spans);
  const childrenMap = buildChildrenMap(spans);

  // Calculate time bounds
  let minTimestamp = Infinity;
  let maxEndTime = -Infinity;

  for (const span of spans) {
    const startTime = span.timestamp;
    const endTime = span.timestamp + Math.max(0, span.duration);

    if (startTime < minTimestamp) {
      minTimestamp = startTime;
    }
    if (endTime > maxEndTime) {
      maxEndTime = endTime;
    }
  }

  const totalDurationMs = maxEndTime - minTimestamp;

  // Normalize time to 0-1 range
  const normalizeTime = (timestamp: number): number => {
    if (totalDurationMs === 0) return 0;
    return (timestamp - minTimestamp) / totalDurationMs;
  };

  const normalizeDuration = (duration: number): number => {
    if (totalDurationMs === 0) return 1;
    return Math.max(0, duration) / totalDurationMs;
  };

  // Compute layouts using depth-first traversal
  const layouts: TimelineBarLayout[] = [];
  let rowIndex = 0;
  let maxDepth = 0;
  const typeBreakdown: Partial<Record<WorkflowNodeType, number>> = {};

  function traverse(parentId: string | undefined, depth: number): void {
    const children = childrenMap.get(parentId) || [];

    for (const span of children) {
      // Track max depth
      if (depth > maxDepth) {
        maxDepth = depth;
      }

      // Determine node type
      const hasChildren = spanHasChildren(span.id, childrenMap);
      const nodeType = inferNodeType(
        {
          spanId: span.id,
          parentSpanId: span.parentId,
          name: span.name,
          startTime: span.timestamp,
          type: span.data?.type,
          data: span.data,
        },
        hasChildren
      );

      // Track type breakdown
      typeBreakdown[nodeType] = (typeBreakdown[nodeType] || 0) + 1;

      // Calculate layout
      const startTimeMs = span.timestamp - minTimestamp;
      const durationMs = Math.max(0, span.duration);
      const percentOfTrace =
        totalDurationMs > 0 ? (durationMs / totalDurationMs) * 100 : 100;

      const layout: TimelineBarLayout = {
        spanId: span.id,
        name: span.name,
        x: normalizeTime(span.timestamp),
        width: normalizeDuration(durationMs),
        row: rowIndex,
        depth,
        durationMs,
        startTimeMs,
        percentOfTrace,
        nodeType,
        hasError: hasErrorStatus(span),
        span,
      };

      layouts.push(layout);
      rowIndex++;

      // Recurse into children
      traverse(span.id, depth + 1);
    }
  }

  // Start traversal from root spans (no parent or parent not in trace)
  traverse(undefined, 0);

  // Also handle orphan spans (parent ID exists but parent not in trace)
  for (const span of spans) {
    if (span.parentId && !spanLookup.has(span.parentId)) {
      // This is an orphan - parent is missing
      const hasChildren = spanHasChildren(span.id, childrenMap);
      const nodeType = inferNodeType(
        {
          spanId: span.id,
          parentSpanId: span.parentId,
          name: span.name,
          startTime: span.timestamp,
          type: span.data?.type,
          data: span.data,
        },
        hasChildren
      );

      // Check if already added
      if (!layouts.find((l) => l.spanId === span.id)) {
        typeBreakdown[nodeType] = (typeBreakdown[nodeType] || 0) + 1;

        const startTimeMs = span.timestamp - minTimestamp;
        const durationMs = Math.max(0, span.duration);
        const percentOfTrace =
          totalDurationMs > 0 ? (durationMs / totalDurationMs) * 100 : 100;

        layouts.push({
          spanId: span.id,
          name: span.name,
          x: normalizeTime(span.timestamp),
          width: normalizeDuration(durationMs),
          row: rowIndex,
          depth: 0, // Treat as root since parent is missing
          durationMs,
          startTimeMs,
          percentOfTrace,
          nodeType,
          hasError: hasErrorStatus(span),
          span,
        });
        rowIndex++;

        // Traverse children of orphan
        traverse(span.id, 1);
      }
    }
  }

  // Calculate ruler ticks
  const { major, minor } = calculateTickIntervals(totalDurationMs);
  const rulerTicks: TimelineRulerTick[] = [];

  if (totalDurationMs > 0) {
    for (let time = 0; time <= totalDurationMs; time += minor) {
      const isMajor = time % major === 0;
      rulerTicks.push({
        position: time / totalDurationMs,
        label: isMajor ? formatDuration(time) : "",
        isMajor,
      });
    }

    // Ensure we have an end tick
    if (rulerTicks.length === 0 || rulerTicks[rulerTicks.length - 1]!.position < 1) {
      rulerTicks.push({
        position: 1,
        label: formatDuration(totalDurationMs),
        isMajor: true,
      });
    }
  }

  // Build metrics
  const metrics: TimelineMetrics = {
    totalDurationMs,
    startTimeMs: minTimestamp,
    endTimeMs: maxEndTime,
    spanCount: spans.length,
    maxDepth,
    typeBreakdown,
  };

  return { layouts, metrics, rulerTicks };
}
