/**
 * ComparisonSummaryBanner Component
 *
 * Displays a summary banner for the experiment comparison view.
 */

import { Card, Chip, Grid, Typography } from "@mui/material";
import { Stack } from "@mui/system";
import { Iconify } from "@/components";
import type { ComparisonSummary as ComparisonSummaryType } from "../types";

// ----------------------------------------------------------------------

export interface ComparisonSummaryBannerProps {
  summary: ComparisonSummaryType;
  t: (key: string) => string;
}

export const ComparisonSummaryBanner = ({
  summary,
  t,
}: ComparisonSummaryBannerProps) => {
  return (
    <Card sx={{ p: 3 }}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t("totalItems")}
            </Typography>
            <Typography variant="h6">{summary.totalItems}</Typography>
          </Stack>
        </Grid>

        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t("overlapping")}
            </Typography>
            <Typography variant="h6">{summary.overlappingItems}</Typography>
          </Stack>
        </Grid>

        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t("improved")}
            </Typography>
            <Chip
              icon={
                <Iconify icon="mdi:trending-up" width={16} />
              }
              label={summary.improved}
              size="small"
              sx={{
                color: "success.main",
                bgcolor: "success.lighter",
                fontWeight: "bold",
                alignSelf: "flex-start",
              }}
            />
          </Stack>
        </Grid>

        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t("regressed")}
            </Typography>
            <Chip
              icon={
                <Iconify icon="mdi:trending-down" width={16} />
              }
              label={summary.regressed}
              size="small"
              sx={{
                color: "error.main",
                bgcolor: "error.lighter",
                fontWeight: "bold",
                alignSelf: "flex-start",
              }}
            />
          </Stack>
        </Grid>

        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t("unchanged")}
            </Typography>
            <Typography variant="h6">{summary.unchanged}</Typography>
          </Stack>
        </Grid>

        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t("unscored")}
            </Typography>
            <Typography variant="h6" color="text.disabled">
              {summary.unscored}
            </Typography>
          </Stack>
        </Grid>
      </Grid>
    </Card>
  );
};
