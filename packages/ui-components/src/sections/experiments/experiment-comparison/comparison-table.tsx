/**
 * ComparisonTable Component
 *
 * Renders a side-by-side comparison table for 2-3 experiments.
 */

import { useCallback, useState } from "react";
import {
  Chip,
  Collapse,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import Box from "@mui/material/Box";
import { Stack } from "@mui/system";
import { TablePaginationCustom, useTable, Iconify } from "@/components";
import { fCurrency, fNumber } from "@/utils";
import type {
  ComparisonRow,
  ComparisonSortMode,
  ScoreDelta,
  ExperimentItemScore,
} from "../types";
import { ComparisonDiffView } from "./comparison-diff-view";

// ----------------------------------------------------------------------

const scrollableCellSx = {
  maxWidth: 300,
  maxHeight: 120,
  overflow: "auto",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
};

const OUTPUT_TRUNCATE_LENGTH = 120;

const SORT_MODE_OPTIONS: ComparisonSortMode[] = [
  "item-name",
  "regressions-first",
  "improvements-first",
  "delta-abs",
];

// ----------------------------------------------------------------------

export interface ComparisonTableProps {
  rows: ComparisonRow[];
  experimentNames: Record<string, string>;
  experimentIds: string[];
  sortMode: ComparisonSortMode;
  onSortModeChange: (mode: ComparisonSortMode) => void;
  t: (key: string) => string;
}

export const ComparisonTable = ({
  rows,
  experimentNames,
  experimentIds,
  sortMode,
  onSortModeChange,
  t,
}: ComparisonTableProps) => {
  const table = useTable();

  const paginatedRows = rows.slice(
    table.page * table.rowsPerPage,
    table.page * table.rowsPerPage + table.rowsPerPage
  );

  const hasDeltas = rows.some((row) => row.scoreDeltas.length > 0);

  const subColumnsPerExperiment = 4;
  const experimentColSpan = subColumnsPerExperiment;

  return (
    <Stack spacing={2}>
      {/* Sort control */}
      <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1}>
        <Typography variant="body2" color="text.secondary">
          {t("sortBy")}:
        </Typography>
        <Select
          size="small"
          value={sortMode}
          onChange={(e) => onSortModeChange(e.target.value as ComparisonSortMode)}
          sx={{ minWidth: 180 }}
        >
          {SORT_MODE_OPTIONS.map((mode) => (
            <MenuItem key={mode} value={mode}>
              {t(`sort.${mode}`)}
            </MenuItem>
          ))}
        </Select>
      </Stack>

      <TableContainer sx={{ position: "relative", overflow: "auto" }}>
        <Table size={table.dense ? "small" : "medium"} sx={{ minWidth: experimentIds.length * 500 + 200 }}>
          {/* Group header row */}
          <TableHead>
            <TableRow>
              <TableCell
                rowSpan={2}
                sx={{ verticalAlign: "bottom", minWidth: 160 }}
              >
                <Typography variant="subtitle2">
                  {t("itemName")}
                </Typography>
              </TableCell>

              {experimentIds.map((expId) => (
                <TableCell
                  key={expId}
                  colSpan={experimentColSpan}
                  align="center"
                  sx={{
                    borderBottom: 1,
                    borderBottomColor: "divider",
                    bgcolor: "background.neutral",
                  }}
                >
                  <Typography variant="subtitle2" noWrap>
                    {experimentNames[expId] || expId}
                  </Typography>
                </TableCell>
              ))}

              {hasDeltas && (
                <TableCell
                  rowSpan={2}
                  align="center"
                  sx={{ verticalAlign: "bottom", minWidth: 100 }}
                >
                  <Typography variant="subtitle2">
                    {t("delta")}
                  </Typography>
                </TableCell>
              )}
            </TableRow>

            {/* Sub-header row */}
            <TableRow>
              {experimentIds.map((expId) => (
                <SubHeaderCells key={expId} t={t} />
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {paginatedRows.map((row) => (
              <ComparisonTableRow
                key={row.itemName}
                row={row}
                experimentIds={experimentIds}
                experimentNames={experimentNames}
                hasDeltas={hasDeltas}
                t={t}
              />
            ))}

            {paginatedRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={
                    1 +
                    experimentIds.length * subColumnsPerExperiment +
                    (hasDeltas ? 1 : 0)
                  }
                  align="center"
                  sx={{ py: 6 }}
                >
                  <Typography variant="body2" color="text.disabled">
                    {t("noItems")}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePaginationCustom
        count={rows.length}
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

function SubHeaderCells({ t }: { t: (key: string) => string }) {
  return (
    <>
      <TableCell sx={{ minWidth: 200 }}>
        <Typography variant="caption" fontWeight="bold">
          {t("output")}
        </Typography>
      </TableCell>
      <TableCell sx={{ minWidth: 120 }}>
        <Typography variant="caption" fontWeight="bold">
          {t("score")}
        </Typography>
      </TableCell>
      <TableCell sx={{ minWidth: 80 }}>
        <Typography variant="caption" fontWeight="bold">
          {t("latency")}
        </Typography>
      </TableCell>
      <TableCell sx={{ minWidth: 80 }}>
        <Typography variant="caption" fontWeight="bold">
          {t("cost")}
        </Typography>
      </TableCell>
    </>
  );
}

// ----------------------------------------------------------------------

function ComparisonTableRow({
  row,
  experimentIds,
  experimentNames,
  hasDeltas,
  t,
}: {
  row: ComparisonRow;
  experimentIds: string[];
  experimentNames: Record<string, string>;
  hasDeltas: boolean;
  t: (key: string) => string;
}) {
  const [expandedOutputs, setExpandedOutputs] = useState<Record<string, boolean>>({});
  const [showDiff, setShowDiff] = useState(false);

  const toggleOutput = useCallback((expId: string) => {
    setExpandedOutputs((prev) => ({
      ...prev,
      [expId]: !prev[expId],
    }));
  }, []);

  const avgDeltaValue = computeAvgDelta(row.scoreDeltas);
  const deltaColor = getDeltaColor(row.scoreDeltas);

  const experimentsWithData = experimentIds.filter(
    (expId) => row.experiments[expId] != null
  );
  const canDiff = experimentsWithData.length >= 2;

  const baselineExpId = canDiff ? experimentsWithData[0] : null;
  const comparisonExpId = canDiff ? experimentsWithData[1] : null;

  const subColumnsPerExperiment = 4;
  const totalColumns =
    1 + experimentIds.length * subColumnsPerExperiment + (hasDeltas ? 1 : 0);

  return (
    <>
      <TableRow hover>
        {/* Item name with diff toggle */}
        <TableCell>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="body2" noWrap sx={{ maxWidth: 130 }}>
              {row.itemName || "\u2013"}
            </Typography>
            <IconButton
              size="small"
              onClick={() => setShowDiff(!showDiff)}
              disabled={!canDiff}
              title={t("diff.toggle")}
            >
              <Iconify
                icon={showDiff ? "mdi:text-box-check" : "mdi:text-box-search"}
                width={16}
              />
            </IconButton>
          </Stack>
        </TableCell>

        {/* Per-experiment columns */}
        {experimentIds.map((expId) => {
          const data = row.experiments[expId];
          const isExpanded = expandedOutputs[expId] ?? false;

          if (!data) {
            return <EmptyCells key={expId} />;
          }

          return (
            <ExperimentCells
              key={expId}
              output={data.output}
              scores={data.scores}
              latencyMs={data.latencyMs}
              cost={data.cost}
              isExpanded={isExpanded}
              onToggleOutput={() => toggleOutput(expId)}
              t={t}
            />
          );
        })}

        {/* Delta column */}
        {hasDeltas && (
          <TableCell align="center">
            {row.scoreDeltas.length > 0 ? (
              <Typography
                variant="body2"
                fontWeight="bold"
                color={deltaColor}
              >
                {formatDelta(avgDeltaValue)}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.disabled">
                {"\u2013"}
              </Typography>
            )}
          </TableCell>
        )}
      </TableRow>

      {/* Collapsible diff row */}
      <TableRow>
        <TableCell colSpan={totalColumns} sx={{ p: 0, border: 0 }}>
          <Collapse in={showDiff} unmountOnExit>
            <Box sx={{ p: 2 }}>
              {baselineExpId && comparisonExpId && (
                <ComparisonDiffView
                  baselineOutput={row.experiments[baselineExpId]?.output ?? ""}
                  comparisonOutput={
                    row.experiments[comparisonExpId]?.output ?? ""
                  }
                  baselineName={
                    experimentNames[baselineExpId] || baselineExpId
                  }
                  comparisonName={
                    experimentNames[comparisonExpId] || comparisonExpId
                  }
                  t={t}
                />
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// ----------------------------------------------------------------------

function ExperimentCells({
  output,
  scores,
  latencyMs,
  cost,
  isExpanded,
  onToggleOutput,
  t,
}: {
  output: string;
  scores: ExperimentItemScore[];
  latencyMs: number;
  cost: number;
  isExpanded: boolean;
  onToggleOutput: () => void;
  t: (key: string) => string;
}) {
  const isTruncated = output.length > OUTPUT_TRUNCATE_LENGTH;
  const displayOutput = isExpanded ? output : truncateText(output, OUTPUT_TRUNCATE_LENGTH);

  return (
    <>
      {/* Output */}
      <TableCell sx={scrollableCellSx}>
        <Stack spacing={0.5}>
          <Typography
            variant="caption"
            component="div"
            sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {displayOutput || "\u2013"}
          </Typography>
          {isTruncated && (
            <IconButton size="small" onClick={onToggleOutput} sx={{ alignSelf: "flex-start" }}>
              <Iconify
                icon={isExpanded ? "mdi:chevron-up" : "mdi:chevron-down"}
                width={16}
              />
              <Typography variant="caption" sx={{ ml: 0.5 }}>
                {isExpanded
                  ? t("showLess")
                  : t("showMore")}
              </Typography>
            </IconButton>
          )}
        </Stack>
      </TableCell>

      {/* Score */}
      <TableCell>
        <Stack direction="row" spacing={0.5} flexWrap="wrap">
          {scores.length > 0
            ? scores.map((score) => (
                <Chip
                  key={score.name}
                  label={`${score.name}: ${fNumber(score.score, true)}`}
                  size="small"
                  variant="outlined"
                />
              ))
            : (
              <Typography variant="body2" color="text.disabled">
                {"\u2013"}
              </Typography>
            )}
        </Stack>
      </TableCell>

      {/* Latency */}
      <TableCell>
        <Typography variant="body2">
          {fNumber(latencyMs / 1000)}s
        </Typography>
      </TableCell>

      {/* Cost */}
      <TableCell>
        <Typography variant="body2">
          {fCurrency(cost, 5)}
        </Typography>
      </TableCell>
    </>
  );
}

// ----------------------------------------------------------------------

function EmptyCells() {
  return (
    <>
      <TableCell>
        <Typography variant="body2" color="text.disabled">{"\u2013"}</Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.disabled">{"\u2013"}</Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.disabled">{"\u2013"}</Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.disabled">{"\u2013"}</Typography>
      </TableCell>
    </>
  );
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function computeAvgDelta(deltas: ScoreDelta[]): number {
  if (deltas.length === 0) {
    return 0;
  }
  const sum = deltas.reduce((acc, d) => acc + d.delta, 0);
  return sum / deltas.length;
}

function getDeltaColor(deltas: ScoreDelta[]): string {
  if (deltas.length === 0) {
    return "text.primary";
  }
  const avg = computeAvgDelta(deltas);
  if (avg > 0) {
    return "success.main";
  }
  if (avg < 0) {
    return "error.main";
  }
  return "text.primary";
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}`;
}
