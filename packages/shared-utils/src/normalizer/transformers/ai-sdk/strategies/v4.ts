import { AttributeExtractor, NormalizedSpan, Message, ToolCall } from '../../../types';
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
        // Only return text, objects go to outputObject
        if (attributes['ai.result.text'] !== undefined) return attributes['ai.result.text'];
        // Fallback to ai.response.* for compatibility
        if (attributes['ai.response.text'] !== undefined) return attributes['ai.response.text'];
        return undefined;
    }

    extractOutputObject(attributes: Record<string, any>): Record<string, any> | undefined {
        // V4 uses 'ai.result.*' but may also have 'ai.response.*' in some cases
        let objValue: any;
        if (attributes['ai.result.object'] !== undefined) {
            objValue = attributes['ai.result.object'];
        } else if (attributes['ai.response.object'] !== undefined) {
            objValue = attributes['ai.response.object'];
        } else {
            return undefined;
        }

        // Parse if it's a string, otherwise use as-is
        if (typeof objValue === 'string') {
            try {
                return JSON.parse(objValue);
            } catch {
                return undefined;
            }
        }
        return objValue;
    }

    extractToolCalls(attributes: Record<string, any>): ToolCall[] | undefined {
        // V4 uses 'ai.result.toolCalls' (primary) or 'ai.response.toolCalls' (fallback)
        let toolCallsValue: any;
        if (attributes['ai.result.toolCalls'] !== undefined) {
            toolCallsValue = attributes['ai.result.toolCalls'];
        } else if (attributes['ai.response.toolCalls'] !== undefined) {
            toolCallsValue = attributes['ai.response.toolCalls'];
        } else {
            return undefined;
        }

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

        // Normalize: map v4 'args' to unified 'args' field
        return toolCalls.map((tc: any) => ({
            type: tc.type || 'tool-call',
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: tc.args || tc.input || {},  // v4 uses 'args', normalize to 'args'
        }));
    }

    extractFinishReason(attributes: Record<string, any>): string | undefined {
        // V4: Check ai.result.finishReason (primary) or ai.response.finishReason (fallback) or gen_ai.response.finish_reasons (OTel)
        if (attributes['ai.result.finishReason'] !== undefined) {
            return String(attributes['ai.result.finishReason']);
        }
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
