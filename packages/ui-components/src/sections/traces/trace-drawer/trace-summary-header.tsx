import { Stack, Typography, Tooltip, Chip } from "@mui/material";
import { Iconify } from "@/components";
import { Label } from "@/components";
import { fCurrency, fNumber } from "@/utils/format-number";
import { useTraceDrawerContext } from "./trace-drawer-provider";
import { summarizeTrace } from "../utils/summarize-trace";

const MAX_MODELS = 3;

export const TraceSummaryHeader = () => {
  const { traces, selectedSpan, t } = useTraceDrawerContext();

  const traceId = selectedSpan?.traceId ?? selectedSpan?.id;
  const trace = traces.find((tr) => tr.id === traceId) ?? traces[0];
  if (!trace) return null;

  const { cost, totalTokens, promptTokens, completionTokens, latencyMs, models, userId, sessionId } =
    summarizeTrace(trace);

  const visibleModels = models.slice(0, MAX_MODELS);
  const extraModelCount = models.length - visibleModels.length;

  return (
    <Stack
      direction="row"
      spacing={0.75}
      flexWrap="wrap"
      alignItems="center"
      sx={{ mt: 0.75 }}
      data-testid="trace-summary-header"
    >
      {latencyMs > 0 && (
        <Tooltip title={t("latency")}>
          <Label
            sx={{ textTransform: "lowercase" }}
            color="primary"
            startIcon={<Iconify icon="mdi:clock-time-four-outline" />}
          >
            {(latencyMs / 1000).toFixed(2)}s
          </Label>
        </Tooltip>
      )}
      {cost > 0 && (
        <Tooltip title={t("cost")}>
          <Label color="info">{fCurrency(cost, 5)}</Label>
        </Tooltip>
      )}
      {totalTokens > 0 && (
        <Tooltip
          title={
            promptTokens > 0 || completionTokens > 0
              ? `${t("tokens")}: ${fNumber(promptTokens)} → ${fNumber(completionTokens)}`
              : t("tokens")
          }
        >
          <Label
            color="default"
            startIcon={<Iconify icon="game-icons:token" />}
          >
            {fNumber(totalTokens)}
          </Label>
        </Tooltip>
      )}
      {visibleModels.map((model) => (
        <Chip
          key={model}
          label={model}
          size="small"
          variant="outlined"
          sx={{ height: 20, fontSize: "0.7rem" }}
        />
      ))}
      {extraModelCount > 0 && (
        <Tooltip title={models.slice(MAX_MODELS).join(", ")}>
          <Chip
            label={`+${extraModelCount}`}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: "0.7rem" }}
          />
        </Tooltip>
      )}
      {userId && (
        <Typography variant="caption" color="text.secondary" noWrap>
          <Typography component="span" variant="caption" color="text.secondary">
            {t("userId")}:
          </Typography>{" "}
          {userId}
        </Typography>
      )}
      {sessionId && (
        <Typography variant="caption" color="text.secondary" noWrap>
          <Typography component="span" variant="caption" color="text.secondary">
            {t("sessionId")}:
          </Typography>{" "}
          {sessionId}
        </Typography>
      )}
    </Stack>
  );
};
