import { Typography, Stack, Link } from "@mui/material";
import { useSpanInfoContext } from "./span-info-provider";
import { useTraceDrawerContext } from "../trace-drawer-provider";
import {
  extractSpanPromptName,
  extractSpanPromptPath,
  extractSpanCommitSha,
} from "../../utils/extract-span-data";

export const SpanInfoHeader = () => {
  const { span } = useSpanInfoContext();
  const { t, promptHref } = useTraceDrawerContext();

  const modelName = span.data.model;
  const promptName = extractSpanPromptName(span);
  const promptPath = extractSpanPromptPath(span);
  const commitSha = extractSpanCommitSha(span) ?? undefined;
  // The folder-aware path uniquely resolves the prompt (the flat name collides
  // across folders), so link off it — only when the host can build a URL.
  const href =
    promptHref && promptPath ? promptHref(promptPath, commitSha) : undefined;

  return (
    <Stack
      direction="row"
      spacing={3}
      sx={{
        px: 2,
        py: 1.5,
        borderBottom: 1,
        borderColor: "divider",
        alignItems: "center",
        flexWrap: "wrap",
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
      {promptName && (
        <Typography variant="subtitle2">
          <Typography
            component="span"
            color="text.secondary"
            variant="subtitle2"
          >
            {t("prompt")}:
          </Typography>{" "}
          {href ? (
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              title={
                commitSha ? `${promptPath} @ ${commitSha.slice(0, 7)}` : promptPath ?? undefined
              }
            >
              {promptName}
            </Link>
          ) : (
            promptName
          )}
        </Typography>
      )}
    </Stack>
  );
};
