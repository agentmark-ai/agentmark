/**
 * ExperimentItemsTable Component
 *
 * Displays the items within an experiment in a table layout.
 */

import { useState } from "react";
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
import { ExpandableCell, OUTPUT_TRUNCATE_LENGTH } from "../expandable-cell";
import type { ExperimentItemSummary } from "../types";

// ----------------------------------------------------------------------

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
              <ExperimentItemRow
                key={item.traceId}
                item={item}
                t={t}
                onTraceClick={onTraceClick}
              />
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

// ----------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------

/** The three free-form text columns that should truncate + expand. */
type ExpandableCellKey = "input" | "output" | "expectedOutput";

interface ExperimentItemRowProps {
  item: ExperimentItemSummary;
  t: (key: string) => string;
  onTraceClick?: (traceId: string) => void;
}

function ExperimentItemRow({ item, t, onTraceClick }: ExperimentItemRowProps) {
  // Per-row expand state for the three long-text cells. A Record keyed by
  // cell name scales without extra useState calls; `toggle` flips one key
  // immutably so React re-renders.
  const [expanded, setExpanded] = useState<Record<ExpandableCellKey, boolean>>({
    input: false,
    output: false,
    expectedOutput: false,
  });

  const isExpanded = (key: ExpandableCellKey) => expanded[key];
  const toggle = (key: ExpandableCellKey) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <TableRow hover>
      <TableCell>
        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
          {item.itemName || "-"}
        </Typography>
      </TableCell>
      <ExpandableCell
        text={item.input || ""}
        maxLength={OUTPUT_TRUNCATE_LENGTH}
        isExpanded={isExpanded("input")}
        onToggle={() => toggle("input")}
        t={t}
      />
      <ExpandableCell
        text={item.output || ""}
        maxLength={OUTPUT_TRUNCATE_LENGTH}
        isExpanded={isExpanded("output")}
        onToggle={() => toggle("output")}
        t={t}
      />
      <ExpandableCell
        text={item.expectedOutput || ""}
        maxLength={OUTPUT_TRUNCATE_LENGTH}
        isExpanded={isExpanded("expectedOutput")}
        onToggle={() => toggle("expectedOutput")}
        t={t}
      />
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
              <Typography variant="body2" color="text.disabled">
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
  );
}
