/**
 * ComparisonDiffView Component
 *
 * Renders an inline word-level text diff between two experiment outputs.
 */

import { useMemo } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { diffWords } from "diff";
import { Iconify } from "@/components";
import type { DiffSegment } from "../types";

// ----------------------------------------------------------------------

export interface ComparisonDiffViewProps {
  baselineOutput: string;
  comparisonOutput: string;
  baselineName: string;
  comparisonName: string;
  t: (key: string) => string;
}

// ----------------------------------------------------------------------

export function ComparisonDiffView({
  baselineOutput,
  comparisonOutput,
  baselineName,
  comparisonName,
  t,
}: ComparisonDiffViewProps) {
  const theme = useTheme();

  const changes: DiffSegment[] = useMemo(
    () => diffWords(baselineOutput, comparisonOutput),
    [baselineOutput, comparisonOutput]
  );

  const isIdentical = changes.every(
    (segment) => !segment.added && !segment.removed
  );

  return (
    <Stack spacing={1.5}>
      {/* Legend */}
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip
          label={`${t("diff.baseline")}: ${baselineName}`}
          size="small"
          variant="outlined"
          sx={{
            borderColor: theme.palette.error.main,
            color: theme.palette.error.dark,
          }}
        />
        <Chip
          label={`${t("diff.comparison")}: ${comparisonName}`}
          size="small"
          variant="outlined"
          sx={{
            borderColor: theme.palette.success.main,
            color: theme.palette.success.dark,
          }}
        />
      </Stack>

      {/* Diff content */}
      {isIdentical ? (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ py: 1 }}
        >
          <Iconify
            icon="mdi:check-circle-outline"
            width={20}
            sx={{ color: "success.main" }}
          />
          <Typography variant="body2" color="text.secondary">
            {t("diff.noDifferences")}
          </Typography>
        </Stack>
      ) : (
        <Box
          sx={{
            fontFamily: "monospace",
            fontSize: "0.85rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            p: 1.5,
            borderRadius: 1,
            border: 1,
            borderColor: "divider",
            bgcolor: "background.neutral",
          }}
        >
          {changes.map((segment, index) => {
            if (segment.added) {
              return (
                <Box
                  key={index}
                  component="span"
                  sx={{
                    bgcolor: theme.palette.success.light,
                    color: theme.palette.success.dark,
                  }}
                >
                  {segment.value}
                </Box>
              );
            }

            if (segment.removed) {
              return (
                <Box
                  key={index}
                  component="span"
                  sx={{
                    bgcolor: theme.palette.error.light,
                    color: theme.palette.error.dark,
                    textDecoration: "line-through",
                  }}
                >
                  {segment.value}
                </Box>
              );
            }

            return (
              <Box key={index} component="span">
                {segment.value}
              </Box>
            );
          })}
        </Box>
      )}
    </Stack>
  );
}
