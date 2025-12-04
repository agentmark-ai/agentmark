import { 
    AttributeExtractor, 
    NormalizedSpan, 
    Message, 
    ToolCall,
    StandardMessageContent,
    StandardToolCallContent,
    StandardToolResultContent,
} from '../../../types';
import { parseTokens } from '../../../extractors/token-parser';
import { parseMetadata, extractCustomMetadata } from '../../../extractors/metadata-parser';
import { extractReasoningFromProviderMetadata } from '../token-helpers';

export class AiSdkV5Strategy implements AttributeExtractor {
    /**
     * Normalize a content part from V5 format to standard format
     */
    private normalizeContentPart(part: any): StandardMessageContent {
        // Handle plain text parts
        if (typeof part === 'string') {
            return part;
        }

        if (!part || typeof part !== 'object') {
            return part;
        }

        const type = part.type;

        // Handle text content
        if (type === 'text') {
            return {
                type: 'text',
                text: part.text || '',
            };
        }

        // Handle tool-call content (V5 uses 'input', normalize to 'args')
        if (type === 'tool-call') {
            return {
                type: 'tool-call',
                toolCallId: part.toolCallId || '',
                toolName: part.toolName || '',
                args: part.input || part.args || {},  // V5 uses 'input', normalize to 'args'
            } as StandardToolCallContent;
        }

        // Handle tool-result content (V5 uses 'output.value', normalize to 'result')
        if (type === 'tool-result') {
            let normalizedResult: any;

            // V5 uses output: {type, value} structure
            if (part.output !== undefined) {
                // Extract the value from the output wrapper
                if (typeof part.output === 'object' && part.output !== null) {
                    // Handle output.value structure
                    if ('value' in part.output) {
                        normalizedResult = part.output.value;
                    } else {
                        // Fallback: use the whole output object
                        normalizedResult = part.output;
                    }
                } else {
                    normalizedResult = part.output;
                }
            } else if (part.result !== undefined) {
                // Fallback to result if output is not present
                normalizedResult = part.result;
            } else {
                normalizedResult = undefined;
            }

            return {
                type: 'tool-result',
                toolCallId: part.toolCallId || '',
                toolName: part.toolName || '',
                result: normalizedResult,
            } as StandardToolResultContent;
        }

        // Unknown type, return as-is
        return part;
    }

    /**
     * Normalize a single message from V5 format to standard format
     */
    private normalizeMessage(message: any): Message {
        if (!message || typeof message !== 'object') {
            return message;
        }

        const { role, content, ...rest } = message;

        // Normalize content
        let normalizedContent: StandardMessageContent | StandardMessageContent[];

        if (typeof content === 'string') {
            // Plain string content
            normalizedContent = content;
        } else if (Array.isArray(content)) {
            // Array of content parts - normalize each part
            normalizedContent = content.map((part) => this.normalizeContentPart(part));
        } else if (content && typeof content === 'object') {
            // Single content object - normalize it
            normalizedContent = this.normalizeContentPart(content);
        } else {
            normalizedContent = content;
        }

        return {
            role: role || '',
            content: normalizedContent,
            ...rest,
        };
    }

    /**
     * Normalize messages array from V5 format to standard format
     */
    private normalizeMessages(messages: any[]): Message[] {
        if (!Array.isArray(messages)) {
            return messages;
        }

        return messages.map((msg) => this.normalizeMessage(msg));
    }

    extractModel(attributes: Record<string, any>): string | undefined {
        return attributes['gen_ai.request.model'] || attributes['ai.model.id'];
    }

    extractInput(attributes: Record<string, any>): Message[] | undefined {
        // V5 uses ai.prompt.messages, but also fallback to ai.prompt for compatibility
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
        if (!Array.isArray(messages)) {
            return undefined;
        }
        
        // Normalize messages from V5 format to standard format
        return this.normalizeMessages(messages);
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
        // V5 uses 'ai.response.toolCalls' (for generation spans with tool calls)
        // Check this first as it takes precedence over individual ai.toolCall.* attributes
        if (attributes['ai.response.toolCalls'] !== undefined) {

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

        // Fallback: check for individual ai.toolCall.* attributes (for tool call execution spans)
        if (attributes['ai.toolCall.name'] !== undefined) {
            const toolCallId = attributes['ai.toolCall.id'];
            const toolName = attributes['ai.toolCall.name'];
            const argsValue = attributes['ai.toolCall.args'];
            const resultValue = attributes['ai.toolCall.result'];
            
            if (toolCallId && toolName) {
                let args: Record<string, any> = {};
                if (argsValue !== undefined) {
                    if (typeof argsValue === 'string') {
                        try {
                            args = JSON.parse(argsValue);
                        } catch {
                            // If parsing fails, treat as empty object
                            args = {};
                        }
                    } else if (typeof argsValue === 'object' && argsValue !== null) {
                        args = argsValue;
                    }
                }
                
                // Extract result - keep as string (JSON stringified) for UI compatibility
                let result: string | undefined;
                if (resultValue !== undefined) {
                    if (typeof resultValue === 'string') {
                        result = resultValue;
                    } else {
                        // If it's an object, stringify it
                        try {
                            result = JSON.stringify(resultValue);
                        } catch {
                            result = String(resultValue);
                        }
                    }
                }
                
                return [{
                    type: 'tool-call',
                    toolCallId: String(toolCallId),
                    toolName: String(toolName),
                    args,
                    result,
                }];
            }
        }

        return undefined;
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
        
        // Extract custom metadata from both prefixes
        const agentmarkCustomMetadata = extractCustomMetadata(attributes, 'agentmark.metadata.');
        const aiTelemetryCustomMetadata = extractCustomMetadata(attributes, 'ai.telemetry.metadata.');
        
        // Merge custom metadata (ai.telemetry.metadata takes precedence if both exist)
        const mergedCustomMetadata = {
            ...agentmarkCustomMetadata,
            ...aiTelemetryCustomMetadata,
        };
        
        // Merge results (ai.telemetry.metadata takes precedence if both exist)
        return {
            ...result,
            ...aiTelemetryResult,
            // Only include metadata field if there are custom metadata keys
            ...(Object.keys(mergedCustomMetadata).length > 0 ? { metadata: mergedCustomMetadata } : {}),
        };
    }
}
