import { useMemo } from "react";
import { useTraceDrawerContext } from "../../../trace-drawer-provider";
import { LLMPrompt } from "@/sections/traces/types";

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
  if (!span?.data?.input) return [];

  try {
    const parsed = JSON.parse(span.data.input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const extractOutputFromSpan = (span: any) => {
  if (!span?.data?.output && !span?.data?.outputObject && !span?.data?.toolCalls) {
    return null;
  }

  let toolCall = null;
  let toolCalls = span.data.toolCalls;

  if (toolCalls && typeof toolCalls === "string") {
    try {
      toolCalls = JSON.parse(toolCalls);
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        toolCall = toolCalls[0];
      }
    } catch {
      toolCalls = undefined;
    }
  }

  let objectResponse = null;
  if (span.data.outputObject) {
    try {
      objectResponse =
        typeof span.data.outputObject === "string"
          ? JSON.parse(span.data.outputObject)
          : span.data.outputObject;
    } catch {
      objectResponse = null;
    }
  }

  return {
    text: span.data.output || undefined,
    toolCalls: toolCalls ? (typeof toolCalls === "string" ? toolCalls : JSON.stringify(toolCalls)) : undefined,
    toolCall,
    objectResponse,
  };
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
