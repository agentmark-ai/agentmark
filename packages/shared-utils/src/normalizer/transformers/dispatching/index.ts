/**
 * Default transformer that routes a span to the right extractor by sniffing its
 * attribute signature, instead of by OTel scope name.
 *
 * The registry dispatches scope → transformer by exact match, which works for
 * SDKs that emit one stable scope (Vercel AI SDK = "ai", Mastra =
 * "default-tracer", …). But the OpenInference and OpenLLMetry ecosystems each
 * span dozens of instrumentor scope names
 * (`openinference.instrumentation.langchain`,
 * `@arizeai/openinference-instrumentation-openai`, `opentelemetry.instrumentation.openai`, …),
 * so per-scope registration doesn't scale. This transformer is registered as the
 * registry *default* (replacing the bare OTel-GenAI default) and picks the
 * extractor from unambiguous attribute markers, falling back to the OTel GenAI
 * semantic conventions when nothing framework-specific is present.
 *
 * classify() and transform() must agree on the chosen extractor, so both call
 * the single `select()` method.
 */

import { NormalizedSpan, OtelSpan, ScopeTransformer, SpanType } from '../../types';
import { OpenInferenceTransformer } from '../openinference';
import { OpenLLMetryTransformer } from '../openllmetry';
import { OtelGenAiTransformer } from '../otel-genai';

const OPENINFERENCE_INDEXED = /^llm\.(input_messages|output_messages|token_count)\./;
const OPENLLMETRY_INDEXED = /^gen_ai\.(prompt|completion)\.\d+\./;

function isOpenInference(attributes: Record<string, any>): boolean {
    if (attributes['openinference.span.kind'] !== undefined) return true;
    if (attributes['llm.model_name'] !== undefined) return true;
    for (const key of Object.keys(attributes)) {
        if (OPENINFERENCE_INDEXED.test(key)) return true;
    }
    return false;
}

function isOpenLLMetry(attributes: Record<string, any>): boolean {
    for (const key of Object.keys(attributes)) {
        if (key.startsWith('traceloop.')) return true;
        if (OPENLLMETRY_INDEXED.test(key)) return true;
    }
    return false;
}

export class DispatchingTransformer implements ScopeTransformer {
    private readonly openInference = new OpenInferenceTransformer();
    private readonly openLLMetry = new OpenLLMetryTransformer();
    private readonly otelGenAi = new OtelGenAiTransformer();

    /** Choose the extractor for a span from its attribute signature. OpenInference
     *  is checked before OpenLLMetry because its markers (`llm.*`,
     *  `openinference.span.kind`) are more specific; the bare OTel GenAI
     *  transformer is the catch-all. */
    select(attributes: Record<string, any>): ScopeTransformer {
        if (isOpenInference(attributes)) return this.openInference;
        if (isOpenLLMetry(attributes)) return this.openLLMetry;
        return this.otelGenAi;
    }

    classify(span: OtelSpan, attributes: Record<string, any>): SpanType {
        return this.select(attributes).classify(span, attributes);
    }

    transform(span: OtelSpan, attributes: Record<string, any>): Partial<NormalizedSpan> {
        return this.select(attributes).transform(span, attributes);
    }
}
