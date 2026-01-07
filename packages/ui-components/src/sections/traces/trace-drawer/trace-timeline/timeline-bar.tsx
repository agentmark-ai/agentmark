/**
 * TimelineBar Component
 *
 * Renders a single span bar in the timeline visualization.
 * Displays the span as a horizontal bar with appropriate positioning, sizing, and styling.
 */

import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import { getNodeTypeStyle } from "../../utils/node-styling";
import type { TimelineBarProps } from "./timeline-types";
import { TIMELINE_CONSTANTS } from "./timeline-types";

const { ROW_HEIGHT, MIN_BAR_WIDTH, DEPTH_INDENT, BAR_HEIGHT_RATIO } = TIMELINE_CONSTANTS;

/**
 * Format duration for display on the bar.
 */
function formatBarDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * TimelineBar component renders a single span bar.
 */
export const TimelineBar = memo(function TimelineBar({
  layout,
  isSelected,
  isFocused = false,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  timelineWidth,
}: TimelineBarProps) {
  const theme = useTheme();

  // Get style based on node type
  const nodeStyle = getNodeTypeStyle(layout.nodeType, theme);

  // Calculate bar dimensions
  const barHeight = ROW_HEIGHT * BAR_HEIGHT_RATIO;
  const barY = layout.row * ROW_HEIGHT + (ROW_HEIGHT - barHeight) / 2;

  // Calculate x position and width in pixels
  // Note: depth indentation is only applied to labels (left side), not bars
  // Bars represent TIME position, which should be independent of hierarchy depth
  const xPixels = layout.x * timelineWidth;
  const widthPixels = Math.max(MIN_BAR_WIDTH, layout.width * timelineWidth);

  // Determine bar color
  let barColor = nodeStyle.color;
  if (layout.hasError) {
    barColor = theme.palette.error.main;
  }

  // Selection/focus styling
  const strokeColor = isSelected
    ? theme.palette.primary.main
    : isFocused
      ? theme.palette.action.focus
      : "transparent";
  const strokeWidth = isSelected || isFocused ? 2 : 0;

  // Opacity for visual depth
  const opacity = layout.hasError ? 1 : 0.85;

  // Handle click
  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onSelect?.(layout.spanId);
  };

  // Handle mouse events for tooltip
  const handleMouseEnter = (event: React.MouseEvent) => {
    onMouseEnter?.(layout, event);
  };

  // Determine if we should show the duration label on the bar
  const showLabel = widthPixels > 60;
  const durationLabel = formatBarDuration(layout.durationMs);

  return (
    <g
      className="timeline-bar"
      data-span-id={layout.spanId}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: "pointer" }}
      role="gridcell"
      aria-label={`${layout.name}: ${durationLabel}, ${layout.percentOfTrace.toFixed(1)}% of trace`}
      tabIndex={-1}
    >
      {/* Bar background */}
      <rect
        x={xPixels}
        y={barY}
        width={widthPixels}
        height={barHeight}
        rx={3}
        ry={3}
        fill={barColor}
        opacity={opacity}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />

      {/* Duration label on bar (if space allows) */}
      {showLabel && (
        <text
          x={xPixels + widthPixels / 2}
          y={barY + barHeight / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          fill={theme.palette.getContrastText(barColor)}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {durationLabel}
        </text>
      )}

      {/* Error indicator */}
      {layout.hasError && (
        <circle
          cx={xPixels + widthPixels - 8}
          cy={barY + barHeight / 2}
          r={4}
          fill={theme.palette.error.contrastText}
          style={{ pointerEvents: "none" }}
        />
      )}
    </g>
  );
});

export default TimelineBar;
