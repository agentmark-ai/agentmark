import { AttributeExtractor, NormalizedSpan, Message } from '../../../types';
import { parseTokens } from '../../../extractors/token-parser';
import { parseMetadata } from '../../../extractors/metadata-parser';
import { extractReasoningFromProviderMetadata } from '../token-helpers';

export class AiSdkV4Strategy implements AttributeExtractor {
    extractModel(attributes: Record<string, any>): string | undefined {
        return attributes['gen_ai.request.model'] || attributes['ai.model.id'];
    }

    extractInput(attributes: Record<string, any>): Message[] | undefined {
        // V4 can have input in ai.prompt.messages or ai.prompt
        let messagesValue: any;
        
        if (attributes['ai.prompt.messages'] !== undefined) {
            messagesValue = attributes['ai.prompt.messages'];
        } else if (attributes['ai.prompt'] !== undefined) {
            const promptValue = attributes['ai.prompt'];
            // ai.prompt might be a JSON string with a messages property
            if (typeof promptValue === 'string') {
                try {
                    const parsed = JSON.parse(promptValue);
                    messagesValue = parsed.messages || parsed;
                } catch {
                    return undefined;
                }
            } else {
                messagesValue = promptValue.messages || promptValue;
            }
        } else {
            return undefined;
        }
        
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
        // V4 uses 'ai.result.*' but may also have 'ai.response.*' in some cases
        if (attributes['ai.result.text'] !== undefined) return attributes['ai.result.text'];
        if (attributes['ai.result.object'] !== undefined) {
            const objValue = attributes['ai.result.object'];
            return typeof objValue === 'string' ? objValue : JSON.stringify(objValue);
        }
        // Fallback to ai.response.* for compatibility
        if (attributes['ai.response.text'] !== undefined) return attributes['ai.response.text'];
        if (attributes['ai.response.object'] !== undefined) {
            const objValue = attributes['ai.response.object'];
            return typeof objValue === 'string' ? objValue : JSON.stringify(objValue);
        }
        return undefined;
    }

    extractTokens(attributes: Record<string, any>): { input?: number; output?: number; total?: number; reasoning?: number } {
        // V4 often uses legacy token keys
        const tokens = parseTokens(attributes, {
            inputKey: 'gen_ai.usage.prompt_tokens',
            outputKey: 'gen_ai.usage.completion_tokens',
            totalKey: 'gen_ai.usage.total_tokens',
            promptKey: 'ai.usage.promptTokens',      // SDK specific fallback
            completionKey: 'ai.usage.completionTokens' // SDK specific fallback
        });

        // V4 reasoning tokens come from providerMetadata
        tokens.reasoningTokens = extractReasoningFromProviderMetadata(attributes);
        
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
