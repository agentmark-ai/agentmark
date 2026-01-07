/**
 * Timeline Types for Trace Timeline View
 *
 * TypeScript interfaces for timeline-specific computed values.
 * Operates on existing SpanData with no data model changes.
 */

import type { SpanData } from "../../types";
import type { WorkflowNodeType } from "../../utils/span-grouping";

/**
 * Computed layout for a single span bar in the timeline.
 */
export interface TimelineBarLayout {
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

  /** Start time in milliseconds (relative to trace start) */
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

/**
 * Zoom/pan state for the timeline viewport.
 */
export interface TimelineViewState {
  /** SVG viewBox dimensions */
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Current zoom scale (1 = 100%) */
  scale: number;
  /** Whether user is currently panning */
  isPanning: boolean;
}

/**
 * Aggregate metrics for the timeline.
 */
export interface TimelineMetrics {
  /** Total trace duration in milliseconds */
  totalDurationMs: number;
  /** Trace start time (earliest span timestamp) */
  startTimeMs: number;
  /** Trace end time (latest span end) */
  endTimeMs: number;
  /** Total number of spans */
  spanCount: number;
  /** Maximum nesting depth */
  maxDepth: number;
  /** Count of spans by type */
  typeBreakdown: Partial<Record<WorkflowNodeType, number>>;
}

/**
 * Time axis tick mark for the ruler.
 */
export interface TimelineRulerTick {
  /** Position on the axis (0-1 normalized) */
  position: number;
  /** Display label (e.g., "0ms", "500ms", "1.2s") */
  label: string;
  /** Whether this is a major tick (larger, with label) */
  isMajor: boolean;
}

/**
 * Layout constants for timeline rendering.
 */
export const TIMELINE_CONSTANTS = {
  /** Height of each span row in pixels */
  ROW_HEIGHT: 28,
  /** Minimum bar width in pixels (for very short spans) */
  MIN_BAR_WIDTH: 4,
  /** Indentation per depth level in pixels */
  DEPTH_INDENT: 16,
  /** Bar height as ratio of row height */
  BAR_HEIGHT_RATIO: 0.7,
  /** Minimum zoom scale */
  MIN_SCALE: 0.5,
  /** Maximum zoom scale */
  MAX_SCALE: 10,
  /** Height of the time ruler in pixels */
  RULER_HEIGHT: 24,
  /** Padding around the timeline content */
  PADDING: 8,
  /** Label area width for span names */
  LABEL_WIDTH: 120,
} as const;

/**
 * Props for the TimelineBar component.
 */
export interface TimelineBarProps {
  /** Computed layout for this bar */
  layout: TimelineBarLayout;
  /** Whether this bar is currently selected */
  isSelected: boolean;
  /** Whether this bar is currently focused (keyboard navigation) */
  isFocused?: boolean;
  /** Callback when bar is clicked */
  onSelect?: (spanId: string) => void;
  /** Callback when mouse enters bar */
  onMouseEnter?: (layout: TimelineBarLayout, event: React.MouseEvent) => void;
  /** Callback when mouse leaves bar */
  onMouseLeave?: () => void;
  /** Total width of the timeline area in pixels */
  timelineWidth: number;
}

/**
 * Props for the TimelineRuler component.
 */
export interface TimelineRulerProps {
  /** Tick marks to display */
  ticks: TimelineRulerTick[];
  /** Total width of the ruler in pixels */
  width: number;
  /** Height of the ruler in pixels */
  height?: number;
}

/**
 * Props for the TimelineTooltip component.
 */
export interface TimelineTooltipProps {
  /** Layout data for the hovered span */
  layout: TimelineBarLayout | null;
  /** Tooltip position */
  position: { x: number; y: number } | null;
  /** Whether tooltip is visible */
  visible: boolean;
}

/**
 * Props for the TimelineLegend component.
 */
export interface TimelineLegendProps {
  /** Type breakdown from metrics */
  typeBreakdown: Partial<Record<WorkflowNodeType, number>>;
  /** Whether to show counts */
  showCounts?: boolean;
}

/**
 * Props for the main TraceTimeline component.
 */
export interface TraceTimelineProps {
  /** Spans to visualize */
  spans: SpanData[];
  /** Currently selected span ID */
  selectedSpanId?: string;
  /** Callback when a span is selected */
  onSelectSpan?: (spanId: string) => void;
  /** Whether to show the time ruler */
  showRuler?: boolean;
  /** Whether to show the type legend */
  showLegend?: boolean;
  /** Whether to enable mouse wheel zoom */
  enableZoom?: boolean;
  /** Whether to enable drag to pan */
  enablePan?: boolean;
  /** Custom styles */
  sx?: Record<string, unknown>;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Return type for useTimelineLayout hook.
 */
export interface UseTimelineLayoutResult {
  /** Computed layouts for all spans */
  layouts: TimelineBarLayout[];
  /** Aggregate metrics */
  metrics: TimelineMetrics;
  /** Ruler tick marks */
  rulerTicks: TimelineRulerTick[];
}

/**
 * Return type for useTimelineZoom hook.
 */
export interface UseTimelineZoomResult {
  /** Current view state */
  viewState: TimelineViewState;
  /** Zoom in by a factor */
  zoomIn: () => void;
  /** Zoom out by a factor */
  zoomOut: () => void;
  /** Reset to fit all content */
  resetZoom: () => void;
  /** Set zoom to specific scale */
  setScale: (scale: number) => void;
  /** Handler for mouse wheel events */
  onWheel: (event: React.WheelEvent) => void;
  /** Handlers for pan (drag) events */
  panHandlers: {
    onMouseDown: (event: React.MouseEvent) => void;
    onMouseMove: (event: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
  };
}
