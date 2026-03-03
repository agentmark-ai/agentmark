/**
 * ExperimentEmptyState Component
 *
 * Displayed when there are no experiments to show.
 */

import { Card, Typography, Stack, Button } from "@mui/material";
import { Iconify } from "@/components";

// ----------------------------------------------------------------------

export interface ExperimentEmptyStateProps {
  t: (key: string) => string;
  docsUrl?: string;
}

export const ExperimentEmptyState = ({ t, docsUrl }: ExperimentEmptyStateProps) => {
  return (
    <Card
      sx={{
        p: 5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Stack alignItems="center" spacing={2} sx={{ maxWidth: 400 }}>
        <Iconify
          icon="mdi:flask-outline"
          sx={{ width: 64, height: 64, color: "text.secondary" }}
        />

        <Typography variant="h6" textAlign="center">
          {t("emptyState")}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          textAlign="center"
        >
          {t("emptyStateDescription")}
        </Typography>

        {docsUrl && (
          <Button
            variant="outlined"
            color="inherit"
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<Iconify icon="mdi:open-in-new" />}
          >
            {t("viewDocs")}
          </Button>
        )}
      </Stack>
    </Card>
  );
};
