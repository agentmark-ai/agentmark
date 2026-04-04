import { SpanData } from "@/sections/traces/types";
import { useState, useEffect, useMemo } from "react";

interface UseSpanInfoProps {
  span?: SpanData;
}

/**
 * Determine whether a span has I/O data worth showing in the Input/Output tab.
 * LLM generation spans always qualify; other spans need explicit data fields.
 */
export function computeHasIOData(span?: SpanData): boolean {
  if (!span?.data) return false;
  if (span.data.type === "GENERATION" || !!span.data.model) return true;
  if (span.data.toolCalls) return true;
  if (span.data.input || span.data.output) return true;
  // Agent spans use props as input and may have outputObject
  if (span.data.props || span.data.outputObject) return true;
  return false;
}

export const useSpanInfo = ({ span }: UseSpanInfoProps) => {
  const [activeTab, setActiveTab] = useState<string>("attributes");
  const [tabs, setTabs] = useState<{ value: string; label: string }[]>([]);

  const isLLMCall = useMemo(() => {
    return span?.data?.type === "GENERATION" || !!span?.data?.model;
  }, [span?.data?.type, span?.data?.model]);

  const hasInputOutput = useMemo(() => {
    return computeHasIOData(span);
  }, [span?.data]);

  useEffect(() => {
    if (span?.id) {
      const newTabs = [];

      if (hasInputOutput) {
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
  }, [span?.id, hasInputOutput]);

  useEffect(() => {
    const isTabValid =
      (activeTab === "inputOutput" && hasInputOutput) ||
      activeTab === "evaluation" ||
      activeTab === "attributes";

    if (!isTabValid) {
      if (hasInputOutput) {
        setActiveTab("inputOutput");
      } else {
        setActiveTab("evaluation");
      }
    }
  }, [activeTab, hasInputOutput]);

  return {
    activeTab,
    setActiveTab,
    tabs,
    isLLMCall,
  };
};
