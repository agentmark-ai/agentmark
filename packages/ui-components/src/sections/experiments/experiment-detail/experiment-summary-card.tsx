/**
 * ExperimentSummaryCard Component
 *
 * Displays summary metrics for an experiment in a card layout.
 */

import { Card, Grid, Typography } from "@mui/material";
import { Stack } from "@mui/system";
import { fCurrency, fNumber } from "@/utils";
import type { ExperimentSummary } from "../types";

// ----------------------------------------------------------------------

export interface ExperimentSummaryCardProps {
  experiment: ExperimentSummary;
  t: (key: string) => string;
}

export const ExperimentSummaryCard = ({
  experiment,
  t,
}: ExperimentSummaryCardProps) => {
  return (
    <Card sx={{ p: 3 }}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t("items")}
            </Typography>
            <Typography variant="h6">{experiment.itemCount}</Typography>
          </Stack>
        </Grid>

        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t("avgScore")}
            </Typography>
            <Typography variant="h6">
              {experiment.avgScore != null
                ? fNumber(experiment.avgScore, true)
                : t("notAvailable")}
            </Typography>
          </Stack>
        </Grid>

        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t("totalCost")}
            </Typography>
            <Typography variant="h6">
              {fCurrency(experiment.totalCost, 5)}
            </Typography>
          </Stack>
        </Grid>

        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t("avgLatency")}
            </Typography>
            <Typography variant="h6">
              {fNumber(experiment.avgLatencyMs / 1000)}s
            </Typography>
          </Stack>
        </Grid>

        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t("totalTokens")}
            </Typography>
            <Typography variant="h6">
              {fNumber(experiment.totalTokens)}
            </Typography>
          </Stack>
        </Grid>
      </Grid>
    </Card>
  );
};
