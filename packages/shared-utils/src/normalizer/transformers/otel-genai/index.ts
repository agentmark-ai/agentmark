/**
 * Transformer for the official OTel GenAI Semantic Conventions (v1.37.0+).
 *
 * Handles attribute names:
 *   gen_ai.input.messages   — JSON array of input messages ({role, parts[]})
 *   gen_ai.output.messages  — JSON array of output messages ({role, parts[], finish_reason})
 *   gen_ai.system_instructions — JSON array of system instruction parts
 *
 * Used by frameworks that follow the official spec:
 *   - Pydantic AI (scope: "pydantic-ai")
 *   - Any future OTel-compliant GenAI instrumentation
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
 */

import { NormalizedSpan, OtelSpan, ScopeTransformer, SpanType, Message, ToolCall } from '../../types';
import { parseAgentMarkAttributes } from '../../extractors/agentmark-parser';
import { parseMetadata, extractCustomMetadata } from '../../extractors/metadata-parser';

const Attrs = {
    // Standard OTel GenAI attributes
    SYSTEM: 'gen_ai.system',
    PROVIDER_NAME: 'gen_ai.provider.name',
    OPERATION_NAME: 'gen_ai.operation.name',
    REQUEST_MODEL: 'gen_ai.request.model',
    REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
    REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
    RESPONSE_ID: 'gen_ai.response.id',
    RESPONSE_MODEL: 'gen_ai.response.model',
    RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',
    USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
    USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',

    // v1.37.0+ content attributes
    INPUT_MESSAGES: 'gen_ai.input.messages',
    OUTPUT_MESSAGES: 'gen_ai.output.messages',
    SYSTEM_INSTRUCTIONS: 'gen_ai.system_instructions',
    TOOL_DEFINITIONS: 'gen_ai.tool.definitions',

    // Tool call attributes (v1.37.0+)
    TOOL_NAME: 'gen_ai.tool.name',
    TOOL_CALL_ID: 'gen_ai.tool.call.id',
    TOOL_CALL_ARGS: 'gen_ai.tool.call.arguments',
    TOOL_CALL_RESULT: 'gen_ai.tool.call.result',
} as const;

/**
 * Extract text content from a parts array.
 * OTel GenAI v1.37.0 messages use: {role, parts: [{type: "text", content: "..."}]}
 */
function partsToText(parts: any[]): string {
    return parts
        .filter((p: any) => p.type === 'text' && p.content)
        .map((p: any) => p.content)
        .join('\n');
}

/**
 * Convert OTel GenAI messages ({role, parts[]}) to normalized Messages ({role, content}).
 */
function normalizeMessages(raw: string): Message[] | null {
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;

        const messages: Message[] = [];
        for (const msg of parsed) {
            if (!msg.role) continue;
            if (msg.content && typeof msg.content === 'string') {
                // Already in {role, content} format
                messages.push(msg);
            } else if (msg.parts && Array.isArray(msg.parts)) {
                // OTel v1.37.0 format: {role, parts: [{type, content}]}
                const text = partsToText(msg.parts);
                if (text) {
                    messages.push({ role: msg.role, content: text });
                }
            }
        }
        return messages.length > 0 ? messages : null;
    } catch {
        return null;
    }
}

/**
 * Extract structured output from OTel GenAI output messages.
 * Pydantic AI structured output comes as a tool_call with name "final_result".
 */
function extractStructuredOutput(raw: string): { output: string; outputObject?: any } | null {
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;

        for (const msg of parsed) {
            for (const part of (msg.parts || [])) {
                if (part.type === 'tool_call' && part.arguments) {
                    // Structured output via tool call (e.g., final_result)
                    return {
                        output: JSON.stringify(part.arguments),
                        outputObject: part.arguments,
                    };
                }
            }
        }
        // No tool calls — check for text output
        for (const msg of parsed) {
            const text = partsToText(msg.parts || []);
            if (text) return { output: text };
        }
        return null;
    } catch {
        return null;
    }
}

export class OtelGenAiTransformer implements ScopeTransformer {

    classify(span: OtelSpan, attributes: Record<string, any>): SpanType {
        // "chat {model}" spans with usage tokens are GENERATION
        if (span.name.startsWith('chat ')) return SpanType.GENERATION;
        // "invoke_agent" or "agent run" spans are parent SPAN
        if (span.name.startsWith('invoke_agent') || span.name === 'agent run') return SpanType.SPAN;
        // "execute_tool" spans
        if (span.name.startsWith('execute_tool') || span.name.startsWith('running ')) return SpanType.SPAN;
        // Fallback: check for token usage
        if (attributes[Attrs.USAGE_INPUT_TOKENS] !== undefined) return SpanType.GENERATION;
        return SpanType.SPAN;
    }

    transform(span: OtelSpan, attributes: Record<string, any>): Partial<NormalizedSpan> {
        const result: Partial<NormalizedSpan> = {};

        // Model
        const model = attributes[Attrs.RESPONSE_MODEL] || attributes[Attrs.REQUEST_MODEL];
        if (model && typeof model === 'string') {
            result.model = model;
        }

        // Tokens
        const inputTokens = attributes[Attrs.USAGE_INPUT_TOKENS];
        const outputTokens = attributes[Attrs.USAGE_OUTPUT_TOKENS];
        if (typeof inputTokens === 'number') result.inputTokens = inputTokens;
        if (typeof outputTokens === 'number') result.outputTokens = outputTokens;
        if (result.inputTokens !== undefined && result.outputTokens !== undefined) {
            result.totalTokens = result.inputTokens + result.outputTokens;
        }

        // Finish reason
        const finishReasons = attributes[Attrs.RESPONSE_FINISH_REASONS];
        if (Array.isArray(finishReasons) && finishReasons.length > 0) {
            result.finishReason = finishReasons[0];
        }

        // Temperature
        const temperature = attributes[Attrs.REQUEST_TEMPERATURE];
        if (typeof temperature === 'number') {
            result.settings = { ...result.settings, temperature };
        }

        // Input messages (gen_ai.input.messages)
        const inputMessages = attributes[Attrs.INPUT_MESSAGES];
        if (inputMessages && typeof inputMessages === 'string') {
            const messages = normalizeMessages(inputMessages);
            if (messages) result.input = messages;
        }

        // Output messages (gen_ai.output.messages)
        const outputMessages = attributes[Attrs.OUTPUT_MESSAGES];
        if (outputMessages && typeof outputMessages === 'string') {
            const extracted = extractStructuredOutput(outputMessages);
            if (extracted) {
                result.output = extracted.output;
                if (extracted.outputObject) {
                    result.outputObject = extracted.outputObject;
                }
            }
        }

        // Pydantic AI agent run span: extract user prompt from all_messages
        // when gen_ai.input.messages is not available (agent run spans don't have it)
        const allMessages = attributes['pydantic_ai.all_messages'];
        if (allMessages && typeof allMessages === 'string' && !result.input) {
            const messages = normalizeMessages(allMessages);
            if (messages) {
                const userMessages = messages.filter(m => m.role === 'user');
                if (userMessages.length > 0) {
                    result.input = userMessages;
                }
            }
        }

        // Pydantic AI agent span: final_result attribute contains structured output
        const finalResult = attributes['final_result'];
        if (finalResult && typeof finalResult === 'string' && !result.output) {
            result.output = finalResult;
            try {
                result.outputObject = JSON.parse(finalResult);
            } catch { /* ignore */ }
        }

        // AgentMark props: the original prompt input (set by the adapter)
        // This is the semantic input that maps to the prompt's input_schema.
        const propsStr = attributes['agentmark.props'];
        if (propsStr && typeof propsStr === 'string' && !result.input) {
            try {
                const props = JSON.parse(propsStr);
                result.input = [{ role: 'user', content: JSON.stringify(props) }];
            } catch { /* ignore */ }
        }

        // AgentMark output: structured result (set by the adapter)
        const outputStr = attributes['agentmark.output'];
        if (outputStr && typeof outputStr === 'string' && !result.output) {
            result.output = outputStr;
            try {
                result.outputObject = JSON.parse(outputStr);
            } catch { /* ignore */ }
        }

        // Tool execution spans
        const toolName = attributes[Attrs.TOOL_NAME];
        if (toolName && typeof toolName === 'string') {
            result.name = toolName;
            const toolCall: ToolCall = {
                type: 'tool-call',
                toolCallId: attributes[Attrs.TOOL_CALL_ID] || '',
                toolName,
                args: {},
            };
            const toolArgs = attributes[Attrs.TOOL_CALL_ARGS];
            if (toolArgs && typeof toolArgs === 'string') {
                try { toolCall.args = JSON.parse(toolArgs); } catch { toolCall.args = { raw: toolArgs }; }
            }
            const toolResult = attributes[Attrs.TOOL_CALL_RESULT];
            if (toolResult && typeof toolResult === 'string') {
                toolCall.result = toolResult;
            }
            result.toolCalls = [toolCall];
        }

        // Parse agentmark.* attributes if present
        const agentmarkAttrs = parseAgentMarkAttributes(attributes);
        Object.assign(result, agentmarkAttrs);

        // Metadata
        const parsedMeta = parseMetadata(attributes);
        if (parsedMeta.metadata && Object.keys(parsedMeta.metadata).length > 0) {
            result.metadata = { ...result.metadata, ...parsedMeta.metadata };
        }
        const customMeta = extractCustomMetadata(attributes);
        if (Object.keys(customMeta).length > 0) {
            result.metadata = { ...result.metadata, ...customMeta };
        }

        return result;
    }

    static readonly SCOPE_NAME = 'pydantic-ai';
}
