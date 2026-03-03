/**
 * ExperimentDetailView Component
 *
 * Composes ExperimentSummaryCard + ExperimentItemsTable into a full
 * experiment detail view. Accepts a chartsSlot for injecting
 * dashboard-specific chart visualizations.
 */

import { Skeleton, Typography } from "@mui/material";
import { Stack } from "@mui/system";
import type { ExperimentDetail } from "../types";
import { ExperimentSummaryCard } from "./experiment-summary-card";
import { ExperimentItemsTable } from "./experiment-items-table";

// ----------------------------------------------------------------------

export interface ExperimentDetailViewProps {
  experiment: ExperimentDetail | null;
  isLoading: boolean;
  t: (key: string) => string;
  onTraceClick?: (traceId: string) => void;
  chartsSlot?: React.ReactNode;
  headerSlot?: React.ReactNode;
}

export const ExperimentDetailView = ({
  experiment,
  isLoading,
  t,
  onTraceClick,
  chartsSlot,
  headerSlot,
}: ExperimentDetailViewProps) => {
  if (isLoading) {
    return (
      <Stack spacing={3} sx={{ p: 2 }}>
        <Skeleton variant="rectangular" height={40} width={120} />
        <Skeleton variant="rectangular" height={32} width={300} />
        <Skeleton variant="rectangular" height={120} />
        <Skeleton variant="rectangular" height={200} />
        <Skeleton variant="rectangular" height={400} />
      </Stack>
    );
  }

  if (!experiment) {
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        {headerSlot}
        <Typography variant="h6" color="text.secondary" sx={{ textAlign: "center" }}>
          {t("notFound")}
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={3} sx={{ p: 2 }}>
      {headerSlot}

      <Typography variant="h4">{experiment.name}</Typography>

      <ExperimentSummaryCard experiment={experiment} t={t} />

      {chartsSlot}

      <ExperimentItemsTable
        items={experiment.items}
        t={t}
        onTraceClick={onTraceClick}
      />
    </Stack>
  );
};
