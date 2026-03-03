/**
 * ExperimentItemsTable Component
 *
 * Displays the items within an experiment in a table layout.
 */

import {
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { Stack } from "@mui/system";
import {
  TableHeadCustom,
  TablePaginationCustom,
  useTable,
  Iconify,
} from "@/components";
import { fCurrency, fNumber } from "@/utils";
import type { ExperimentItemSummary } from "../types";

// ----------------------------------------------------------------------

const scrollableCellSx = {
  maxWidth: 300,
  maxHeight: 120,
  overflow: "auto",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
};

export interface ExperimentItemsTableProps {
  items: ExperimentItemSummary[];
  t: (key: string) => string;
  onTraceClick?: (traceId: string) => void;
}

export const ExperimentItemsTable = ({ items, t, onTraceClick }: ExperimentItemsTableProps) => {
  const table = useTable();

  const paginatedItems = items.slice(
    table.page * table.rowsPerPage,
    table.page * table.rowsPerPage + table.rowsPerPage
  );

  return (
    <Stack spacing={2}>
      <TableContainer sx={{ position: "relative", overflow: "auto" }}>
        <Table size={table.dense ? "small" : "medium"}>
          <TableHeadCustom
            headLabel={[
              { id: "itemName", label: t("itemName") },
              { id: "input", label: t("input") },
              { id: "output", label: t("output") },
              { id: "expectedOutput", label: t("expectedOutput") },
              { id: "model", label: t("model") },
              { id: "latency", label: t("latency") },
              { id: "cost", label: t("cost") },
              { id: "tokens", label: t("tokens") },
              { id: "scores", label: t("scores") },
              { id: "trace", label: t("trace"), width: 60 },
            ]}
          />
          <TableBody>
            {paginatedItems.map((item) => (
              <TableRow key={item.traceId} hover>
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                    {item.itemName || "-"}
                  </Typography>
                </TableCell>
                <TableCell sx={scrollableCellSx}>
                  <Typography
                    variant="caption"
                    component="div"
                    sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    {item.input || "-"}
                  </Typography>
                </TableCell>
                <TableCell sx={scrollableCellSx}>
                  <Typography
                    variant="caption"
                    component="div"
                    sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    {item.output || "-"}
                  </Typography>
                </TableCell>
                <TableCell sx={scrollableCellSx}>
                  <Typography
                    variant="caption"
                    component="div"
                    sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    {item.expectedOutput || "-"}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                    {item.model || "-"}
                  </Typography>
                </TableCell>
                <TableCell>{fNumber(item.latencyMs / 1000)}s</TableCell>
                <TableCell>{fCurrency(item.cost, 5)}</TableCell>
                <TableCell>{item.tokens}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap">
                    {item.scores.length > 0
                      ? item.scores.map((score) => (
                          <Chip
                            key={score.name}
                            label={`${score.name}: ${fNumber(score.score, true)}`}
                            size="small"
                            variant="outlined"
                          />
                        ))
                      : (
                        <Typography
                          variant="body2"
                          color="text.disabled"
                        >
                          {t("noScores")}
                        </Typography>
                      )}
                  </Stack>
                </TableCell>
                <TableCell>
                  {onTraceClick && (
                    <Tooltip title={t("viewTrace")}>
                      <IconButton
                        onClick={() => onTraceClick(item.traceId)}
                        color="primary"
                        size="small"
                      >
                        <Iconify icon="material-symbols-light:account-tree-rounded" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePaginationCustom
        count={items.length}
        page={table.page}
        rowsPerPage={table.rowsPerPage}
        onPageChange={table.onChangePage}
        onRowsPerPageChange={table.onChangeRowsPerPage}
        dense={table.dense}
        onChangeDense={table.onChangeDense}
      />
    </Stack>
  );
};
