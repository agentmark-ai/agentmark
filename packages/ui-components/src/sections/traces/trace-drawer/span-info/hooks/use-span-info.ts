import { SpanData } from "@/sections/traces/types";
import { useState, useEffect, useMemo } from "react";

interface UseSpanInfoProps {
  span?: SpanData;
}

export const useSpanInfo = ({ span }: UseSpanInfoProps) => {
  const [activeTab, setActiveTab] = useState<string>("attributes");
  const [tabs, setTabs] = useState<{ value: string; label: string }[]>([]);

  const isLLMCall = useMemo(() => {
    return span?.data?.type === "GENERATION" || !!span?.data?.model;
  }, [span?.data?.type, span?.data?.model]);

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
    isLLMCall,
  };
};
