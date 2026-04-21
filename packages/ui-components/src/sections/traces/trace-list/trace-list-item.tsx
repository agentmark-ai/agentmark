import { TableCell, TableRow, useTheme } from "@mui/material";
import { format } from "date-fns";
import { Iconify, Label } from "@/components";
import { fCurrency, fNumber } from "@/utils";
import type { Trace } from "../types";

interface TraceListItemProps {
  trace: Trace;
  onClick: (trace: Trace) => void;
}

const TraceListItem = ({ trace, onClick }: TraceListItemProps) => {
  const theme = useTheme();

  return (
    <TableRow onClick={() => onClick(trace)} hover sx={{ cursor: "pointer" }}>
      <TableCell>
        <Label
          color="primary"
          sx={{
            textTransform: "none",
          }}
        >
          {trace.name}
        </Label>
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
