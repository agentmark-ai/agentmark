/**
 * Trace Timeline Component Props Contracts
 *
 * Feature: 002-trace-timeline
 * Date: 2026-01-06
 */

import type { SpanData, WorkflowNodeType } from "../types";
import type { SxProps, Theme } from "@mui/material";

// =============================================================================
// Core Timeline Props
// =============================================================================

export interface TraceTimelineProps {
  spans: SpanData[];
  selectedSpanId?: string;
  onSelectSpan?: (spanId: string) => void;
  showRuler?: boolean;
  showLegend?: boolean;
  enableZoom?: boolean;
  enablePan?: boolean;
  sx?: SxProps<Theme>;
  className?: string;
  isLoading?: boolean;
}

// =============================================================================
// Timeline Bar Props
// =============================================================================

export interface TimelineBarProps {
  spanId: string;
  name: string;
  x: number;
  width: number;
  row: number;
  depth: number;
  durationMs: number;
  percentOfTrace: number;
  nodeType: WorkflowNodeType;
  hasError: boolean;
  isSelected: boolean;
  onClick?: (spanId: string) => void;
  onMouseEnter?: (event: React.MouseEvent, spanId: string) => void;
  onMouseLeave?: () => void;
}

// =============================================================================
// Timeline Ruler Props
// =============================================================================

export interface TimelineRulerProps {
  totalDurationMs: number;
  scale: number;
  viewBoxX: number;
  width: number;
}

// =============================================================================
// Timeline Tooltip Props
// =============================================================================

export interface TimelineTooltipProps {
  name: string;
  durationMs: number;
  startTimeMs: number;
  percentOfTrace: number;
  nodeType: WorkflowNodeType;
  anchorEl: HTMLElement | SVGElement | null;
  open: boolean;
  onClose: () => void;
}

// =============================================================================
// Timeline Legend Props
// =============================================================================

export interface TimelineLegendProps {
  typeBreakdown: Partial<Record<WorkflowNodeType, number>>;
  onFilterType?: (nodeType: WorkflowNodeType | null) => void;
  activeFilter?: WorkflowNodeType | null;
}

// =============================================================================
// Hook Return Types
// =============================================================================

export interface UseTimelineLayoutReturn {
  layouts: TimelineBarLayout[];
  metrics: TimelineMetrics;
  rulerTicks: TimelineRulerTick[];
}

export interface UseTimelineZoomReturn {
  viewState: TimelineViewState;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setScale: (scale: number) => void;
  panTo: (x: number, y: number) => void;
  panHandlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
  };
  onWheel: (e: React.WheelEvent) => void;
}

// =============================================================================
// Layout Types
// =============================================================================

export interface TimelineBarLayout {
  spanId: string;
  name: string;
  x: number;
  width: number;
  row: number;
  depth: number;
  durationMs: number;
  startTimeMs: number;
  percentOfTrace: number;
  nodeType: WorkflowNodeType;
  hasError: boolean;
  span: SpanData;
}

export interface TimelineMetrics {
  totalDurationMs: number;
  startTimeMs: number;
  endTimeMs: number;
  spanCount: number;
  maxDepth: number;
  typeBreakdown: Partial<Record<WorkflowNodeType, number>>;
}

export interface TimelineRulerTick {
  position: number;
  label: string;
  isMajor: boolean;
}

export interface TimelineViewState {
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  scale: number;
  isPanning: boolean;
}

// =============================================================================
// Constants
// =============================================================================

export const TIMELINE_CONSTANTS = {
  ROW_HEIGHT: 28,
  MIN_BAR_WIDTH: 4,
  DEPTH_INDENT: 16,
  BAR_HEIGHT_RATIO: 0.7,
  MIN_SCALE: 0.5,
  MAX_SCALE: 10,
  RULER_HEIGHT: 24,
  TICK_INTERVALS: [1, 5, 10, 50, 100, 500, 1000, 5000, 10000],
} as const;
