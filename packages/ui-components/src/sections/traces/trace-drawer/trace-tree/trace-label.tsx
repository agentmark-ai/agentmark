import { Stack, Typography, Box, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Iconify } from "@/components";
import { Label } from "@/components";
import { fCurrency, fNumber } from "@/utils/format-number";
import { useTraceDrawerContext } from "../trace-drawer-provider";

interface TraceLabelProps {
  label: string;
  status: string;
  tokens: string;
  latency: string;
  cost: string;
}

export const TraceLabel = ({
  label,
  status,
  tokens,
  latency,
  cost,
}: TraceLabelProps) => {
  const theme = useTheme();
  const { t } = useTraceDrawerContext();

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
    </Stack>
  );
};
