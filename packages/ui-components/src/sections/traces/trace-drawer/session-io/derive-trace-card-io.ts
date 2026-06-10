import {
  extractPromptsFromSpan,
  extractOutputFromSpan,
  isGenerationSpan,
} from "../span-info/tabs/hooks/use-span-prompts";
import { LLMPrompt } from "@/sections/traces/types";

export interface TraceCardIO {
  prompts: LLMPrompt[];
  outputData: ReturnType<typeof extractOutputFromSpan>;
}

const collectDescendants = (nodes: any[]): any[] =>
  nodes.flatMap((node) => [node, ...collectDescendants(node.children || [])]);

/**
 * Trace-level I/O for a session card, matching the canonical `deriveTraceIO`
 * definition (shared-utils, PR #2744): the trace wrapper's (root span's) I/O
 * wins, and each field independently falls back to the trace's GENERATION
 * spans — input from the FIRST generation carrying one, output from the LAST —
 * in timestamp order, skipping empty values.
 *
 * Without the fallback, a trace whose root span records no I/O (anything not
 * run through the WebhookRunner's root-span recording, e.g. plain AI-SDK
 * instrumentation) rendered an empty card here while the trace detail
 * endpoints showed I/O — a competing trace-I/O definition, which is exactly
 * what deriveTraceIO exists to eliminate.
 */
export const deriveTraceCardIO = (traceNode: any): TraceCardIO => {
  // span-shaped view of the trace wrapper: the extraction helpers only read
  // `name` and `data`, which the provider has merged from the root span.
  const wrapperView = {
    id: traceNode.id,
    name: traceNode.name,
    data: traceNode.data,
  };
  let prompts = extractPromptsFromSpan(wrapperView);
  let outputData = extractOutputFromSpan(wrapperView);

  if (prompts.length > 0 && outputData) return { prompts, outputData };

  const generations = collectDescendants(traceNode.children || [])
    .filter(isGenerationSpan)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  if (prompts.length === 0) {
    for (const generation of generations) {
      const extracted = extractPromptsFromSpan(generation);
      if (extracted.length > 0) {
        prompts = extracted;
        break;
      }
    }
  }

  if (!outputData) {
    for (let i = generations.length - 1; i >= 0; i--) {
      const extracted = extractOutputFromSpan(generations[i]);
      if (extracted) {
        outputData = extracted;
        break;
      }
    }
  }

  return { prompts, outputData };
};
