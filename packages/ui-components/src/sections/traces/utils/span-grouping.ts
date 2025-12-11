/**
 * Span Grouping Utilities for Agentic Workflow Graph
 *
 * Groups spans by {parentSpanId, spanName} to create workflow nodes,
 * and provides type inference for automatic node styling.
 */

/**
 * Minimal span data required for grouping
 */
export interface SpanForGrouping {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  type?: string;
  data?: {
    type?: string;
    toolCalls?: string;
  };
}

/**
 * Valid node types for workflow graph nodes.
 * Maps to icon/color styling in node-styling.ts.
 */
export type WorkflowNodeType =
  | "llm"
  | "tool"
  | "agent"
  | "retrieval"
  | "router"
  | "memory"
  | "default"
  | "start"
  | "end";

/**
 * Intermediate grouping structure used during auto-generation.
 * Groups spans by their composite key (parentSpanId:spanName).
 */
export interface NodeGroup {
  /** Composite key: `${parentSpanId || 'root'}:${spanName}` */
  key: string;
  /** Parent span ID, undefined for root-level spans */
  parentSpanId?: string;
  /** Span operation name (e.g., "generateText", "search_web") */
  spanName: string;
  /** All span IDs belonging to this group */
  spanIds: string[];
  /** First span's start time for ordering */
  firstStartTime: number;
}

/**
 * Creates a unique group key for a span based on parent and name.
 *
 * @param parentSpanId - Parent span ID (undefined for root-level spans)
 * @param spanName - The span's operation name
 * @returns Composite key in format `{parentSpanId|root}:{spanName}`
 */
export function makeGroupKey(
  parentSpanId: string | undefined,
  spanName: string
): string {
  const parent = parentSpanId || "root";
  return `${parent}:${spanName}`;
}

/**
 * Groups spans by their composite key (parentSpanId:spanName).
 *
 * @param spans - Array of spans to group
 * @returns Map of group key to NodeGroup
 */
export function groupSpansByKey(
  spans: SpanForGrouping[]
): Map<string, NodeGroup> {
  const groups = new Map<string, NodeGroup>();

  for (const span of spans) {
    const key = makeGroupKey(span.parentSpanId, span.name);

    const existing = groups.get(key);
    if (existing) {
      existing.spanIds.push(span.spanId);
      // Update firstStartTime if this span is earlier
      if (span.startTime < existing.firstStartTime) {
        existing.firstStartTime = span.startTime;
      }
    } else {
      groups.set(key, {
        key,
        parentSpanId: span.parentSpanId,
        spanName: span.name,
        spanIds: [span.spanId],
        firstStartTime: span.startTime,
      });
    }
  }

  return groups;
}

/**
 * Infers the node type from span data for automatic styling.
 *
 * Priority:
 * 1. GENERATION type → "llm"
 * 2. Has tool calls → "tool"
 * 3. Has children with LLM/tool activity → "agent"
 * 4. Name-based fallbacks (retrieval, router, memory)
 * 5. Default
 *
 * @param span - The span to analyze
 * @param hasChildren - Whether this span has child spans
 * @returns The inferred node type
 */
export function inferNodeType(
  span: SpanForGrouping,
  hasChildren: boolean = false
): WorkflowNodeType {
  // 1. LLM detection: GENERATION type
  const spanType = span.type || span.data?.type;
  if (spanType === "GENERATION") {
    return "llm";
  }

  // 2. Tool detection: has tool calls data
  const toolCalls = span.data?.toolCalls;
  if (toolCalls && toolCalls !== "[]") {
    return "tool";
  }

  // 3. Agent detection: has child spans (indicates a sub-workflow)
  if (hasChildren) {
    return "agent";
  }

  // 4. Name-based fallbacks
  const name = (span.name || "").toLowerCase();

  if (name.includes("retrieval") || name.includes("rag") || name.includes("search")) {
    return "retrieval";
  }

  if (name.includes("router") || name.includes("route")) {
    return "router";
  }

  if (name.includes("memory") || name.includes("store") || name.includes("cache")) {
    return "memory";
  }

  // 5. Check if name suggests it's a tool
  if (name.includes("tool") || name.includes("function")) {
    return "tool";
  }

  // 6. Default
  return "default";
}

/**
 * Gets the display name for a span group.
 * Falls back to "Operation" if no name is available.
 *
 * @param spanName - The span's operation name
 * @returns Human-readable display name
 */
export function getDisplayName(spanName: string): string {
  return spanName || "Operation";
}

/**
 * Checks if a set of spans has children (for agent detection).
 *
 * @param spans - All spans in the trace
 * @param parentSpanIds - Set of span IDs to check for children
 * @returns true if any of the spans has children
 */
export function hasChildSpans(
  spans: SpanForGrouping[],
  parentSpanIds: Set<string>
): boolean {
  return spans.some(
    (span) => span.parentSpanId && parentSpanIds.has(span.parentSpanId)
  );
}
