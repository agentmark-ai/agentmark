/**
 * ExperimentComparison Component
 *
 * Composes ComparisonSummaryBanner + ComparisonTable with sort controls.
 * The sort state is managed internally.
 */

import { useMemo, useState } from "react";
import { Chip, Skeleton, Typography } from "@mui/material";
import { Stack } from "@mui/system";
import type {
  ComparisonRow,
  ComparisonSummary as ComparisonSummaryType,
  ComparisonSortMode,
  ComparisonFilterMode,
} from "../types";
import { sortComparisonRows } from "./comparison-utils";
import { ComparisonSummaryBanner } from "./comparison-summary";
import { ComparisonTable } from "./comparison-table";

// ----------------------------------------------------------------------

const FILTER_MODES: ComparisonFilterMode[] = [
  "all",
  "regressed",
  "improved",
  "unchanged",
];

function filterRows(
  rows: ComparisonRow[],
  mode: ComparisonFilterMode
): ComparisonRow[] {
  if (mode === "all") {
    return rows;
  }
  if (mode === "regressed") {
    return rows.filter((row) =>
      row.scoreDeltas.some((d) => d.status === "regressed")
    );
  }
  if (mode === "improved") {
    return rows.filter((row) =>
      row.scoreDeltas.some((d) => d.status === "improved")
    );
  }
  // unchanged: no delta is regressed or improved
  return rows.filter(
    (row) =>
      !row.scoreDeltas.some(
        (d) => d.status === "regressed" || d.status === "improved"
      )
  );
}

// ----------------------------------------------------------------------

export interface ExperimentComparisonProps {
  rows: ComparisonRow[];
  experimentNames: Record<string, string>;
  experimentIds: string[];
  experimentCommitShas?: Record<string, string | undefined>;
  summary: ComparisonSummaryType | null;
  isLoading: boolean;
  t: (key: string) => string;
  headerSlot?: React.ReactNode;
}

export const ExperimentComparison = ({
  rows,
  experimentNames,
  experimentIds,
  experimentCommitShas,
  summary,
  isLoading,
  t,
  headerSlot,
}: ExperimentComparisonProps) => {
  const [sortMode, setSortMode] = useState<ComparisonSortMode>("item-name");
  const [filterMode, setFilterMode] = useState<ComparisonFilterMode>("all");

  const filteredRows = useMemo(
    () => filterRows(rows, filterMode),
    [rows, filterMode]
  );

  const sortedRows = useMemo(
    () => sortComparisonRows(filteredRows, sortMode),
    [filteredRows, sortMode]
  );

  const commitShasArray = useMemo(
    () => experimentIds.map((id) => experimentCommitShas?.[id]),
    [experimentIds, experimentCommitShas]
  );

  if (isLoading) {
    return (
      <Stack spacing={3} sx={{ p: 2 }}>
        <Skeleton variant="rectangular" height={40} width={120} />
        <Skeleton variant="rectangular" height={32} width={300} />
        <Skeleton variant="rectangular" height={200} />
        <Skeleton variant="rectangular" height={400} />
      </Stack>
    );
  }

  return (
    <Stack spacing={3} sx={{ p: 2 }}>
      {headerSlot}

      <Typography variant="h4">{t("compareExperiments")}</Typography>

      {summary && (
        <ComparisonSummaryBanner
          summary={summary}
          commitShas={commitShasArray}
          t={t}
        />
      )}

      {/* Filter chips */}
      <Stack direction="row" spacing={1}>
        {FILTER_MODES.map((mode) => (
          <Chip
            key={mode}
            label={`${t(`filter.${mode}`)}${mode !== "all" ? ` (${filterRows(rows, mode).length})` : ""}`}
            size="small"
            variant={filterMode === mode ? "filled" : "outlined"}
            color={filterMode === mode ? "primary" : "default"}
            onClick={() => setFilterMode(mode)}
          />
        ))}
      </Stack>

      <ComparisonTable
        rows={sortedRows}
        experimentIds={experimentIds}
        experimentNames={experimentNames}
        experimentCommitShas={experimentCommitShas}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        t={t}
      />
    </Stack>
  );
};
