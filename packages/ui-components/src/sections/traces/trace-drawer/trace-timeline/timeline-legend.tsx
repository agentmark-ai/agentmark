/**
 * TimelineLegend Component
 *
 * Displays a legend showing span type colors for the timeline.
 */

import React, { memo } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { getNodeTypeStyle } from "../../utils/node-styling";
import type { TimelineLegendProps } from "./timeline-types";
import type { WorkflowNodeType } from "../../utils/span-grouping";

/** Display names for node types */
const NODE_TYPE_LABELS: Record<WorkflowNodeType, string> = {
  llm: "LLM",
  tool: "Tool",
  agent: "Agent",
  retrieval: "Retrieval",
  router: "Router",
  memory: "Memory",
  default: "Other",
  start: "Start",
  end: "End",
};

/** Order to display node types in legend */
const NODE_TYPE_ORDER: WorkflowNodeType[] = [
  "llm",
  "tool",
  "agent",
  "retrieval",
  "router",
  "memory",
  "default",
];

/**
 * TimelineLegend component displays span type colors.
 */
export const TimelineLegend = memo(function TimelineLegend({
  typeBreakdown,
  showCounts = false,
}: TimelineLegendProps) {
  const theme = useTheme();

  // Filter to only show types that exist in the trace
  const visibleTypes = NODE_TYPE_ORDER.filter(
    (type) => typeBreakdown[type] !== undefined && typeBreakdown[type]! > 0
  );

  if (visibleTypes.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1.5,
        px: 1,
        py: 0.5,
        borderTop: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
      }}
      role="legend"
      aria-label="Span type legend"
    >
      {visibleTypes.map((type) => {
        const style = getNodeTypeStyle(type, theme);
        const count = typeBreakdown[type] || 0;
        const label = NODE_TYPE_LABELS[type];

        return (
          <Box
            key={type}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
            }}
          >
            {/* Color swatch */}
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: 0.5,
                backgroundColor: style.color,
                flexShrink: 0,
              }}
            />

            {/* Label and optional count */}
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.text.secondary,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {label}
              {showCounts && count > 0 && (
                <Typography
                  component="span"
                  variant="caption"
                  sx={{
                    color: theme.palette.text.disabled,
                    ml: 0.5,
                  }}
                >
                  ({count})
                </Typography>
              )}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
});

export default TimelineLegend;
