import { useMemo } from "react";
import { useTraceDrawerContext } from "../../../trace-drawer-provider";
import { useSelectedSpanIO, mergeSpanIO } from "../../../hooks/use-selected-span-io";
import { LLMPrompt } from "@/sections/traces/types";
import type { RetrievalDocumentView } from "../input-output-tab/retrieval-documents";

// Re-exported for backward compatibility — the canonical declaration moved to
// `../../../hooks/use-selected-span-io` so non-tab consumers (e.g. the drawer
// header's action buttons in hosts) can hydrate IO without importing tab code.
export { mergeSpanIO };

interface UseSpanPromptsResult {
  prompts: LLMPrompt[];
  outputData: {
    text?: string;
    toolCalls?: string;
    toolCall?: any;
    objectResponse?: any;
    documents?: RetrievalDocumentView[];
  } | null;
  /** JSON array of offloaded field pointers from the effective (IO-hydrated) span. */
  blobRefs?: string;
  isLoading: boolean;
  isLoadingIO: boolean;
}

// Identify an LLM generation span by data, not framework-specific span names —
// the way the normalizer + OTel GenAI semantic conventions do. The authoritative
// signal is the resolved semanticKind ("llm", surfaced as `spanKind`), which the
// normalizer derives vendor-neutrally (incl. from the presence of a model). The
// `|| !!model` is a back-compat shim for traces normalized BEFORE that resolver
// fix shipped (stored with the old kind) — we render them correctly without a
// ClickHouse backfill, since a span carrying a model is a model call regardless.
// Generation spans render as generations — messages in, response/object out —
// never as tool/agent spans (which would show the props blob or a synthetic
// tool label and drop object output).
export const isGenerationSpan = (span: any): boolean =>
  span?.data?.spanKind === "llm" || !!span?.data?.model;

// Retrieval / vector-store span — the normalizer resolves its semanticKind to
// "retrieval" (surfaced as `spanKind`). These render with the ranked
// retrieved-documents panel, never as a tool/agent span (which the generic
// "type === SPAN" tool heuristic below would otherwise misclassify them as).
export const isRetrievalSpan = (span: any): boolean =>
  span?.data?.spanKind === "retrieval";

export const isToolSpan = (span: any): boolean => {
  if (!span?.data) return false;
  if (isGenerationSpan(span)) return false;
  if (isRetrievalSpan(span)) return false;
  // Has toolCalls data, or type is SPAN (not GENERATION)
  if (span.data.toolCalls) return true;
  if (span.data.type === "SPAN" && span.name && !span.name.startsWith("claude.")) return true;
  return false;
};

export const isAgentSpan = (span: any): boolean => {
  if (isGenerationSpan(span)) return false;
  if (isRetrievalSpan(span)) return false;
  if (span?.name?.startsWith("invoke_agent")) return true;
  // Trace wrapper node: has props, not a GENERATION span
  if (span?.data?.props && span?.data?.type !== "GENERATION") return true;
  return false;
};

/** Parse the structured retrieved documents stored on a retrieval span's
 *  outputObject (`{ documents: [...] }`). Returns [] when absent/malformed. */
export const parseRetrievalDocuments = (span: any): RetrievalDocumentView[] => {
  const raw = span?.data?.outputObject;
  if (!raw) return [];
  let parsed: any = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { return []; }
  }
  const docs = parsed?.documents;
  return Array.isArray(docs) ? (docs as RetrievalDocumentView[]) : [];
};

export const extractPromptsFromSpan = (span: any): LLMPrompt[] => {
  // Retrieval spans: the input is the search query. Surface it under the
  // neutral "input" role (renders as "Input") rather than a chat "user" bubble.
  if (isRetrievalSpan(span)) {
    if (!span?.data?.input) return [];
    try {
      const parsed = JSON.parse(span.data.input);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // The normalizer wraps a raw query as [{ role: "user", content }].
        return parsed.map((msg: any) => ({
          role: "input",
          content: typeof msg?.content === "string" ? msg.content : JSON.stringify(msg),
        }));
      }
      if (typeof parsed === "string") return [{ role: "input", content: parsed }];
    } catch { /* fall through to raw string */ }
    return [{ role: "input", content: span.data.input }];
  }

  // Agent spans (invoke_agent, trace wrapper): show props or input
  if (isAgentSpan(span)) {
    // Prefer props (AgentMark prompt input)
    if (span?.data?.props) {
      try {
        const props = (typeof span.data.props === "string" && span.data.props.length > 0)
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
        const toolCalls = (typeof span.data.toolCalls === "string" && span.data.toolCalls.length > 0)
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
  // Retrieval spans: render the ranked retrieved-documents panel from the
  // structured outputObject; fall back to plain text for legacy traces that
  // only carry the joined-content output.
  if (isRetrievalSpan(span)) {
    const documents = parseRetrievalDocuments(span);
    if (documents.length > 0) return { documents };
    if (span?.data?.output) return { text: span.data.output };
    return null;
  }

  // Agent spans: render output as plain text (no tool icon)
  if (isAgentSpan(span)) {
    if (!span?.data?.output && !span?.data?.outputObject) return null;

    let objectResponse = null;
    if (span.data.outputObject) {
      try {
        objectResponse =
          (typeof span.data.outputObject === "string" && span.data.outputObject.length > 0)
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
        const toolCalls = (typeof span.data.toolCalls === "string" && span.data.toolCalls.length > 0)
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

  if (toolCalls && typeof toolCalls === "string" && toolCalls.length > 0) {
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
        (typeof span.data.outputObject === "string" && span.data.outputObject.length > 0)
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

export const useSpanPrompts = (): UseSpanPromptsResult => {
  const { selectedSpan, traces } = useTraceDrawerContext();
  // Fetch I/O lazily when fetchSpanIO is provided and span has no data
  const { effectiveSpan, isLoadingIO } = useSelectedSpanIO();

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
    // From the effective span so it reflects the lazily-hydrated IO (the raw
    // selectedSpan has no blobRefs until merge) — drives OffloadedOutput.
    blobRefs: effectiveSpan?.data?.blobRefs,
    isLoading: !selectedSpan,
    isLoadingIO,
  };
};

