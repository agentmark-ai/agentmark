/**
 * ExperimentComparison Component
 *
 * Composes ComparisonSummaryBanner + ComparisonTable with sort controls.
 * The sort state is managed internally.
 */

import { useMemo, useState } from "react";
import { Skeleton, Typography } from "@mui/material";
import { Stack } from "@mui/system";
import type {
  ComparisonRow,
  ComparisonSummary as ComparisonSummaryType,
  ComparisonSortMode,
} from "../types";
import { sortComparisonRows } from "./comparison-utils";
import { ComparisonSummaryBanner } from "./comparison-summary";
import { ComparisonTable } from "./comparison-table";

// ----------------------------------------------------------------------

export interface ExperimentComparisonProps {
  rows: ComparisonRow[];
  experimentNames: Record<string, string>;
  experimentIds: string[];
  summary: ComparisonSummaryType | null;
  isLoading: boolean;
  t: (key: string) => string;
  headerSlot?: React.ReactNode;
}

export const ExperimentComparison = ({
  rows,
  experimentNames,
  experimentIds,
  summary,
  isLoading,
  t,
  headerSlot,
}: ExperimentComparisonProps) => {
  const [sortMode, setSortMode] = useState<ComparisonSortMode>("item-name");

  const sortedRows = useMemo(
    () => sortComparisonRows(rows, sortMode),
    [rows, sortMode]
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

      {summary && <ComparisonSummaryBanner summary={summary} t={t} />}

      <ComparisonTable
        rows={sortedRows}
        experimentIds={experimentIds}
        experimentNames={experimentNames}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        t={t}
      />
    </Stack>
  );
};
