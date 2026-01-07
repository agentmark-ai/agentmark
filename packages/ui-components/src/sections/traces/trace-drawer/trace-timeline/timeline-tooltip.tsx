/**
 * TimelineTooltip Component
 *
 * Displays hover tooltip with span details for the timeline.
 */

import React, { memo, useMemo } from "react";
import { Box, Typography, Paper, Divider, Chip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { getNodeTypeStyle } from "../../utils/node-styling";
import type { TimelineTooltipProps } from "./timeline-types";

/**
 * Format duration for display.
 */
function formatDuration(ms: number): string {
  if (ms < 1) {
    return "<1ms";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format start time relative to trace start.
 */
function formatStartTime(ms: number): string {
  if (ms < 1000) {
    return `+${Math.round(ms)}ms`;
  }
  return `+${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format cost for display.
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(6)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count for display.
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return String(tokens);
}

/**
 * Truncate text for preview.
 */
function truncateText(text: string | undefined, maxLength: number): string {
  if (!text) return "";
  const cleanText = text.replace(/\n/g, " ").trim();
  if (cleanText.length <= maxLength) return cleanText;
  return cleanText.slice(0, maxLength) + "...";
}

/**
 * TimelineTooltip component displays span details on hover.
 */
export const TimelineTooltip = memo(function TimelineTooltip({
  layout,
  position,
  visible,
}: TimelineTooltipProps) {
  const theme = useTheme();

  // Memoize attributes parsing to avoid re-parsing on every render
  // Must be called before any conditional returns to satisfy hooks rules
  const parsedAttributes = useMemo(() => {
    const attributes = layout?.span?.data?.attributes;
    if (!attributes) return null;
    try {
      return typeof attributes === "string"
        ? JSON.parse(attributes)
        : attributes;
    } catch {
      // Ignore parse errors
      return null;
    }
  }, [layout?.span?.data?.attributes]);

  if (!visible || !layout || !position) {
    return null;
  }

  const nodeStyle = getNodeTypeStyle(layout.nodeType, theme);
  const spanData = layout.span.data;

  // Check if we have additional data to show
  const hasModelInfo = spanData.model || spanData.totalTokens || spanData.cost;
  const hasInputOutput = spanData.input || spanData.output;
  const hasToolCalls = spanData.toolCalls;

  const hasAttributes =
    parsedAttributes && Object.keys(parsedAttributes).length > 0;

  // Calculate position with viewport boundary checking
  const tooltipWidth = 340;
  const tooltipHeight = 280; // Increased for additional content
  const padding = 12;

  let left = position.x + padding;
  let top = position.y + padding;

  // Check right boundary
  if (typeof window !== "undefined") {
    if (left + tooltipWidth > window.innerWidth - padding) {
      left = position.x - tooltipWidth - padding;
    }
    // Check bottom boundary
    if (top + tooltipHeight > window.innerHeight - padding) {
      top = position.y - tooltipHeight - padding;
    }
    // Ensure not off left or top edge
    left = Math.max(padding, left);
    top = Math.max(padding, top);
  }

  return (
    <Paper
      elevation={8}
      sx={{
        position: "fixed",
        left,
        top,
        zIndex: theme.zIndex.tooltip,
        p: 1.5,
        maxWidth: tooltipWidth,
        maxHeight: 400,
        overflow: "auto",
        pointerEvents: "none",
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      {/* Span name with type indicator */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: nodeStyle.color,
            flexShrink: 0,
          }}
        />
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 600,
            wordBreak: "break-word",
            color: theme.palette.text.primary,
          }}
        >
          {layout.name}
        </Typography>
      </Box>

      {/* Timing details grid */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 0.5,
          rowGap: 0.25,
        }}
      >
        {/* Duration */}
        <Typography variant="caption" color="text.secondary">
          Duration:
        </Typography>
        <Typography variant="caption" fontWeight={500}>
          {formatDuration(layout.durationMs)}
        </Typography>

        {/* Start time */}
        <Typography variant="caption" color="text.secondary">
          Start:
        </Typography>
        <Typography variant="caption">
          {formatStartTime(layout.startTimeMs)}
        </Typography>

        {/* Percentage of trace */}
        <Typography variant="caption" color="text.secondary">
          % of trace:
        </Typography>
        <Typography variant="caption">
          {layout.percentOfTrace.toFixed(1)}%
        </Typography>

        {/* Type */}
        <Typography variant="caption" color="text.secondary">
          Type:
        </Typography>
        <Typography variant="caption" sx={{ textTransform: "capitalize" }}>
          {layout.nodeType}
        </Typography>

        {/* Error indicator */}
        {layout.hasError && (
          <>
            <Typography variant="caption" color="error.main">
              Status:
            </Typography>
            <Typography variant="caption" color="error.main" fontWeight={500}>
              {spanData.statusMessage || "Error"}
            </Typography>
          </>
        )}
      </Box>

      {/* Model / LLM Info Section */}
      {hasModelInfo && (
        <>
          <Divider sx={{ my: 1 }} />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 0.5,
              rowGap: 0.25,
            }}
          >
            {spanData.model && (
              <>
                <Typography variant="caption" color="text.secondary">
                  Model:
                </Typography>
                <Typography variant="caption" fontWeight={500}>
                  {spanData.model}
                </Typography>
              </>
            )}

            {(spanData.inputTokens || spanData.outputTokens) && (
              <>
                <Typography variant="caption" color="text.secondary">
                  Tokens:
                </Typography>
                <Typography variant="caption">
                  {spanData.inputTokens
                    ? `${formatTokens(spanData.inputTokens)} in`
                    : ""}
                  {spanData.inputTokens && spanData.outputTokens ? " / " : ""}
                  {spanData.outputTokens
                    ? `${formatTokens(spanData.outputTokens)} out`
                    : ""}
                  {spanData.totalTokens &&
                    ` (${formatTokens(spanData.totalTokens)} total)`}
                </Typography>
              </>
            )}

            {spanData.reasoningTokens && spanData.reasoningTokens > 0 && (
              <>
                <Typography variant="caption" color="text.secondary">
                  Reasoning:
                </Typography>
                <Typography variant="caption">
                  {formatTokens(spanData.reasoningTokens)} tokens
                </Typography>
              </>
            )}

            {spanData.cost != null && spanData.cost > 0 && (
              <>
                <Typography variant="caption" color="text.secondary">
                  Cost:
                </Typography>
                <Typography variant="caption" fontWeight={500}>
                  {formatCost(spanData.cost)}
                </Typography>
              </>
            )}

            {spanData.finishReason && (
              <>
                <Typography variant="caption" color="text.secondary">
                  Finish:
                </Typography>
                <Typography variant="caption">
                  {spanData.finishReason}
                </Typography>
              </>
            )}
          </Box>
        </>
      )}

      {/* Input/Output Preview Section */}
      {hasInputOutput && (
        <>
          <Divider sx={{ my: 1 }} />
          {spanData.input && (
            <Box sx={{ mb: 0.5 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 0.25 }}
              >
                Input:
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  backgroundColor: theme.palette.action.hover,
                  borderRadius: 0.5,
                  p: 0.5,
                  fontFamily: "monospace",
                  fontSize: "0.7rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {truncateText(spanData.input, 100)}
              </Typography>
            </Box>
          )}
          {spanData.output && (
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 0.25 }}
              >
                Output:
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  backgroundColor: theme.palette.action.hover,
                  borderRadius: 0.5,
                  p: 0.5,
                  fontFamily: "monospace",
                  fontSize: "0.7rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {truncateText(spanData.output, 100)}
              </Typography>
            </Box>
          )}
        </>
      )}

      {/* Tool Calls Section */}
      {hasToolCalls && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 0.25 }}
          >
            Tool Calls:
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              backgroundColor: theme.palette.action.hover,
              borderRadius: 0.5,
              p: 0.5,
              fontFamily: "monospace",
              fontSize: "0.7rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {truncateText(spanData.toolCalls, 80)}
          </Typography>
        </>
      )}

      {/* Attributes Section */}
      {hasAttributes && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 0.5 }}
          >
            Attributes:
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {Object.entries(parsedAttributes!)
              .slice(0, 5)
              .map(([key, value]) => (
                <Chip
                  key={key}
                  label={`${key}: ${truncateText(String(value), 20)}`}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 20,
                    fontSize: "0.65rem",
                    "& .MuiChip-label": { px: 0.75 },
                  }}
                />
              ))}
            {Object.keys(parsedAttributes!).length > 5 && (
              <Chip
                label={`+${Object.keys(parsedAttributes!).length - 5} more`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: "0.65rem",
                  "& .MuiChip-label": { px: 0.75 },
                }}
              />
            )}
          </Box>
        </>
      )}
    </Paper>
  );
});

export default TimelineTooltip;
