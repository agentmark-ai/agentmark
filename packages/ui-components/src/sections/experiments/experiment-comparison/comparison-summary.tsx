/**
 * ComparisonSummaryBanner Component
 *
 * Displays a summary banner for the experiment comparison view.
 */

import { useState } from "react";
import { Card, Chip, Grid, Tooltip, Typography } from "@mui/material";
import { Stack } from "@mui/system";
import { Iconify } from "@/components";
import type { ComparisonSummary as ComparisonSummaryType } from "../types";

// ----------------------------------------------------------------------

export interface ComparisonSummaryBannerProps {
  summary: ComparisonSummaryType;
  commitShas?: (string | undefined)[];
  t: (key: string) => string;
}

export const ComparisonSummaryBanner = ({
  summary,
  commitShas,
  t,
}: ComparisonSummaryBannerProps) => {
  const validShas = (commitShas ?? []).filter(
    (sha): sha is string => sha != null && sha.length > 0
  );
  const sha1 = validShas[0] ?? "";
  const sha2 = validShas[1] ?? "";
  const showCommitRow = validShas.length >= 2;
  const shasDiffer = showCommitRow && sha1 !== sha2;

  const [diffCopied, setDiffCopied] = useState(false);

  const handleCopyDiffCommand = () => {
    const cmd = `git diff ${sha1.slice(0, 12)} ${sha2.slice(0, 12)}`;
    void navigator.clipboard.writeText(cmd).then(() => {
      setDiffCopied(true);
      setTimeout(() => setDiffCopied(false), 1500);
    });
  };

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

      {showCommitRow && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}
        >
          <Iconify icon="mdi:source-commit" width={18} />
          <Typography
            variant="body2"
            sx={{ fontFamily: "monospace" }}
          >
            {sha1.slice(0, 8)} {"\u2192"} {sha2.slice(0, 8)}
          </Typography>
          {shasDiffer ? (
            <Tooltip title={diffCopied ? "Copied!" : "Copy git diff command"}>
              <Chip
                label={`git diff ${sha1.slice(0, 12)} ${sha2.slice(0, 12)}`}
                size="small"
                variant="outlined"
                onClick={handleCopyDiffCommand}
                sx={{ fontFamily: "monospace", cursor: "pointer" }}
              />
            </Tooltip>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {t("sameVersion")}
            </Typography>
          )}
        </Stack>
      )}
    </Card>
  );
};
