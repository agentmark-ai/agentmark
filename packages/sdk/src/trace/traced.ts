/**
 * Higher-order function wrapper for automatic IO capture on observed functions.
 *
 * Provides the observe() function that auto-captures function arguments
 * as span input and return values as span output.
 */

import api, { SpanStatusCode } from "@opentelemetry/api";
import { serializeValue } from "./serialize";

/** Span kind for categorizing observed operations. */
export const SpanKind = {
  FUNCTION: "function",
  LLM: "llm",
  TOOL: "tool",
  AGENT: "agent",
  RETRIEVAL: "retrieval",
  EMBEDDING: "embedding",
  GUARDRAIL: "guardrail",
} as const;

export type SpanKind = (typeof SpanKind)[keyof typeof SpanKind];

const OPENINFERENCE_KIND_MAP: Record<string, string> = {
  function: "CHAIN",
  llm: "LLM",
  tool: "TOOL",
  agent: "AGENT",
  retrieval: "RETRIEVER",
  embedding: "EMBEDDING",
  guardrail: "GUARDRAIL",
};

// Attribute keys matching the gen_ai semantic conventions used by the adapter
const INPUT_KEY = "gen_ai.request.input";
const OUTPUT_KEY = "gen_ai.response.output";
const SPAN_KIND_KEY = "agentmark.span.kind";

/** Options for the observe() wrapper. */
export type ObserveOptions = {
  /** Custom span name. Defaults to the function name. */
  name?: string;
  /** Span kind for categorization. Defaults to SpanKind.FUNCTION. */
  kind?: SpanKind;
  /** Whether to capture function args as input. Default true. */
  captureInput?: boolean;
  /** Whether to capture return value as output. Default true. */
  captureOutput?: boolean;
  /** Optional transform applied to inputs before serialization. */
  processInputs?: (
    inputs: Record<string, unknown>
  ) => Record<string, unknown>;
  /** Optional transform applied to output before serialization. */
  processOutputs?: (output: unknown) => unknown;
};

/**
 * Wrap an async function with automatic IO observation.
 *
 * Creates an OpenTelemetry span that captures function arguments as input
 * and return value as output, using gen_ai.request.input / gen_ai.response.output
 * attribute keys for UI display.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const myFunction = observe(async (itemType: string, baseUrl: string) => {
 *   return { result: "data" };
 * });
 *
 * // With options
 * const callApi = observe(
 *   async (query: string) => { ... },
 *   { name: "call-api", kind: SpanKind.TOOL }
 * );
 *
 * // With privacy hooks
 * const secureCall = observe(
 *   async (apiKey: string, query: string) => { ... },
 *   {
 *     processInputs: (inputs) => {
 *       const { apiKey, ...rest } = inputs;
 *       return rest;
 *     },
 *   }
 * );
 * ```
 */
export function observe<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options?: ObserveOptions
): (...args: TArgs) => Promise<TReturn> {
  const spanName = options?.name ?? fn.name ?? "anonymous";
  const kind = options?.kind ?? SpanKind.FUNCTION;
  const captureInput = options?.captureInput ?? true;
  const captureOutput = options?.captureOutput ?? true;
  const processInputs = options?.processInputs;
  const processOutputs = options?.processOutputs;

  const wrapper = async (...args: TArgs): Promise<TReturn> => {
    const tracer = api.trace.getTracer("agentmark");

    return tracer.startActiveSpan(spanName, async (span) => {
      span.setAttribute(SPAN_KIND_KEY, kind);
      span.setAttribute('openinference.span.kind', OPENINFERENCE_KIND_MAP[kind] || 'CHAIN');

      if (captureInput) {
        let inputs: Record<string, unknown> = _captureArgs(args);
        if (processInputs) {
          inputs = processInputs(inputs);
        }
        span.setAttribute(INPUT_KEY, serializeValue(inputs));
      }

      try {
        const result = await fn(...args);

        if (captureOutput) {
          let output: unknown = result;
          if (processOutputs) {
            output = processOutputs(output);
          }
          span.setAttribute(OUTPUT_KEY, serializeValue(output));
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (e: any) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: e.message,
        });
        throw e;
      } finally {
        span.end();
      }
    });
  };

  // Preserve function name for debugging
  Object.defineProperty(wrapper, "name", { value: spanName });

  return wrapper;
}

/**
 * Capture function arguments as a key-value record.
 *
 * Since JS doesn't have runtime parameter name introspection:
 * - Single object arg → use it directly (common pattern)
 * - Multiple args → wrap as { arg0, arg1, ... }
 */
function _captureArgs(args: unknown[]): Record<string, unknown> {
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    return args[0] as Record<string, unknown>;
  }
  const record: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    record[`arg${i}`] = args[i];
  }
  return record;
}
