import { Stack, TableCell, TableRow, Typography, useTheme } from "@mui/material";
import { format } from "date-fns";
import { Iconify, Label } from "@/components";
import { fCurrency, fNumber } from "@/utils";
import type { Trace } from "../types";

interface TraceListItemProps {
  trace: Trace;
  onClick: (trace: Trace) => void;
}

export interface TracePreviewLine {
  /** `'input'` then `'output'` — also used as the React key. */
  kind: "input" | "output";
  text: string;
  /** Muted MUI palette token; output renders dimmer than input. */
  color: "text.secondary" | "text.disabled";
}

/**
 * The preview lines to render under a trace's name — input first, then output,
 * each included only when present. Mirrors how Langfuse/LangSmith preview a
 * trace's I/O in the list. The preview is a single trace-level value (root
 * span, GENERATION fallback — see `deriveTraceIO`), NOT a per-span model.
 * Pure + exported so the selection logic is unit-tested directly rather than
 * through the DOM. Empty ⇒ the row shows no preview.
 */
export function tracePreviewLines(
  trace: Pick<Trace, "input_preview" | "output_preview">,
): TracePreviewLine[] {
  const lines: TracePreviewLine[] = [];
  if (trace.input_preview) {
    lines.push({
      kind: "input",
      text: trace.input_preview,
      color: "text.secondary",
    });
  }
  if (trace.output_preview) {
    lines.push({
      kind: "output",
      text: trace.output_preview,
      color: "text.disabled",
    });
  }
  return lines;
}

const TraceListItem = ({ trace, onClick }: TraceListItemProps) => {
  const theme = useTheme();

  return (
    <TableRow onClick={() => onClick(trace)} hover sx={{ cursor: "pointer" }}>
      <TableCell>
        <Stack spacing={0.25} sx={{ alignItems: "flex-start" }}>
          <Label
            color="primary"
            sx={{
              textTransform: "none",
            }}
          >
            {trace.name}
          </Label>
          {/* Truncated trace-level I/O preview under the name — each line
              clamps to one row with an ellipsis; the full text is in `title`. */}
          {tracePreviewLines(trace).map((line) => (
            <Typography
              key={line.kind}
              variant="caption"
              color={line.color}
              noWrap
              title={line.text}
              sx={{ maxWidth: 340 }}
            >
              {line.text}
            </Typography>
          ))}
        </Stack>
      </TableCell>
      <TableCell>
        <Iconify
          color={
            // Canonical status names from the wire contract. The pre-
            // consolidation code compared numeric codes ("0"/"1") while
            // the server has always emitted names — rendering every trace
            // as ERROR. Fixed here.
            trace.status === "OK" || trace.status === "UNSET"
              ? theme.palette.success.main
              : theme.palette.error.main
          }
          icon={
            trace.status === "OK" || trace.status === "UNSET"
              ? "mdi:check-circle-outline"
              : "mdi:close-circle-outline"
          }
        />
      </TableCell>
      <TableCell>
        <Label color="info" startIcon={<Iconify icon="mdi:clock-outline" />}>
          {(trace.latency_ms / 1000).toFixed(2)}s
        </Label>
      </TableCell>
      <TableCell>{fCurrency(trace.cost, 5)}</TableCell>
      <TableCell>
        <Label color="default" startIcon={<Iconify icon="game-icons:token" />}>
          {fNumber(trace.tokens || 0)}
        </Label>
      </TableCell>
      <TableCell>
        <Label color="default" startIcon={<Iconify icon="mdi:layers-outline" />}>
          {fNumber(trace.span_count || 0)}
        </Label>
      </TableCell>
      <TableCell>
        {format(new Date(trace.start), "MMM d, yyyy h:mm a")}
      </TableCell>
    </TableRow>
  );
};

export { TraceListItem };
