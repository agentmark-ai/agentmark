import { createContext, useContext } from "react";
import { SpanData } from "../../types";
import { useSpanInfo } from "./hooks/use-span-info";
import { useTraceDrawerContext } from "../trace-drawer-provider";

const SpanInfoContext = createContext<SpanInfoContextValue | undefined>(
  undefined
);

interface SpanInfoContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  spanAttributes: Record<string, any>;
  tabs: { value: string; label: string }[];
  span: SpanData;
}

export const SpanInfoProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { selectedSpan } = useTraceDrawerContext();
  const { activeTab, setActiveTab, spanAttributes, tabs } = useSpanInfo({
    span: selectedSpan || undefined,
  });

  if (!selectedSpan) {
    return null;
  }

  return (
    <SpanInfoContext.Provider
      value={{
        span: selectedSpan,
        activeTab,
        setActiveTab,
        spanAttributes,
        tabs,
      }}
    >
      {children}
    </SpanInfoContext.Provider>
  );
};

export const useSpanInfoContext = () => {
  const context = useContext(SpanInfoContext);
  if (!context) {
    throw new Error("useSpanInfo must be used within a SpanInfoProvider");
  }
  return context;
};
