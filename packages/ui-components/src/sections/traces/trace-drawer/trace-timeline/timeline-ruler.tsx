/**
 * TimelineRuler Component
 *
 * Renders the time axis with tick marks and labels for the timeline.
 */

import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { TimelineRulerProps } from "./timeline-types";
import { TIMELINE_CONSTANTS } from "./timeline-types";

const { RULER_HEIGHT } = TIMELINE_CONSTANTS;

/**
 * TimelineRuler component renders the time axis.
 */
export const TimelineRuler = memo(function TimelineRuler({
  ticks,
  width,
  height = RULER_HEIGHT,
}: TimelineRulerProps) {
  const theme = useTheme();

  const majorTickHeight = height * 0.6;
  const minorTickHeight = height * 0.3;

  return (
    <g className="timeline-ruler" role="presentation">
      {/* Background */}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={theme.palette.background.paper}
      />

      {/* Bottom border line */}
      <line
        x1={0}
        y1={height}
        x2={width}
        y2={height}
        stroke={theme.palette.divider}
        strokeWidth={1}
      />

      {/* Tick marks and labels */}
      {ticks.map((tick, index) => {
        const x = tick.position * width;
        const tickHeight = tick.isMajor ? majorTickHeight : minorTickHeight;
        const y1 = height - tickHeight;
        const y2 = height;

        return (
          <g key={index}>
            {/* Tick line */}
            <line
              x1={x}
              y1={y1}
              x2={x}
              y2={y2}
              stroke={theme.palette.text.secondary}
              strokeWidth={tick.isMajor ? 1 : 0.5}
              opacity={tick.isMajor ? 0.8 : 0.4}
            />

            {/* Label (only for major ticks with labels) */}
            {tick.isMajor && tick.label && (
              <text
                x={x}
                y={y1 - 4}
                textAnchor="middle"
                fontSize={10}
                fill={theme.palette.text.secondary}
                style={{ userSelect: "none" }}
              >
                {tick.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
});

export default TimelineRuler;
