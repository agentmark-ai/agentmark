import { NormalizedSpan, OtelSpan, ScopeTransformer, AttributeExtractor, SpanType } from '../../types';
import { detectVersion } from './version-detector';
import { AiSdkV4Strategy } from './strategies/v4';
import { AiSdkV5Strategy } from './strategies/v5';

export class AiSdkTransformer implements ScopeTransformer {
    private strategies: {
        v4: AttributeExtractor;
        v5: AttributeExtractor;
    };

    constructor() {
        this.strategies = {
            v4: new AiSdkV4Strategy(),
            v5: new AiSdkV5Strategy(),
        };
    }

    classify(span: OtelSpan, attributes: Record<string, any>): SpanType {
        // Check for model-request (GENERATION) - must have model attribute
        const hasModel = attributes['gen_ai.request.model'] || 
                        attributes['ai.model.id'] || 
                        attributes['gen_ai.system'];
        
        if (hasModel) {
            return SpanType.GENERATION;
        }

        // Check for GenAI operation without model
        if (attributes['gen_ai.operation.name']) {
            return SpanType.SPAN;
        }

        // Check for AI SDK specific patterns (fallback)
        if (
            attributes['ai.response.text'] ||
            attributes['ai.result.text'] ||
            attributes['ai.response.toolCalls'] ||
            attributes['ai.result.toolCalls']
        ) {
            // Only classify as GENERATION if model exists
            if (hasModel) {
                return SpanType.GENERATION;
            }
            return SpanType.SPAN;
        }

        // Check span name for common patterns
        if (span.name.startsWith('ai.generate') || span.name.startsWith('ai.stream')) {
            // Only if model exists
            if (hasModel) {
                return SpanType.GENERATION;
            }
            return SpanType.SPAN;
        }

        return SpanType.SPAN;
    }

    transform(_span: OtelSpan, attributes: Record<string, any>): Partial<NormalizedSpan> {
        const version = detectVersion(attributes);

        const strategy = version === 'v5' ? this.strategies.v5 : this.strategies.v4;

        const tokens = strategy.extractTokens(attributes);

        return {
            model: strategy.extractModel(attributes),
            input: strategy.extractInput(attributes),
            output: strategy.extractOutput(attributes),
            inputTokens: tokens.input,
            outputTokens: tokens.output,
            totalTokens: tokens.total,
            reasoningTokens: tokens.reasoning,

            ...strategy.extractMetadata(attributes),
        };
    }
}
