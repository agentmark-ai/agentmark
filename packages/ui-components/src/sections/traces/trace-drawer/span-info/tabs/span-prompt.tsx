import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography,
  Box,
} from "@mui/material";
import { Iconify } from "@/components";
import { MarkdownRenderer } from "./markdown-renderer";
import { useTraceDrawerContext } from "../../trace-drawer-provider";
import { LLMPrompt } from "@/sections/traces/types";

interface SpanPromptProps {
  prompt: LLMPrompt;
}

const formatToolCall = (content: any) => {
  if (content.type === "tool-call") {
    return `**Tool Call**: \`${content.toolName}\`
\`\`\`json
${JSON.stringify(content.args, null, 2)}
\`\`\``;
  }
  if (content.type === "tool-result") {
    return `**Tool Result**:
\`\`\`json
${JSON.stringify(content.result, null, 2)}
\`\`\``;
  }
  return content.text || "";
};

const formatContent = (content: any[] | string) => {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (item.type === "text") return item.text;
      if (item.type === "tool-call" || item.type === "tool-result") {
        return formatToolCall(item);
      }
      return `\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\``;
    })
    .join("\n\n");
};

export const SpanPrompt = ({ prompt }: SpanPromptProps) => {
  const { t } = useTraceDrawerContext();
  const content = formatContent(prompt.content);

  const getTitle = (role: string) => {
    switch (role) {
      case "system":
        return t("system");
      case "user":
        return t("user");
      case "assistant":
        return t("assistant");
      case "tool":
        return t("tool");
      case "input":
      case "tool-input":
        return t("input");
      case "output":
      case "tool-output":
        return t("output");
      default:
        return role;
    }
  };

  return (
    <Accordion
      sx={{
        backgroundColor: "white",
        "&.MuiAccordion-root": { my: 0.5 },
        "&:before": { display: "none" },
      }}
      defaultExpanded
    >
      <AccordionSummary
        expandIcon={<Iconify icon="mdi:chevron-down" width={16} />}
        sx={{
          minHeight: "28px !important",
          px: 1,
          py: 0,
          "& .MuiAccordionSummary-content": {
            alignItems: "center",
            my: "4px !important",
          },
          "&.Mui-expanded": {
            minHeight: "28px !important",
            my: 0,
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Iconify
            icon={
              prompt.role === "system"
                ? "mdi:cog"
                : prompt.role === "user"
                ? "mdi:account"
                : prompt.role === "assistant"
                ? "mdi:robot"
                : prompt.role === "tool" || prompt.role === "tool-input" || prompt.role === "tool-output"
                ? "mdi:tools"
                : prompt.role === "input" || prompt.role === "output"
                ? "mdi:arrow-right-bold"
                : "mdi:message"
            }
            width={16}
          />
          <Typography fontWeight={700} variant="body2" fontSize="0.8rem">
            {getTitle(prompt.role)}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1, py: 0.5 }}>
        <MarkdownRenderer content={content} />
      </AccordionDetails>
    </Accordion>
  );
};
