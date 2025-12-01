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

    classify(span: OtelSpan, _attributes: Record<string, any>): SpanType {
        // Only specific generation spans are GENERATION:
        // - ai.generateText.doGenerate
        // - ai.streamText.doStream
        // - ai.generateObject.doGenerate
        // - ai.streamObject.doStream
        const isGenerationSpan = 
            span.name === 'ai.generateText.doGenerate' ||
            span.name === 'ai.streamText.doStream' ||
            span.name === 'ai.generateObject.doGenerate' ||
            span.name === 'ai.streamObject.doStream';
        
        return isGenerationSpan ? SpanType.GENERATION : SpanType.SPAN;
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
