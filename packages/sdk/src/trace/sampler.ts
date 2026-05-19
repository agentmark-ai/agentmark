import { Attributes, Context, SpanKind } from "@opentelemetry/api";
import { Sampler, SamplingDecision, SamplingResult } from "@opentelemetry/sdk-trace-base";

const FILTERED_ATTRIBUTE_KEYS = ["next.span_name", "next.clientComponentLoadCount"];

// Mastra v0's legacy OTel telemetry (`@InstrumentClass({ prefix, excludeMethods })`
// + `telemetry.traceClass(instance)`) wraps every public method on Agent,
// Mastra, Workflow, storage proxies, etc. Many of those methods are pure
// getters/setters/initializers that emit OTel spans with no user-meaningful
// I/O. With telemetry on, they dominate the trace drawer (issue #1150
// screenshot: `mastra.getStorage` ×5, `.persistWorkflowSnapshot` ×4 above a
// single `workflow.weather-workflow.execute`).
//
// Mastra is deprecating this telemetry system entirely (mastra-ai/mastra#8577)
// in favor of AI Tracing, which filters internal spans on the producer side.
// Until that migration completes, we filter on the consumer side. Mastra's
// own AI Tracing blog (https://mastra.ai/blog/aitracing) explicitly
// classifies "context initialization, response formatting" — the exact spans
// below — as noise. Langfuse's OTel SDK
// (https://langfuse.com/integrations/native/opentelemetry) also drops these
// by default (it keeps only `gen_ai.*` spans and known LLM instrumentors).
//
// Three filters, listed in increasing aggressiveness:
//
//   1. FILTERED_SPAN_NAMES — exact matches inside the `agent.*` family.
//      Mastra's `Agent` class instruments most methods, but a few are
//      user-facing (`agent.generate`, `agent.stream`, `agent.prepareLLMOptions`
//      whose attributes the dashboard normalizer reads) and must stay. So
//      we enumerate the noise explicitly rather than dropping `agent.*`
//      wholesale. The seven below are private internal helpers that fetch,
//      convert, or format tool collections — none appear in
//      `@mastra/core/agent/index.d.ts`.
//
//   2. FILTERED_SPAN_PREFIXES — drop everything under a prefix.
//      `mastra.*` is the top-level orchestrator class
//      (`@InstrumentClass({ prefix: "mastra", excludeMethods: ["getLogger",
//      "getTelemetry"] })`). Every instrumented method on it is a getter,
//      setter, or initializer (`getStorage`, `getWorkflow`, `setLogger`,
//      `generateId`, etc.) — none are user-meaningful operations. Drop the
//      whole prefix.
//
//   3. spanName.startsWith(".") — leading-dot spans come from
//      `telemetry.traceClass(instance)` when the wrapped instance's
//      `constructor.name` is empty (anonymous/proxy class). The
//      `traceClass` implementation builds `spanName: ${prefix}.${method}`
//      where prefix defaults to `instance.constructor.name.toLowerCase()`,
//      so an empty constructor name produces `.persistWorkflowSnapshot` /
//      `.loadWorkflowSnapshot` etc. These are always internal infrastructure
//      proxies — drop the whole pattern.
const FILTERED_SPAN_NAMES = new Set<string>([
  "agent.getAssignedTools",
  "agent.getClientTools",
  "agent.getMemoryTools",
  "agent.getToolsets",
  "agent.getWorkflowTools",
  "agent.convertTools",
  "agent.formatTools",
]);

const FILTERED_SPAN_PREFIXES = ["mastra."];

export class AgentmarkSampler implements Sampler {
    shouldSample(
      _context: Context,
      _traceId: string,
      spanName: string,
      _spanKind: SpanKind,
      attributes: Attributes,
    ): SamplingResult {
      if (FILTERED_SPAN_NAMES.has(spanName)) {
        return { decision: SamplingDecision.NOT_RECORD };
      }
      if (spanName.startsWith(".")) {
        return { decision: SamplingDecision.NOT_RECORD };
      }
      for (const prefix of FILTERED_SPAN_PREFIXES) {
        if (spanName.startsWith(prefix)) {
          return { decision: SamplingDecision.NOT_RECORD };
        }
      }

      let filter = false;
      FILTERED_ATTRIBUTE_KEYS.forEach((key) => {
        if (attributes?.[key]) {
          filter = true;
        }
      });

      return {
        decision: filter
          ? SamplingDecision.NOT_RECORD
          : SamplingDecision.RECORD_AND_SAMPLED,
      };
    }

    toString(): string {
      return "AgentmarkSampler";
    }
  }
