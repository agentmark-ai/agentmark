import { Chip, TableCell } from "@mui/material";

import { TableRow } from "@mui/material";

interface EvaluationItemProps {
  name: string;
  score: number;
  label: string;
  reason: string;
  source?: "eval" | "annotation";
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
          label={source || "eval"}
          variant={source === "annotation" ? "filled" : "outlined"}
          color={source === "annotation" ? "primary" : "default"}
        />
      </TableCell>
    </TableRow>
  );
};
