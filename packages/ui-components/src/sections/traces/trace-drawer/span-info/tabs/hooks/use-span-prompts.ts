import { useMemo, useState, useEffect, useRef } from "react";
import { useTraceDrawerContext, SpanIOData } from "../../../trace-drawer-provider";
import type { SpanData } from "../../../types";
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
  isLoadingIO: boolean;
}

export const isToolSpan = (span: any): boolean => {
  if (!span?.data) return false;
  // Has toolCalls data, or type is SPAN (not GENERATION)
  if (span.data.toolCalls) return true;
  if (span.data.type === "SPAN" && span.name && !span.name.startsWith("claude.")) return true;
  return false;
};

export const isAgentSpan = (span: any): boolean => {
  if (span?.name?.startsWith("invoke_agent")) return true;
  // Trace wrapper node: has props, not a GENERATION span
  if (span?.data?.props && span?.data?.type !== "GENERATION") return true;
  return false;
};

export const extractPromptsFromSpan = (span: any): LLMPrompt[] => {
  // Agent spans (invoke_agent, trace wrapper): show props or input
  if (isAgentSpan(span)) {
    // Prefer props (AgentMark prompt input)
    if (span?.data?.props) {
      try {
        const props = typeof span.data.props === "string"
          ? JSON.parse(span.data.props)
          : span.data.props;
        const content = JSON.stringify(props, null, 2);
        return [{ role: "input", content }];
      } catch { /* ignore */ }
    }
    // Fall back to input (Pydantic AI agent spans have input from all_messages)
    if (span?.data?.input) {
      try {
        const parsed = JSON.parse(span.data.input);
        if (Array.isArray(parsed)) {
          return parsed.map((msg: any) => ({ ...msg, role: "input" }));
        }
      } catch { /* ignore */ }
      return [{ role: "input", content: span.data.input }];
    }
    return [];
  }

  // Tool spans: show input as "tool" role (renders as "Tool" label)
  if (isToolSpan(span)) {
    // Prefer toolCalls args as input
    if (span?.data?.toolCalls) {
      try {
        const toolCalls = typeof span.data.toolCalls === "string"
          ? JSON.parse(span.data.toolCalls)
          : span.data.toolCalls;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          const tc = toolCalls[0];
          const args = tc.args;
          const content = typeof args === "string" ? args : JSON.stringify(args, null, 2);
          return [{ role: "input", content }];
        }
      } catch { /* ignore parse errors */ }
    }
    // Fall back to input field but use "tool" role
    if (span?.data?.input) {
      try {
        const parsed = JSON.parse(span.data.input);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((msg: any) => ({ ...msg, role: "input" }));
        }
      } catch { /* ignore */ }
      return [{ role: "input", content: span.data.input }];
    }
    return [];
  }

  if (!span?.data?.input) return [];

  try {
    const parsed = JSON.parse(span.data.input);
    // Array of LLMPrompt objects (standard format)
    if (Array.isArray(parsed)) return parsed;
    // Object with a messages array (e.g. { messages: [...] })
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.messages)) {
      return parsed.messages;
    }
    // Non-array parsed value — wrap as user message
    return [{ role: "user", content: typeof parsed === "string" ? parsed : span.data.input }];
  } catch {
    // Plain string (not valid JSON) — wrap as user message
    return [{ role: "user", content: span.data.input }];
  }
};

export const extractOutputFromSpan = (span: any) => {
  // Agent spans: render output as plain text (no tool icon)
  if (isAgentSpan(span)) {
    if (!span?.data?.output && !span?.data?.outputObject) return null;

    let objectResponse = null;
    if (span.data.outputObject) {
      try {
        objectResponse =
          typeof span.data.outputObject === "string"
            ? JSON.parse(span.data.outputObject)
            : span.data.outputObject;
      } catch { objectResponse = null; }
    }

    return {
      text: span.data.output || undefined,
      objectResponse,
    };
  }

  // Tool spans: always pass toolCall so output renders with "Tool" label
  if (isToolSpan(span)) {
    let toolCall: any = null;

    // Extract toolCall from toolCalls data
    if (span?.data?.toolCalls) {
      try {
        const toolCalls = typeof span.data.toolCalls === "string"
          ? JSON.parse(span.data.toolCalls)
          : span.data.toolCalls;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          toolCall = toolCalls[0];
        }
      } catch { /* ignore */ }
    }

    // If no toolCall extracted, create a synthetic one from span name for labeling
    if (!toolCall) {
      toolCall = { toolName: span?.name || "tool" };
    }

    // Prefer toolCall result, then span output
    const text = toolCall?.result
      ? (typeof toolCall.result === "string" ? toolCall.result : JSON.stringify(toolCall.result, null, 2))
      : span?.data?.output || undefined;

    if (!text) return null;
    return { text, toolCall };
  }

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

/**
 * Extract the system prompt from the first invoke_agent span's attributes.
 * Cached per trace set so we don't re-walk spans on every span selection.
 */
export const extractSystemPromptFromTraces = (traces: any[]): string | null => {
  for (const trace of traces) {
    for (const s of trace.spans || []) {
      if (s.name?.startsWith("invoke_agent")) {
        try {
          const attrs = typeof s.data?.attributes === "string"
            ? JSON.parse(s.data.attributes)
            : s.data?.attributes;
          if (attrs?.["agentmark.system_prompt"]) {
            return attrs["agentmark.system_prompt"];
          }
        } catch { /* ignore */ }
      }
    }
  }
  return null;
};

/**
 * Merge lazy-loaded I/O data into a span, returning a new span object
 * with the IO fields populated.
 */
export const mergeSpanIO = (span: SpanData | null | undefined, io: SpanIOData): SpanData | null | undefined => {
  if (!span) return span;
  return {
    ...span,
    data: {
      ...span.data,
      input: io.input,
      output: io.output,
      outputObject: io.outputObject,
      toolCalls: io.toolCalls,
    },
  };
};

export const useSpanPrompts = (): UseSpanPromptsResult => {
  const { selectedSpan, traces, fetchSpanIO } = useTraceDrawerContext();
  const [lazyIO, setLazyIO] = useState<SpanIOData | null>(null);
  const [isLoadingIO, setIsLoadingIO] = useState(false);
  const ioCache = useRef<Map<string, SpanIOData>>(new Map());

  // Fetch I/O lazily when fetchSpanIO is provided and span has no data
  const spanId = selectedSpan?.id;
  const traceId = selectedSpan?.traceId;
  const hasIO = !!(selectedSpan?.data?.input || selectedSpan?.data?.output || selectedSpan?.data?.toolCalls || selectedSpan?.data?.outputObject);

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
      return mergeSpanIO(selectedSpan, lazyIO);
    }
    return selectedSpan;
  }, [selectedSpan, lazyIO, hasIO]);

  // Cache system prompt per trace set (not per span)
  const cachedSystemPrompt = useMemo(() => {
    return extractSystemPromptFromTraces(traces);
  }, [traces]);

  // Only apply system prompt to chat/generation spans, not agent or tool spans
  const systemPrompt = useMemo(() => {
    if (!cachedSystemPrompt || !effectiveSpan) return null;
    if (isAgentSpan(effectiveSpan) || isToolSpan(effectiveSpan)) return null;
    return cachedSystemPrompt;
  }, [cachedSystemPrompt, effectiveSpan]);

  const prompts = useMemo(() => {
    const extracted = extractPromptsFromSpan(effectiveSpan);
    // Prepend system prompt from parent invoke_agent if not already present
    if (systemPrompt && !extracted.some((p) => p.role === "system")) {
      return [{ role: "system" as const, content: systemPrompt }, ...extracted];
    }
    return extracted;
  }, [effectiveSpan, systemPrompt]);

  const outputData = useMemo(() => {
    return extractOutputFromSpan(effectiveSpan);
  }, [effectiveSpan]);

  return {
    prompts,
    outputData,
    isLoading: !selectedSpan,
    isLoadingIO,
  };
};
