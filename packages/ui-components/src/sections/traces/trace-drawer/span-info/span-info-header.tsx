import { Typography, Stack } from "@mui/material";
import { useSpanInfoContext } from "./span-info-provider";
import { useTraceDrawerContext } from "../trace-drawer-provider";
import { SpanAttributeKeys } from "./const";

export const SpanInfoHeader = () => {
  const { span, spanAttributes } = useSpanInfoContext();
  const { t } = useTraceDrawerContext();

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
      {spanAttributes[SpanAttributeKeys.REQUEST_MODEL] && (
        <Typography variant="subtitle2">
          <Typography
            component="span"
            color="text.secondary"
            variant="subtitle2"
          >
            {t("modelName")}:
          </Typography>{" "}
          {spanAttributes[SpanAttributeKeys.REQUEST_MODEL]}
        </Typography>
      )}
    </Stack>
  );
};
