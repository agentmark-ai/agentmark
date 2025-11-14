import React, { createContext, useContext, ReactNode } from "react";
import { Trace } from "../types";

export interface TraceListContextValue {
  traces: Trace[];
  isLoading: boolean;
  error: string | null;
  onRowClick?: (trace: Trace) => void;
}

const TraceListContext = createContext<TraceListContextValue | undefined>(
  undefined
);

// ----------------------------------------------------------------------

export const TraceListProvider = ({
  children,
  traces,
  isLoading = false,
  error = null,
}: {
  children: ReactNode;
} & TraceListContextValue) => {
  return (
    <TraceListContext.Provider value={{ traces, isLoading, error }}>
      {children}
    </TraceListContext.Provider>
  );
};

export const useTraceListContext = () => {
  const context = useContext(TraceListContext);
  if (!context) {
    throw new Error(
      "useTraceListContext must be used within TraceListProvider"
    );
  }
  return context;
};
