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
}

const formatToolCalls = (toolCallsStr?: string) => {
  if (!toolCallsStr) return null;
  try {
    const toolCalls = JSON.parse(toolCallsStr);
    return toolCalls
      .map((call: any) => {
        const toolName = call.toolName || call.name;
        if (!toolName) return null;

        // Handle args - can be string or object
        let argsObj: any;
        try {
          if (typeof call.args === 'string') {
            argsObj = JSON.parse(call.args);
          } else {
            argsObj = call.args || {};
          }
        } catch {
          argsObj = {};
        }

        return `**Tool Call**: \`${toolName}\`
\`\`\`json
${JSON.stringify(argsObj, null, 2)}
\`\`\``;
      })
      .filter(Boolean)
      .join("\n\n");
  } catch {
    return null;
  }
};

const formatToolCall = (toolCall: Record<string, any>) => {
  // Support both 'name' and 'toolName' for compatibility
  const toolName = toolCall?.name || toolCall?.toolName;
  if (!toolName) return null;

  // Handle args - can be string or object
  let argsObj: any;
  try {
    if (typeof toolCall.args === 'string') {
      argsObj = JSON.parse(toolCall.args);
    } else {
      argsObj = toolCall.args || {};
    }
  } catch {
    argsObj = {};
  }

  // Handle result - can be string, object, or undefined
  let resultObj: any = null;
  if (toolCall.result !== undefined) {
    try {
      if (typeof toolCall.result === 'string') {
        resultObj = JSON.parse(toolCall.result);
      } else {
        resultObj = toolCall.result;
      }
    } catch {
      resultObj = toolCall.result;
    }
  }

  let result = `**Tool Call**: \`${toolName}\`
\`\`\`json
${JSON.stringify(argsObj, null, 2)}
\`\`\``;

  if (resultObj !== null && resultObj !== undefined) {
    result += `
**Result**: 
\`\`\`json
${JSON.stringify(resultObj, null, 2)}
\`\`\``;
  }

  return result;
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

export const OutputAccordion = ({ outputData }: OutputAccordionProps) => {
  const { t } = useTraceDrawerContext();
  const toolCallsText =
    !outputData?.text && outputData?.toolCalls
      ? formatToolCalls(outputData?.toolCalls)
      : null;

  const toolCallText =
    !outputData?.text && !toolCallsText && (outputData?.toolCall?.name || outputData?.toolCall?.toolName)
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
  const isToolResponse = !!(outputData?.toolCall?.name || outputData?.toolCall?.toolName);

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
              isToolResponse
                ? "mdi:tools"
                : isObjectResponse
                ? "mdi:code-json"
                : "mdi:robot"
            }
            width={16}
          />
          <Typography fontWeight={700} variant="body2" fontSize="0.8rem">
            {isToolResponse || isObjectResponse ? t("output") : t("assistant")}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1, py: 0.5 }}>
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <Typography variant="body2">{t("noOutput")}</Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );
};
