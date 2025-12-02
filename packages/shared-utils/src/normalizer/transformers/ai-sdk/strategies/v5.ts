import { AttributeExtractor, NormalizedSpan, Message, ToolCall } from '../../../types';
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
        // Only return text, objects go to outputObject
        if (attributes['ai.response.text'] !== undefined) return attributes['ai.response.text'];
        return undefined;
    }

    extractOutputObject(attributes: Record<string, any>): Record<string, any> | undefined {
        // V5 uses 'ai.response.object'
        if (attributes['ai.response.object'] === undefined) {
            return undefined;
        }

        const objValue = attributes['ai.response.object'];
        
        // Parse if it's a string, otherwise use as-is
        if (typeof objValue === 'string') {
            try {
                return JSON.parse(objValue);
            } catch {
                return undefined;
            }
        }
        
        // Return object directly (not stringified)
        if (typeof objValue === 'object' && objValue !== null) {
            return objValue;
        }
        return undefined;
    }

    extractToolCalls(attributes: Record<string, any>): ToolCall[] | undefined {
        // V5 uses 'ai.response.toolCalls'
        if (attributes['ai.response.toolCalls'] === undefined) {
            return undefined;
        }

        const toolCallsValue = attributes['ai.response.toolCalls'];

        // Parse if it's a string, otherwise use as-is
        let toolCalls: any;
        if (typeof toolCallsValue === 'string') {
            try {
                toolCalls = JSON.parse(toolCallsValue);
            } catch {
                return undefined;
            }
        } else {
            toolCalls = toolCallsValue;
        }

        // Ensure it's an array
        if (!Array.isArray(toolCalls)) {
            return undefined;
        }

        // Normalize: map v5 'input' to unified 'args' field
        return toolCalls.map((tc: any) => ({
            type: tc.type || 'tool-call',
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: tc.input || tc.args || {},  // v5 uses 'input', normalize to 'args'
            providerMetadata: tc.providerMetadata || tc.providerOptions,
        }));
    }

    extractFinishReason(attributes: Record<string, any>): string | undefined {
        // V5: Check ai.response.finishReason (primary) or gen_ai.response.finish_reasons (OTel)
        if (attributes['ai.response.finishReason'] !== undefined) {
            return String(attributes['ai.response.finishReason']);
        }
        if (attributes['gen_ai.response.finish_reasons'] !== undefined) {
            const reasons = attributes['gen_ai.response.finish_reasons'];
            // OTel can be an array, take first element if array
            if (Array.isArray(reasons) && reasons.length > 0) {
                return String(reasons[0]);
            }
            return String(reasons);
        }
        return undefined;
    }

    extractSettings(attributes: Record<string, any>): NormalizedSpan['settings'] {
        const settings: NormalizedSpan['settings'] = {};

        // Check OTel keys first, then fallback to AI SDK keys
        if (attributes['gen_ai.request.temperature'] !== undefined || attributes['ai.settings.temperature'] !== undefined) {
            const value = attributes['gen_ai.request.temperature'] ?? attributes['ai.settings.temperature'];
            settings.temperature = typeof value === 'number' ? value : parseFloat(String(value));
        }

        if (attributes['gen_ai.request.max_tokens'] !== undefined || attributes['ai.settings.maxTokens'] !== undefined) {
            const value = attributes['gen_ai.request.max_tokens'] ?? attributes['ai.settings.maxTokens'];
            settings.maxTokens = typeof value === 'number' ? value : parseInt(String(value), 10);
        }

        if (attributes['gen_ai.request.top_p'] !== undefined || attributes['ai.settings.topP'] !== undefined) {
            const value = attributes['gen_ai.request.top_p'] ?? attributes['ai.settings.topP'];
            settings.topP = typeof value === 'number' ? value : parseFloat(String(value));
        }

        if (attributes['gen_ai.request.presence_penalty'] !== undefined || attributes['ai.settings.presencePenalty'] !== undefined) {
            const value = attributes['gen_ai.request.presence_penalty'] ?? attributes['ai.settings.presencePenalty'];
            settings.presencePenalty = typeof value === 'number' ? value : parseFloat(String(value));
        }

        if (attributes['gen_ai.request.frequency_penalty'] !== undefined || attributes['ai.settings.frequencyPenalty'] !== undefined) {
            const value = attributes['gen_ai.request.frequency_penalty'] ?? attributes['ai.settings.frequencyPenalty'];
            settings.frequencyPenalty = typeof value === 'number' ? value : parseFloat(String(value));
        }

        // Only return if at least one setting is present
        return Object.keys(settings).length > 0 ? settings : undefined;
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
