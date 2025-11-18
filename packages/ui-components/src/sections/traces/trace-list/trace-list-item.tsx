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
            trace.status === "0" || trace.status === "1"
              ? theme.palette.success.main
              : theme.palette.error.main
          }
          icon={
            trace.status === "0" || trace.status === "1"
              ? "mdi:check-circle-outline"
              : "mdi:close-circle-outline"
          }
        />
      </TableCell>
      <TableCell>
        <Label color="info" startIcon={<Iconify icon="mdi:clock-outline" />}>
          {(parseInt(trace.latency) / 1000).toFixed(2)}s
        </Label>
      </TableCell>
      <TableCell>{fCurrency(`${trace.cost}` || 0, 5)}</TableCell>
      <TableCell>
        <Label color="default" startIcon={<Iconify icon="game-icons:token" />}>
          {fNumber(trace.tokens || 0)}
        </Label>
      </TableCell>
      <TableCell>
        {format(new Date(trace.start), "MMM d, yyyy h:mm a")}
      </TableCell>
    </TableRow>
  );
};

export { TraceListItem };
