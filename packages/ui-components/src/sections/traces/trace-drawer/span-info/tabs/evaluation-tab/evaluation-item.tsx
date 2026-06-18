import { Chip, TableCell } from "@mui/material";

import { TableRow } from "@mui/material";

interface EvaluationItemProps {
  name: string;
  score: number;
  label: string;
  reason: string;
  source?: "experiment" | "annotation" | "api" | "eval";
}

export const EvaluationItem = ({
  name,
  score,
  label,
  reason,
  source,
}: EvaluationItemProps) => {
  return (
    <TableRow>
      <TableCell>{name || "-"}</TableCell>
      <TableCell>{score}</TableCell>
      <TableCell>{label}</TableCell>
      <TableCell sx={{ whiteSpace: "pre-wrap" }}>{reason}</TableCell>
      <TableCell>
        <Chip
          size="small"
          label={source || "experiment"}
          variant={source === "annotation" ? "filled" : "outlined"}
          color={source === "annotation" ? "primary" : "default"}
        />
      </TableCell>
    </TableRow>
  );
};
