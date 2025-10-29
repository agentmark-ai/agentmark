import { SpanData } from "@/sections/traces/types";
import { useState, useEffect, useMemo } from "react";
import { SpanAttributeKeys } from "../const";

interface UseSpanInfoProps {
  span?: SpanData;
}

export const useSpanInfo = ({ span }: UseSpanInfoProps) => {
  const [activeTab, setActiveTab] = useState<string>("attributes");

  const spanAttributes = useMemo(() => {
    try {
      return JSON.parse(span?.data?.attributes || "{}");
    } catch {
      return {};
    }
  }, [span]);

  const hasLLMAttributes = (attributes: Record<string, any>) => {
    return !!(
      attributes[SpanAttributeKeys.AI_PROMPT_MESSAGES] ||
      attributes[SpanAttributeKeys.AI_PROMPT] ||
      attributes[SpanAttributeKeys.AI_MODEL_ID] ||
      attributes[SpanAttributeKeys.REQUEST_MODEL]
    );
  };

  const isLLMCall = hasLLMAttributes(spanAttributes);

  useEffect(() => {
    if (span?.id) {
      if (isLLMCall) {
        setActiveTab("inputOutput");
      } else {
        setActiveTab("attributes");
      }
    }
  }, [span?.id, isLLMCall]);

  useEffect(() => {
    const isTabValid =
      (activeTab === "inputOutput" && isLLMCall) ||
      activeTab === "evaluation" ||
      activeTab === "attributes";

    if (!isTabValid) {
      if (isLLMCall) {
        setActiveTab("inputOutput");
      } else {
        setActiveTab("evaluation");
      }
    }
  }, [activeTab, isLLMCall]);

  const tabs = [];
  if (isLLMCall) {
    tabs.push({
      value: "inputOutput",
      label: "Input/Output",
    });
  }
  tabs.push({
    value: "evaluation",
    label: `Evaluations`,
  });
  tabs.push({
    value: "attributes",
    label: "Attributes",
  });

  return {
    activeTab,
    setActiveTab,
    tabs,
    spanAttributes,
    isLLMCall,
  };
};
