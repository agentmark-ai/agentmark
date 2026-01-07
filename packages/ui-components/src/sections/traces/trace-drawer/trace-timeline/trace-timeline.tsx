/**
 * TraceTimeline Component
 *
 * Main container for the trace timeline visualization.
 * Displays spans as horizontal bars positioned by start time and sized by duration.
 */

import React, { memo, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { Box, Skeleton, Typography, IconButton, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { TraceTimelineProps, TimelineBarLayout } from "./timeline-types";
import { TIMELINE_CONSTANTS } from "./timeline-types";
import { useTimelineLayout } from "./use-timeline-layout";
import { useTimelineZoom } from "./use-timeline-zoom";
import { TimelineBar } from "./timeline-bar";
import { TimelineRuler } from "./timeline-ruler";
import { TimelineTooltip } from "./timeline-tooltip";
import { TimelineLegend } from "./timeline-legend";
import { TimelineErrorBoundary } from "./timeline-error-boundary";

const { ROW_HEIGHT, RULER_HEIGHT, PADDING, LABEL_WIDTH } = TIMELINE_CONSTANTS;

/** Virtualization threshold - enable for traces with more spans */
const VIRTUALIZATION_THRESHOLD = 100;

/** Number of extra rows to render above/below viewport for smooth scrolling */
const VIRTUALIZATION_OVERSCAN = 5;

/**
 * TraceTimeline component displays spans as a waterfall timeline.
 */
export const TraceTimeline = memo(function TraceTimeline({
  spans,
  selectedSpanId,
  onSelectSpan,
  showRuler = true,
  showLegend = true,
  enableZoom = true,
  enablePan = true,
  sx,
  isLoading = false,
}: TraceTimelineProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const prevSelectedSpanIdRef = useRef<string | undefined>(undefined);

  // Tooltip state
  const [tooltipData, setTooltipData] = useState<{
    layout: TimelineBarLayout | null;
    position: { x: number; y: number } | null;
  }>({ layout: null, position: null });

  // Scroll position for virtualization
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);

  // Compute timeline layout
  const { layouts, metrics, rulerTicks } = useTimelineLayout(spans);

  // Calculate dimensions
  const timelineWidth = Math.max(400, containerWidth - LABEL_WIDTH - PADDING * 2);
  const contentHeight = layouts.length * ROW_HEIGHT;
  const totalHeight = contentHeight + (showRuler ? RULER_HEIGHT : 0) + PADDING * 2;

  // Zoom/pan state (T033)
  const {
    viewState,
    zoomIn,
    zoomOut,
    resetZoom,
    onWheel,
    panHandlers,
  } = useTimelineZoom(timelineWidth, contentHeight);

  // Virtualization: calculate visible rows (T035)
  const { visibleLayouts } = useMemo(() => {
    // Skip virtualization for small traces
    if (layouts.length < VIRTUALIZATION_THRESHOLD) {
      return {
        visibleLayouts: layouts,
        startIndex: 0,
        endIndex: layouts.length,
      };
    }

    // Calculate visible range based on scroll position
    const headerOffset = showRuler ? RULER_HEIGHT : 0;
    const firstVisibleRow = Math.floor(
      (scrollTop - headerOffset - PADDING) / ROW_HEIGHT
    );
    const visibleRowCount = Math.ceil(containerHeight / ROW_HEIGHT);

    const start = Math.max(0, firstVisibleRow - VIRTUALIZATION_OVERSCAN);
    const end = Math.min(
      layouts.length,
      firstVisibleRow + visibleRowCount + VIRTUALIZATION_OVERSCAN
    );

    return {
      visibleLayouts: layouts.slice(start, end),
      startIndex: start,
      endIndex: end,
    };
  }, [layouts, scrollTop, containerHeight, showRuler]);

  // Track container dimensions and scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
        setContainerHeight(entry.contentRect.height);
      }
    });

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    resizeObserver.observe(container);
    container.addEventListener("scroll", handleScroll, { passive: true });

    setContainerWidth(container.offsetWidth);
    setContainerHeight(container.offsetHeight);

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Scroll to selected span when selection changes from external source (T022)
  useEffect(() => {
    if (!selectedSpanId || selectedSpanId === prevSelectedSpanIdRef.current) {
      prevSelectedSpanIdRef.current = selectedSpanId;
      return;
    }

    prevSelectedSpanIdRef.current = selectedSpanId;

    const container = containerRef.current;
    if (!container) return;

    // Find the layout for the selected span
    const selectedLayout = layouts.find((l) => l.spanId === selectedSpanId);
    if (!selectedLayout) return;

    // Calculate the y position of the selected span
    const spanY =
      PADDING +
      (showRuler ? RULER_HEIGHT : 0) +
      selectedLayout.row * ROW_HEIGHT;

    // Check if span is visible in the viewport
    const containerRect = container.getBoundingClientRect();
    const scrollTop = container.scrollTop;
    const viewportTop = scrollTop;
    const viewportBottom = scrollTop + containerRect.height;

    // If span is outside viewport, scroll to it
    if (spanY < viewportTop || spanY + ROW_HEIGHT > viewportBottom) {
      container.scrollTo({
        top: spanY - containerRect.height / 2 + ROW_HEIGHT / 2,
        behavior: "smooth",
      });
    }
  }, [selectedSpanId, layouts, showRuler]);

  // Handle span selection
  const handleSelectSpan = useCallback(
    (spanId: string) => {
      onSelectSpan?.(spanId);
    },
    [onSelectSpan]
  );

  // Handle tooltip hover (T027-T028)
  const handleBarMouseEnter = useCallback(
    (layout: TimelineBarLayout, event: React.MouseEvent) => {
      setTooltipData({
        layout,
        position: { x: event.clientX, y: event.clientY },
      });
    },
    []
  );

  const handleBarMouseLeave = useCallback(() => {
    setTooltipData({ layout: null, position: null });
  }, []);

  // Keyboard navigation state (T042-T044)
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (layouts.length === 0) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setFocusedIndex((prev) =>
            prev < layouts.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < layouts.length) {
            const focusedLayout = layouts[focusedIndex];
            if (focusedLayout) {
              handleSelectSpan(focusedLayout.spanId);
            }
          }
          break;
        case "Home":
          event.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          event.preventDefault();
          setFocusedIndex(layouts.length - 1);
          break;
      }
    },
    [layouts, focusedIndex, handleSelectSpan]
  );

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ p: 2, ...sx }}>
        <Skeleton variant="rectangular" height={200} />
      </Box>
    );
  }

  // Empty state
  if (spans.length === 0) {
    return (
      <Box
        sx={{
          p: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.secondary",
          ...sx,
        }}
      >
        <Typography variant="body2">No spans to display</Typography>
      </Box>
    );
  }

  return (
    <TimelineErrorBoundary>
    <Box
      ref={containerRef}
      sx={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        flex: 1,
        overflow: "auto",
        backgroundColor: theme.palette.background.default,
        position: "relative",
        ...sx,
      }}
    >
      {/* Zoom Controls (T034) */}
      {enableZoom && (
        <Box
          sx={{
            position: "sticky",
            top: 4,
            right: 4,
            zIndex: 10,
            display: "flex",
            gap: 0.5,
            justifyContent: "flex-end",
            pr: 1,
            pt: 0.5,
          }}
        >
          <Tooltip title="Zoom in">
            <IconButton
              size="small"
              onClick={zoomIn}
              sx={{
                backgroundColor: theme.palette.background.paper,
                "&:hover": { backgroundColor: theme.palette.action.hover },
                fontSize: 16,
                fontWeight: "bold",
              }}
              aria-label="Zoom in"
            >
              +
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom out">
            <IconButton
              size="small"
              onClick={zoomOut}
              sx={{
                backgroundColor: theme.palette.background.paper,
                "&:hover": { backgroundColor: theme.palette.action.hover },
                fontSize: 16,
                fontWeight: "bold",
              }}
              aria-label="Zoom out"
            >
              −
            </IconButton>
          </Tooltip>
          <Tooltip title="Fit all">
            <IconButton
              size="small"
              onClick={resetZoom}
              sx={{
                backgroundColor: theme.palette.background.paper,
                "&:hover": { backgroundColor: theme.palette.action.hover },
                fontSize: 12,
              }}
              aria-label="Fit all"
            >
              ⊡
            </IconButton>
          </Tooltip>
        </Box>
      )}

      <svg
        width={containerWidth}
        height={totalHeight}
        viewBox={
          viewState.scale !== 1
            ? `${viewState.viewBox.x} ${viewState.viewBox.y} ${viewState.viewBox.width} ${viewState.viewBox.height}`
            : undefined
        }
        style={{
          display: "block",
          cursor: enablePan && viewState.isPanning ? "grabbing" : enablePan ? "grab" : "default",
          outline: "none",
        }}
        role="grid"
        aria-label="Trace timeline"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onWheel={enableZoom ? onWheel : undefined}
        {...(enablePan ? panHandlers : {})}
      >
        {/* Ruler */}
        {showRuler && (
          <g transform={`translate(${LABEL_WIDTH + PADDING}, ${PADDING})`}>
            <TimelineRuler ticks={rulerTicks} width={timelineWidth} />
          </g>
        )}

        {/* Span labels (left side) - virtualized for large traces */}
        <g
          transform={`translate(${PADDING}, ${PADDING + (showRuler ? RULER_HEIGHT : 0)})`}
        >
          {visibleLayouts.map((layout) => (
            <g key={`label-${layout.spanId}`}>
              <text
                x={layout.depth * 12}
                y={layout.row * ROW_HEIGHT + ROW_HEIGHT / 2}
                dominantBaseline="central"
                fontSize={11}
                fill={theme.palette.text.primary}
                style={{
                  userSelect: "none",
                  cursor: "pointer",
                }}
                onClick={() => handleSelectSpan(layout.spanId)}
              >
                {truncateLabel(layout.name, LABEL_WIDTH - layout.depth * 12 - 8)}
              </text>
            </g>
          ))}
        </g>

        {/* Timeline bars - virtualized for large traces (T035) */}
        <g
          transform={`translate(${LABEL_WIDTH + PADDING}, ${PADDING + (showRuler ? RULER_HEIGHT : 0)})`}
        >
          {/* Grid lines */}
          {rulerTicks
            .filter((tick) => tick.isMajor)
            .map((tick, index) => (
              <line
                key={`grid-${index}`}
                x1={tick.position * timelineWidth}
                y1={0}
                x2={tick.position * timelineWidth}
                y2={contentHeight}
                stroke={theme.palette.divider}
                strokeWidth={0.5}
                opacity={0.5}
              />
            ))}

          {/* Row backgrounds (alternating) - virtualized */}
          {visibleLayouts.map((layout) => (
            <rect
              key={`row-bg-${layout.spanId}`}
              x={0}
              y={layout.row * ROW_HEIGHT}
              width={timelineWidth}
              height={ROW_HEIGHT}
              fill={
                layout.row % 2 === 0
                  ? "transparent"
                  : theme.palette.action.hover
              }
              opacity={0.3}
            />
          ))}

          {/* Span bars - virtualized */}
          {visibleLayouts.map((layout) => {
            const layoutIndex = layouts.findIndex((l) => l.spanId === layout.spanId);
            return (
              <TimelineBar
                key={layout.spanId}
                layout={layout}
                isSelected={selectedSpanId === layout.spanId}
                isFocused={focusedIndex === layoutIndex}
                onSelect={handleSelectSpan}
                onMouseEnter={handleBarMouseEnter}
                onMouseLeave={handleBarMouseLeave}
                timelineWidth={timelineWidth}
              />
            );
          })}
        </g>
      </svg>

      {/* Legend (T029) */}
      {showLegend && (
        <TimelineLegend
          typeBreakdown={metrics.typeBreakdown}
          showCounts
        />
      )}

      {/* Tooltip (T028) */}
      <TimelineTooltip
        layout={tooltipData.layout}
        position={tooltipData.position}
        visible={tooltipData.layout !== null}
      />
    </Box>
    </TimelineErrorBoundary>
  );
});

/**
 * Truncate label to fit within available width.
 */
function truncateLabel(label: string, maxWidth: number): string {
  // Rough estimate: ~6px per character
  const maxChars = Math.floor(maxWidth / 6);
  if (label.length <= maxChars) {
    return label;
  }
  return label.slice(0, maxChars - 3) + "...";
}

export default TraceTimeline;
