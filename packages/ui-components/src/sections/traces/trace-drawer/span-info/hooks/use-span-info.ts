import { SpanData } from "@/sections/traces/types";
import { useState, useEffect, useMemo } from "react";
import { SpanAttributeKeys } from "../const";

interface UseSpanInfoProps {
  span?: SpanData;
}

export const useSpanInfo = ({ span }: UseSpanInfoProps) => {
  const [activeTab, setActiveTab] = useState<string>("attributes");
  const [tabs, setTabs] = useState<{ value: string; label: string }[]>([]);

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
      const newTabs = [];

      if (isLLMCall) {
        newTabs.push({
          value: "inputOutput",
          label: "Input/Output",
        });
        setActiveTab("inputOutput");
      } else {
        setActiveTab("evaluation");
      }
      newTabs.push({
        value: "evaluation",
        label: `Evaluations`,
      });
      newTabs.push({
        value: "attributes",
        label: "Attributes",
      });
      setTabs(newTabs);
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

  return {
    activeTab,
    setActiveTab,
    tabs,
    spanAttributes,
    isLLMCall,
  };
};
