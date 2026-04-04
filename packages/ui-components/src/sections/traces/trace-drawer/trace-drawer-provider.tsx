import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useCallback,
  useState,
  useEffect,
} from "react";
import { TraceData, SpanData, ScoreData } from "../types";
import { useTraceDrawer } from "./hooks/use-trace-drawer";

export interface SpanIOData {
  input: string;
  output: string;
  outputObject: string | null;
  toolCalls: string | null;
}

export interface TraceDrawerContextValue {
  traces: TraceData[];
  selectedSpan: SpanData | null;
  onSelectSpan: (spanId: string) => void;
  // Todo: remove any type
  spanTree: any[];
  // Todo: add proper type
  findCostAndTokens: (item: any) => { cost: number; tokens: number };
  fetchSpanEvaluations?: (spanId: string) => Promise<ScoreData[]>;
  fetchSpanIO?: (traceId: string, spanId: string) => Promise<SpanIOData | null>;
  navigateToFile?: (filePath: string) => void;
  traceId?: string;
  setSelectedSpanId: (spanId: string) => void;
  treeHeight: number;
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
  t: (key: string) => string;
  onSpanChange?: (span: SpanData | null) => void;
}

export interface TraceDrawerProviderProps {
  traces: TraceData[];
  traceId?: string;
  sessionId?: string;
  fetchSpanEvaluations?: (spanId: string) => Promise<ScoreData[]>;
  fetchSpanIO?: (traceId: string, spanId: string) => Promise<SpanIOData | null>;
  navigateToFile?: (filePath: string) => void;
  t: (key: string) => string;
  onSpanChange?: (span: SpanData | null) => void;
}

/**
 * Find root spans in a trace (spans with no parent or whose parent isn't in the trace).
 */
export function findRootSpans(trace: TraceData): any[] {
  return trace.spans.filter(
    (s: any) => !s.parentId || !trace.spans.some((p: any) => p.id === s.parentId)
  );
}

/**
 * Merge root span data into a trace-level data object.
 * When a trace has exactly one root span, its rich fields (input, output, model,
 * tokens, etc.) are copied to the trace wrapper — like Langfuse does.
 */
function mergeRootSpanData(rootSpans: any[], trace: TraceData, traceData?: Record<string, any>): Record<string, any> {
  const rootSpanData = rootSpans.length === 1 ? (rootSpans[0]!.data || {}) : {};
  return {
    ...rootSpanData,
    ...(traceData || trace.data || {}),
    input: rootSpanData.input,
    output: rootSpanData.output,
    outputObject: rootSpanData.outputObject,
    model: rootSpanData.model,
    props: rootSpanData.props,
    promptName: rootSpanData.promptName,
    inputTokens: rootSpanData.inputTokens,
    outputTokens: rootSpanData.outputTokens,
    totalTokens: rootSpanData.totalTokens,
    reasoningTokens: rootSpanData.reasoningTokens,
    toolCalls: rootSpanData.toolCalls,
    sessionId: rootSpanData.sessionId,
  };
}

const TraceDrawerContext = createContext<TraceDrawerContextValue | undefined>(
  undefined
);

export const TraceDrawerProvider = ({
  children,
  traces,
  traceId,
  fetchSpanEvaluations,
  fetchSpanIO,
  t,
  onSpanChange,
}: TraceDrawerProviderProps & { children: ReactNode }) => {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

  // Compute root spans once per trace set to avoid redundant O(n²) lookups
  const rootSpansByTraceId = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const trace of traces) {
      map.set(trace.id, findRootSpans(trace));
    }
    return map;
  }, [traces]);

  const selectedSpan = useMemo(() => {
    if (!selectedSpanId) {
      if (traces.length > 0 && traces[0]) {
        const firstTrace = traces[0];
        return {
          id: firstTrace.id,
          name: firstTrace.name,
          data: mergeRootSpanData(rootSpansByTraceId.get(firstTrace.id) || [], firstTrace),
          duration: 0,
          timestamp: 0,
        } satisfies SpanData;
      }
      return null;
    }

    const trace = traces.find((tr) => tr.id === selectedSpanId);
    if (trace) {
      return {
        id: trace.id,
        name: trace.name,
        data: mergeRootSpanData(rootSpansByTraceId.get(trace.id) || [], trace),
        duration: 0,
        timestamp: 0,
        traceId: trace.id,
      } satisfies SpanData;
    }

    // Then check spans across all traces
    const span = traces
      .flatMap((tr) => tr.spans)
      .find((s) => s.id === selectedSpanId);

    if (span) {
      const traceForSpan = traces.find((tr) =>
        tr.spans.some((s) => s.id === span.id)
      );
      return {
        ...span,
        traceId: traceForSpan?.id,
      };
    }

    return null;
  }, [selectedSpanId, traces, rootSpansByTraceId]);

  const spanTree = useMemo(() => {
    const buildSpanTree = (traces: TraceData[]) => {
      const tree: any = [];
      const lookup: any = {};

      traces.forEach((trace) => {
        trace.spans.forEach((span: any) => {
          lookup[span.id] = {
            ...span,
            children: [],
          };
        });
      });

      traces.forEach((trace) => {
        const rootSpans: any[] = [];

        trace.spans.forEach((span: any) => {
          if (span.parentId && lookup[span.parentId]) {
            lookup[span.parentId].children.push(lookup[span.id]);
          } else {
            rootSpans.push(lookup[span.id]);
          }
        });

        tree.push({
          id: trace.id,
          name: trace.name,
          children: rootSpans,
          data: {
            ...mergeRootSpanData(rootSpans, trace),
            duration: trace.data.latency,
          },
        });
      });

      return tree;
    };

    return buildSpanTree(traces);
  }, [traces]);

  const { treeHeight, handleMouseDown, isDragging } = useTraceDrawer();

  useEffect(() => {
    return () => {
      setSelectedSpanId(null);
    };
  }, [traces]);

  useEffect(() => {
    if (onSpanChange) {
      onSpanChange(selectedSpan);
    }
  }, [selectedSpan, onSpanChange]);

  // Cost and token calculation function
  const findCostAndTokens = useCallback((item: any) => {
    const costAndTokenCache: any = {};

    const calculate = (node: any): { cost: number; tokens: number } => {
      if (costAndTokenCache[node.id]) {
        return costAndTokenCache[node.id];
      }

      if (node.data.tokens > 0) {
        return {
          cost: node.data.cost || 0,
          tokens: node.data.tokens,
        };
      }
      if (node.children.length > 0) {
        const result = node.children.reduce(
          (acc: any, curr: any) => {
            const { cost, tokens } = calculate(curr);
            return {
              cost: acc.cost + cost,
              tokens: acc.tokens + tokens,
            };
          },
          {
            cost: 0,
            tokens: 0,
          }
        );
        costAndTokenCache[node.id] = result;
        return result;
      }
      return {
        cost: Number(node.data.cost) || 0,
        tokens: Number(node.data.tokens) || 0,
      };
    };

    return calculate(item);
  }, []);

  const onSelectSpan = useCallback((spanId: string) => {
    setSelectedSpanId(spanId);
  }, []);

  const value: TraceDrawerContextValue = useMemo(() => ({
    traces,
    selectedSpan,
    onSelectSpan,
    spanTree,
    findCostAndTokens,
    fetchSpanEvaluations,
    fetchSpanIO,
    traceId,
    setSelectedSpanId,
    treeHeight,
    onMouseDown: handleMouseDown,
    isDragging,
    t,
    onSpanChange,
  }), [
    traces,
    selectedSpan,
    onSelectSpan,
    spanTree,
    findCostAndTokens,
    fetchSpanEvaluations,
    fetchSpanIO,
    traceId,
    treeHeight,
    handleMouseDown,
    isDragging,
    t,
    onSpanChange,
  ]);

  return (
    <TraceDrawerContext.Provider value={value}>
      {children}
    </TraceDrawerContext.Provider>
  );
};

export const useTraceDrawerContext = () => {
  const context = useContext(TraceDrawerContext);
  if (!context) {
    throw new Error(
      "useTraceDrawerContext must be used within TraceDrawerProvider"
    );
  }
  return context;
};
