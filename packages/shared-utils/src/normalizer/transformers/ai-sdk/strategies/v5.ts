import { AttributeExtractor, NormalizedSpan, Message } from '../../../types';
import { parseTokens } from '../../../extractors/token-parser';
import { parseMetadata } from '../../../extractors/metadata-parser';
import { extractReasoningFromProviderMetadata } from '../token-helpers';

export class AiSdkV5Strategy implements AttributeExtractor {
    extractModel(attributes: Record<string, any>): string | undefined {
        return attributes['gen_ai.request.model'] || attributes['ai.model.id'];
    }

    extractInput(attributes: Record<string, any>): Message[] | undefined {
        // V5 uses ai.prompt.messages
        if (attributes['ai.prompt.messages'] === undefined) {
            return undefined;
        }
        
        const messagesValue = attributes['ai.prompt.messages'];
        
        // Parse if it's a string, otherwise use as-is
        let messages: any;
        if (typeof messagesValue === 'string') {
            try {
                messages = JSON.parse(messagesValue);
            } catch {
                return undefined;
            }
        } else {
            messages = messagesValue;
        }
        
        // Ensure it's an array
        if (Array.isArray(messages)) {
            return messages as Message[];
        }
        
        return undefined;
    }

    extractOutput(attributes: Record<string, any>): string | undefined {
        // V5 uses 'ai.response.*'
        if (attributes['ai.response.text'] !== undefined) return attributes['ai.response.text'];
        if (attributes['ai.response.object'] !== undefined) return JSON.stringify(attributes['ai.response.object']);
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

        // Fallback to providerMetadata for reasoning tokens only if not already set
        // Note: We check for undefined explicitly to preserve 0 values
        if (tokens.reasoningTokens === undefined) {
            tokens.reasoningTokens = extractReasoningFromProviderMetadata(attributes);
        }
        
        if (!tokens.reasoningTokens) {
            tokens.reasoningTokens = 0;
        }

        return {
            input: tokens.inputTokens,
            output: tokens.outputTokens,
            total: tokens.totalTokens,
            reasoning: tokens.reasoningTokens
        };
    }

    extractMetadata(attributes: Record<string, any>): Partial<NormalizedSpan> {
        // First try agentmark.metadata.* prefix
        const result = parseMetadata(attributes);
        
        // Also check for ai.telemetry.metadata.* attributes
        const aiTelemetryResult = parseMetadata(attributes, 'ai.telemetry.metadata.');
        
        // Merge results (ai.telemetry.metadata takes precedence if both exist)
        return {
            ...result,
            ...aiTelemetryResult,
        };
    }
}
