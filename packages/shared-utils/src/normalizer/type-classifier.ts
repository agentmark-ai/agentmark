import { OtelSpan, SpanType } from './types';

export class TypeClassifier {
    classify(span: OtelSpan, attributes: Record<string, any>): SpanType {
        // 1. Check for GenAI semantic conventions
        // OTel GenAI semantic conventions use gen_ai.system as a strong indicator
        if (attributes['gen_ai.system'] || attributes['gen_ai.request.model'] || attributes['gen_ai.operation.name']) {
            return SpanType.GENERATION;
        }

        // 2. Check for AI SDK generation indicators (Vercel AI SDK)
        // Vercel AI SDK uses specific span names or attributes
        if (
            attributes['ai.response.text'] ||
            attributes['ai.result.text'] ||
            attributes['ai.response.toolCalls'] ||
            attributes['ai.result.toolCalls']
        ) {
            return SpanType.GENERATION;
        }

        // Check span name for common patterns if no attributes match
        if (span.name.startsWith('ai.generate') || span.name.startsWith('ai.stream')) {
            return SpanType.GENERATION;
        }

        // Default to SPAN
        return SpanType.SPAN;
    }
}

export const typeClassifier = new TypeClassifier();
