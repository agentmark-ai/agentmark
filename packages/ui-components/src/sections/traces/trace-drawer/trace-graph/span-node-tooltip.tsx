import { Box, Divider, Typography } from "@mui/material";
import type { SpanData } from "../../types";
import { extractSpanSummary } from "./span-node-tooltip-utils";

interface SpanNodeTooltipProps {
  span: SpanData;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography
        variant="caption"
        sx={{ color: "grey.400", flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "grey.100",
          textAlign: "right",
          wordBreak: "break-word",
          maxWidth: 220,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/**
 * Renders a compact data summary for a span, shown inside a Tooltip.
 * Only rows with non-null values are rendered.
 */
export function SpanNodeTooltip({ span }: SpanNodeTooltipProps) {
  const s = extractSpanSummary(span);

  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Duration", value: s.duration },
    { label: "Model", value: s.model },
    { label: "Status", value: s.status },
    { label: "Input tokens", value: s.inputTokens },
    { label: "Output tokens", value: s.outputTokens },
    { label: "Total tokens", value: s.totalTokens },
    { label: "Cost", value: s.cost },
  ];

  const visibleRows = rows.filter((r) => r.value !== null);
  const hasInput = s.input !== null;
  const hasOutput = s.output !== null;

  return (
    <Box sx={{ p: 0.5, maxWidth: 320 }}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: "grey.100", display: "block", mb: 0.5 }}
      >
        {s.name}
      </Typography>

      {visibleRows.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
          {visibleRows.map((r) => (
            <Row key={r.label} label={r.label} value={r.value!} />
          ))}
        </Box>
      )}

      {(hasInput || hasOutput) && (
        <>
          <Divider sx={{ my: 0.75, borderColor: "grey.700" }} />
          {hasInput && (
            <Box sx={{ mb: hasOutput ? 0.75 : 0 }}>
              <Typography
                variant="caption"
                sx={{ color: "grey.400", display: "block", mb: 0.25 }}
              >
                Input
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "grey.200",
                  display: "block",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "monospace",
                  fontSize: "0.65rem",
                  maxHeight: 80,
                  overflow: "hidden",
                }}
              >
                {s.input}
              </Typography>
            </Box>
          )}
          {hasOutput && (
            <Box>
              <Typography
                variant="caption"
                sx={{ color: "grey.400", display: "block", mb: 0.25 }}
              >
                Output
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "grey.200",
                  display: "block",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "monospace",
                  fontSize: "0.65rem",
                  maxHeight: 80,
                  overflow: "hidden",
                }}
              >
                {s.output}
              </Typography>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
