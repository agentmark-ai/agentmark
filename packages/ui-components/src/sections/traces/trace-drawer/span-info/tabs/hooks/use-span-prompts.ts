import { useMemo } from "react";
import { useTraceDrawerContext } from "../../../trace-drawer-provider";
import { LLMPrompt } from "@/sections/traces/types";
import { SpanAttributeKeys } from "../../const";

interface UseSpanPromptsResult {
  prompts: LLMPrompt[];
  outputData: {
    text?: string;
    toolCalls?: string;
    toolCall?: any;
    objectResponse?: any;
  } | null;
  isLoading: boolean;
}

const extractPromptsFromSpan = (span: any): LLMPrompt[] => {
  if (!span?.data?.attributes) return [];

  try {
    const attributes = JSON.parse(span.data.attributes);
    if (attributes && attributes[SpanAttributeKeys.AI_PROMPT_MESSAGES]) {
      return JSON.parse(attributes[SpanAttributeKeys.AI_PROMPT_MESSAGES]) || [];
    }
    if (attributes && attributes[SpanAttributeKeys.AI_PROMPT]) {
      return (
        JSON.parse(attributes[SpanAttributeKeys.AI_PROMPT])?.messages || []
      );
    }

    return [];
  } catch {
    return [];
  }
};

const extractOutputFromSpan = (span: any) => {
  if (!span?.data?.attributes) return null;

  try {
    const attributes = JSON.parse(span.data.attributes);

    return {
      text: attributes[SpanAttributeKeys.AI_RESPONSE_TEXT],
      toolCalls: attributes[SpanAttributeKeys.AI_RESPONSE_TOOL_CALLS],
      toolCall: attributes[SpanAttributeKeys.AI_TOOL_CALL_NAME]
        ? {
            name: attributes[SpanAttributeKeys.AI_TOOL_CALL_NAME],
            args: attributes[SpanAttributeKeys.AI_TOOL_CALL_ARGS],
            result: attributes[SpanAttributeKeys.AI_TOOL_CALL_RESULT],
          }
        : null,
      objectResponse: attributes[SpanAttributeKeys.AI_RESPONSE_OBJECT]
        ? JSON.parse(attributes[SpanAttributeKeys.AI_RESPONSE_OBJECT])
        : null,
    };
  } catch {
    return null;
  }
};

export const useSpanPrompts = (): UseSpanPromptsResult => {
  const { selectedSpan } = useTraceDrawerContext();
  const prompts = useMemo(() => {
    return extractPromptsFromSpan(selectedSpan);
  }, [selectedSpan]);

  const outputData = useMemo(() => {
    return extractOutputFromSpan(selectedSpan);
  }, [selectedSpan]);

  return {
    prompts,
    outputData,
    isLoading: !selectedSpan,
  };
};
