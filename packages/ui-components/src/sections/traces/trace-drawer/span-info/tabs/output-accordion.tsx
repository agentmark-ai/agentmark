import { Typography } from "@mui/material";
import { MarkdownRenderer } from "./markdown-renderer";
import { OutputSection } from "./output-section";
import { useTraceDrawerContext } from "../../trace-drawer-provider";

interface OutputAccordionProps {
  outputData: {
    text?: string;
    toolCalls?: string;
    toolCall?: any;
    objectResponse?: any;
  } | null;
  /**
   * Output fields offloaded to object storage. The inline column holds only a
   * truncated preview (e.g. a clipped base64 image — invalid and unreadable), so
   * we drop it here; `OffloadedFields` renders the full value below.
   */
  offloadedFields?: Set<string>;
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

export const OutputAccordion = ({ outputData, offloadedFields }: OutputAccordionProps) => {
  const { t } = useTraceDrawerContext();

  // Drop any field whose full value was offloaded — its inline value is only a
  // truncated preview, and `OffloadedFields` renders the full version below.
  const offloaded = offloadedFields ?? new Set<string>();
  const text = offloaded.has("Output") ? undefined : outputData?.text;
  const rawToolCalls = offloaded.has("ToolCalls") ? undefined : outputData?.toolCalls;
  const toolCall = offloaded.has("ToolCalls") ? undefined : outputData?.toolCall;
  const objectResponseValue = offloaded.has("OutputObject") ? undefined : outputData?.objectResponse;

  const toolCallsText =
    !text && rawToolCalls ? formatToolCalls(rawToolCalls) : null;

  const toolCallText =
    !text && !toolCallsText && (toolCall?.name || toolCall?.toolName)
      ? formatToolCall(toolCall)
      : null;

  const objectResponse =
    !text &&
    !toolCallsText &&
    !toolCallText &&
    objectResponseValue
      ? formatObjectResponse(objectResponseValue)
      : null;

  const content = text || toolCallsText || toolCallText || objectResponse;

  // Every output field was offloaded — render nothing here; the full value(s)
  // show via OffloadedFields. (Suppresses the empty "No output" bubble too.)
  if (!content && (offloaded.has("Output") || offloaded.has("OutputObject") || offloaded.has("ToolCalls"))) {
    return null;
  }

  const isObjectResponse = !!objectResponseValue;
  const isToolResponse = !!(toolCall?.name || toolCall?.toolName);

  return (
    <OutputSection
      title={isToolResponse || isObjectResponse ? t("output") : t("assistant")}
      icon={
        isToolResponse ? "mdi:tools" : isObjectResponse ? "mdi:code-json" : "mdi:robot"
      }
    >
      {content ? (
        <MarkdownRenderer content={content} />
      ) : (
        <Typography variant="body2">{t("noOutput")}</Typography>
      )}
    </OutputSection>
  );
};
