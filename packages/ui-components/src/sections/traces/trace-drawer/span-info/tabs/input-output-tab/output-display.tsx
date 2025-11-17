import { OutputAccordion } from "../output-accordion";
import { SpanAttributeKeys } from "../../const";

interface OutputDisplayProps {
  outputData: {
    text?: string;
    toolCalls?: string;
    toolCall?: any;
    objectResponse?: any;
  } | null;
}

export const OutputDisplay = ({ outputData }: OutputDisplayProps) => {
  if (!outputData) return null;

  const attributes: Record<string, any> = {};

  if (outputData.text) {
    attributes[SpanAttributeKeys.AI_RESPONSE_TEXT] = outputData.text;
  }
  if (outputData.toolCalls) {
    attributes[SpanAttributeKeys.AI_RESPONSE_TOOL_CALLS] = outputData.toolCalls;
  }
  if (outputData.toolCall) {
    attributes[SpanAttributeKeys.AI_TOOL_CALL_NAME] = outputData.toolCall.name;
    attributes[SpanAttributeKeys.AI_TOOL_CALL_ARGS] = outputData.toolCall.args;
    attributes[SpanAttributeKeys.AI_TOOL_CALL_RESULT] =
      outputData.toolCall.result;
  }
  if (outputData.objectResponse) {
    attributes[SpanAttributeKeys.AI_RESPONSE_OBJECT] =
      outputData.objectResponse;
  }

  return <OutputAccordion outputData={outputData} attributes={attributes} />;
};
