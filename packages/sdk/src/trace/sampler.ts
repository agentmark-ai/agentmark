import { Attributes, Context, SpanKind } from "@opentelemetry/api";
import { Sampler, SamplingDecision, SamplingResult } from "@opentelemetry/sdk-trace-base";

const FILTERED_ATTRIBUTE_KEYS = ["next.span_name", "next.clientComponentLoadCount"];

export class AgentmarkSampler implements Sampler {
    shouldSample(
      _context: Context,
      _traceId: string,
      _spanName: string,
      _spanKind: SpanKind,
      attributes: Attributes,
    ): SamplingResult {
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
  