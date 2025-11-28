import { AttributeExtractor, NormalizedSpan } from '../../../types';
import { parseTokens } from '../../../extractors/token-parser';
import { parseMetadata } from '../../../extractors/metadata-parser';
import { extractReasoningFromProviderMetadata } from '../token-helpers';  // Changed import

export class AiSdkV5Strategy implements AttributeExtractor {
    extractModel(attributes: Record<string, any>): string | undefined {
        return attributes['gen_ai.request.model'] || attributes['ai.model.id'];
    }

    extractInput(attributes: Record<string, any>): string | undefined {
        // V5 also uses prompt messages
        return attributes['ai.prompt.messages']
            ? JSON.stringify(attributes['ai.prompt.messages'])
            : undefined;
    }

    extractOutput(attributes: Record<string, any>): string | undefined {
        // V5 uses 'ai.response.*'
        if (attributes['ai.response.text']) return attributes['ai.response.text'];
        if (attributes['ai.response.object']) return JSON.stringify(attributes['ai.response.object']);
        return undefined;
    }

    extractTokens(attributes: Record<string, any>): { input?: number; output?: number; total?: number; reasoning?: number } {
        // V5 aligns better with OTel GenAI conventions
        const tokens = parseTokens(attributes, {
            inputKey: 'gen_ai.usage.input_tokens',
            outputKey: 'gen_ai.usage.output_tokens',
            totalKey: 'gen_ai.usage.total_tokens',
            promptKey: 'ai.usage.promptTokens',      // SDK specific fallback
            completionKey: 'ai.usage.completionTokens', // SDK specific fallback
            reasoningKey: 'ai.usage.reasoningTokens'     // AI SDK v5 uses this
        });

        // Fallback to providerMetadata for reasoning tokens
        if (!tokens.reasoningTokens) {
            tokens.reasoningTokens = extractReasoningFromProviderMetadata(attributes);
        }

        return {
            input: tokens.inputTokens,
            output: tokens.outputTokens,
            total: tokens.totalTokens,
            reasoning: tokens.reasoningTokens
        };
    }

    extractMetadata(attributes: Record<string, any>): Partial<NormalizedSpan> {
        return parseMetadata(attributes);
    }
}
