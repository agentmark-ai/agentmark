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

interface OutputAccordionProps {
  outputData: {
    text?: string;
    toolCalls?: string;
    toolCall?: any;
    objectResponse?: any;
  } | null;
  attributes?: Record<string, any>;
}

const formatToolCalls = (toolCallsStr?: string) => {
  if (!toolCallsStr) return null;
  try {
    const toolCalls = JSON.parse(toolCallsStr);
    return toolCalls
      .map(
        (call: any) => `**Tool Call**: \`${call.toolName}\`
\`\`\`json
${JSON.stringify(JSON.parse(call.args), null, 2)}
\`\`\``
      )
      .join("\n\n");
  } catch {
    return null;
  }
};

const formatToolCall = (toolCall: Record<string, any>) => {
  if (!toolCall?.name) return null;

  return `**Tool Call**: \`${toolCall.name}\`
\`\`\`json
${JSON.stringify(JSON.parse(toolCall.args), null, 2)}
\`\`\`
**Result**: 
\`\`\`json
${JSON.stringify(JSON.parse(toolCall.result), null, 2)}
\`\`\``;
};

const formatObjectResponse = (objectResponse: any) => {
  if (!objectResponse) return null;

  try {
    return `**Response Object**:
\`\`\`json
${JSON.stringify(objectResponse, null, 2)}
\`\`\``;
  } catch {
    return null;
  }
};

export const OutputAccordion = ({
  outputData,
  attributes: _attributes,
}: OutputAccordionProps) => {
  const { t } = useTraceDrawerContext();
  const toolCallsText =
    !outputData?.text && outputData?.toolCalls
      ? formatToolCalls(outputData?.toolCalls)
      : null;

  const toolCallText =
    !outputData?.text && !toolCallsText && outputData?.toolCall?.name
      ? formatToolCall(outputData?.toolCall)
      : null;

  const objectResponse =
    !outputData?.text &&
    !toolCallsText &&
    !toolCallText &&
    outputData?.objectResponse
      ? formatObjectResponse(outputData?.objectResponse)
      : null;

  const content =
    outputData?.text || toolCallsText || toolCallText || objectResponse;

  const isObjectResponse = !!outputData?.objectResponse;
  const isToolResponse = !!outputData?.toolCall?.name;

  return (
    <Accordion sx={{ backgroundColor: "white" }} defaultExpanded>
      <AccordionSummary
        expandIcon={<Iconify icon="mdi:chevron-down" />}
        sx={{
          "& .MuiAccordionSummary-content": {
            alignItems: "center",
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Iconify
            icon={
              isToolResponse
                ? "mdi:tools"
                : isObjectResponse
                ? "mdi:code-json"
                : "mdi:robot"
            }
          />
          <Typography fontWeight={700} variant="body2">
            {isToolResponse ? t("tool") : t("assistant")}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <Typography variant="body2">{t("noOutput")}</Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );
};
