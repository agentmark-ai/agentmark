import { Stack, Typography, Box, Tooltip, Chip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Iconify } from "@/components";
import { Label } from "@/components";
import { fCurrency, fNumber } from "@/utils/format-number";
import { useTraceDrawerContext } from "../trace-drawer-provider";
import type { ScoreData } from "../../types";

interface TraceLabelProps {
  label: string;
  status: string;
  tokens: string;
  latency: string;
  cost: string;
  scores?: ScoreData[];
}

export const TraceLabel = ({
  label,
  status,
  tokens,
  latency,
  cost,
  scores,
}: TraceLabelProps) => {
  const theme = useTheme();
  const { t } = useTraceDrawerContext();

  const hasScores = scores && scores.length > 0;

  return (
    <Stack spacing={0.3}>
      <Stack direction={"row"} alignItems={"center"} spacing={1}>
        <Typography
          variant="body2"
          sx={{ display: "flex", fontWeight: "inherit", flexGrow: 1 }}
        >
          {label}
        </Typography>

        <Box minWidth={16} maxHeight={16}>
          <Iconify
            width={16}
            color={
              status === "0" || status === "1"
                ? theme.palette.success.main
                : theme.palette.error.main
            }
            icon={
              status === "0" || status === "1"
                ? "mdi:check-circle-outline"
                : "mdi:close-circle-outline"
            }
          />
        </Box>
      </Stack>
      <Stack direction={"row"} spacing={0.5} flexWrap="wrap">
        <Tooltip title={t("latency")}>
          <Label
            sx={{ textTransform: "lowercase" }}
            color="primary"
            startIcon={<Iconify icon="mdi:clock-time-four-outline" />}
          >
            {(Number(latency) / 1000).toFixed(1)}s
          </Label>
        </Tooltip>
        {Boolean(Number(tokens)) && (
          <Tooltip title={t("cost")}>
            <Label color="info">{fCurrency(cost, 5)}</Label>
          </Tooltip>
        )}
        {Boolean(parseInt(tokens)) && (
          <Tooltip title={t("tokens")}>
            <Label
              color="default"
              startIcon={<Iconify icon="game-icons:token" />}
            >
              {fNumber(tokens)}
            </Label>
          </Tooltip>
        )}
      </Stack>
      {hasScores && (
        <Stack direction={"row"} spacing={0.5} flexWrap="wrap">
          {scores.map((score) => (
            <Tooltip
              key={score.id}
              title={score.reason || `${score.name}: ${typeof score.score === "number" && isFinite(score.score) ? score.score.toFixed(2) : String(score.score)}`}
            >
              <Chip
                label={`${score.name}: ${typeof score.score === "number" && isFinite(score.score) ? score.score.toFixed(2) : String(score.score)}`}
                size="small"
                sx={{
                  height: 18,
                  fontSize: "0.65rem",
                  fontWeight: 600,
                  bgcolor: theme.palette.grey[800],
                  color: theme.palette.common.white,
                  "& .MuiChip-label": { px: 0.75 },
                  cursor: "default",
                }}
              />
            </Tooltip>
          ))}
        </Stack>
      )}
    </Stack>
  );
};
