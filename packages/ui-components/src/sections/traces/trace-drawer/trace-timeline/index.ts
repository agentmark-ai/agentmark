/**
 * Trace Timeline View
 *
 * A waterfall/timeline visualization for trace spans.
 * Displays spans as horizontal bars positioned by start time and sized by duration.
 */

// Types
export type {
  TimelineBarLayout,
  TimelineViewState,
  TimelineMetrics,
  TimelineRulerTick,
  TimelineBarProps,
  TimelineRulerProps,
  TimelineTooltipProps,
  TimelineLegendProps,
  TraceTimelineProps,
  UseTimelineLayoutResult,
  UseTimelineZoomResult,
} from "./timeline-types";

export { TIMELINE_CONSTANTS } from "./timeline-types";

// Pure functions
export { computeTimelineLayout, formatDuration } from "./compute-timeline-layout";

// Hooks
export { useTimelineLayout } from "./use-timeline-layout";
export { useTimelineZoom } from "./use-timeline-zoom";
export { useTimelineViewPreference, type TraceViewType } from "./use-timeline-view-preference";

// Components
export { TraceTimeline } from "./trace-timeline";
export { TimelineBar } from "./timeline-bar";
export { TimelineRuler } from "./timeline-ruler";
export { TimelineTooltip } from "./timeline-tooltip";
export { TimelineLegend } from "./timeline-legend";
