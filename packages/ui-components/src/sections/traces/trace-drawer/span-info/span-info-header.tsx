import { Typography, Stack } from "@mui/material";
import { useSpanInfoContext } from "./span-info-provider";
import { useTraceDrawerContext } from "../trace-drawer-provider";

export const SpanInfoHeader = () => {
  const { span } = useSpanInfoContext();
  const { t } = useTraceDrawerContext();

  const modelName = span.data.model;

  return (
    <Stack
      direction="row"
      spacing={3}
      sx={{
        px: 2,
        py: 1.5,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Typography variant="subtitle2">
        <Typography component="span" color="text.secondary" variant="subtitle2">
          {t("spanId")}:
        </Typography>{" "}
        {span.id}
      </Typography>
      {modelName && (
        <Typography variant="subtitle2">
          <Typography
            component="span"
            color="text.secondary"
            variant="subtitle2"
          >
            {t("modelName")}:
          </Typography>{" "}
          {modelName}
        </Typography>
      )}
    </Stack>
  );
};
