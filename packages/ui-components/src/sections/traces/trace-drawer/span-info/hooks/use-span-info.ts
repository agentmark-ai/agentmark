import { SpanData } from "@/sections/traces/types";
import { useState, useEffect, useMemo } from "react";

interface UseSpanInfoProps {
  span?: SpanData;
}

export function computeHasIOData(span?: SpanData): boolean {
  return !!span?.data?.input || !!span?.data?.output || !!span?.data?.toolCalls?.length;
}

export const useSpanInfo = ({ span }: UseSpanInfoProps) => {
  const [activeTab, setActiveTab] = useState<string>("attributes");
  const [tabs, setTabs] = useState<{ value: string; label: string }[]>([]);

  const hasIOData = useMemo(() => {
    return computeHasIOData(span);
  }, [span?.data?.input, span?.data?.output, span?.data?.toolCalls]);

  useEffect(() => {
    if (span?.id) {
      const newTabs = [];

      if (hasIOData) {
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
  }, [span?.id, hasIOData]);

  useEffect(() => {
    const isTabValid =
      (activeTab === "inputOutput" && hasIOData) ||
      activeTab === "evaluation" ||
      activeTab === "attributes";

    if (!isTabValid) {
      if (hasIOData) {
        setActiveTab("inputOutput");
      } else {
        setActiveTab("evaluation");
      }
    }
  }, [activeTab, hasIOData]);

  return {
    activeTab,
    setActiveTab,
    tabs,
    hasIOData,
  };
};
