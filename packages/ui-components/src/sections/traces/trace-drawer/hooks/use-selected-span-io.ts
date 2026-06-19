import { useEffect, useMemo, useRef, useState } from "react";
import { useTraceDrawerContext, SpanIOData } from "../trace-drawer-provider";
import type { SpanData } from "../../types";

/**
 * Merge lazy-loaded I/O data into a span, returning a new span object
 * with the IO fields populated.
 */
export const mergeSpanIO = (
  span: SpanData | null | undefined,
  io: SpanIOData
): SpanData | null | undefined => {
  if (!span) return span;
  return {
    ...span,
    // SpanIOData models absent outputObject/toolCalls as null (wire shape)
    // while SpanData.data models them as optional — callers treat both as
    // "no value", and the pinned contract is that nulls pass through as-is.
    data: {
      ...span.data,
      input: io.input,
      output: io.output,
      outputObject: io.outputObject,
      toolCalls: io.toolCalls,
      blobRefs: io.blobRefs,
    } as SpanData["data"],
  };
};

export interface UseSelectedSpanIOResult {
  /**
   * The drawer's selected span with input/output/outputObject/toolCalls
   * hydrated. Hosts that load traces "lightweight" (IO columns stripped for
   * the initial fetch) provide `fetchSpanIO` to fill them in lazily — any
   * consumer that reads IO off `selectedSpan.data` directly would otherwise
   * see empty strings.
   */
  effectiveSpan: SpanData | null;
  /** True while the lazy IO fetch for the current span is in flight. */
  isLoadingIO: boolean;
}

/**
 * The drawer context's `selectedSpan`, with its I/O lazily hydrated via the
 * host-provided `fetchSpanIO` when the span carries none (lightweight trace
 * loads). When the selected "span" is the synthetic trace wrapper
 * (spanId === traceId), the fetch resolves to the trace's root span id.
 */
export const useSelectedSpanIO = (): UseSelectedSpanIOResult => {
  const { selectedSpan, traces, fetchSpanIO } = useTraceDrawerContext();
  const [lazyIO, setLazyIO] = useState<SpanIOData | null>(null);
  const [isLoadingIO, setIsLoadingIO] = useState(false);
  const ioCache = useRef<Map<string, SpanIOData>>(new Map());

  const spanId = selectedSpan?.id;
  const traceId = selectedSpan?.traceId;
  const hasIO = !!(
    selectedSpan?.data?.input ||
    selectedSpan?.data?.output ||
    selectedSpan?.data?.toolCalls ||
    selectedSpan?.data?.outputObject
  );

  // When the selected "span" is actually a trace wrapper (spanId === traceId),
  // resolve to the root span's actual ID for the IO fetch.
  const resolvedSpanId = useMemo(() => {
    if (!spanId || !traceId || spanId !== traceId) return spanId;
    const trace = traces.find((t) => t.id === traceId);
    if (!trace || trace.spans.length === 0) return spanId;
    // Find root span (no parent or parent not in this trace)
    const rootSpan = trace.spans.find(
      (s) => !s.parentId || !trace.spans.some((p) => p.id === s.parentId)
    );
    return rootSpan?.id || spanId;
  }, [spanId, traceId, traces]);

  useEffect(() => {
    if (!fetchSpanIO || !resolvedSpanId || !traceId || hasIO) {
      setLazyIO(null);
      setIsLoadingIO(false);
      return;
    }

    // Check cache first
    const cached = ioCache.current.get(resolvedSpanId);
    if (cached) {
      setLazyIO(cached);
      setIsLoadingIO(false);
      return;
    }

    let cancelled = false;
    setIsLoadingIO(true);
    setLazyIO(null);

    fetchSpanIO(traceId, resolvedSpanId).then((io) => {
      if (cancelled) return;
      if (io) {
        ioCache.current.set(resolvedSpanId, io);
        setLazyIO(io);
      }
      setIsLoadingIO(false);
    }).catch(() => {
      if (!cancelled) setIsLoadingIO(false);
    });

    return () => { cancelled = true; };
  }, [fetchSpanIO, resolvedSpanId, traceId, hasIO]);

  // Use lazy-loaded IO if available, otherwise use span's built-in data
  const effectiveSpan = useMemo(() => {
    if (lazyIO && selectedSpan && !hasIO) {
      return mergeSpanIO(selectedSpan, lazyIO) ?? null;
    }
    return selectedSpan;
  }, [selectedSpan, lazyIO, hasIO]);

  return { effectiveSpan, isLoadingIO };
};
