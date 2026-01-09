import { NormalizedSpan, OtelSpan, ScopeTransformer, SpanType } from '../../types';

/**
 * GenAI Semantic Convention attribute names.
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
const GenAIAttributes = {
    SYSTEM: 'gen_ai.system',
    REQUEST_MODEL: 'gen_ai.request.model',
    REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
    REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
    RESPONSE_ID: 'gen_ai.response.id',
    RESPONSE_MODEL: 'gen_ai.response.model',
    RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',
    USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
    USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
    TOOL_NAME: 'gen_ai.tool.name',
    TOOL_CALL_ID: 'gen_ai.tool.call.id',
} as const;

/**
 * Standard span names from Claude Agent SDK OTEL hooks.
 */
const SpanNames = {
    SESSION: 'gen_ai.session',
    TOOL_CALL: 'gen_ai.tool.call',
    SUBAGENT: 'gen_ai.subagent',
} as const;

/**
 * Transformer for Claude Agent SDK spans emitted via OTEL hooks.
 * Handles GenAI semantic convention attributes and classifies spans
 * as SESSION, TOOL_CALL, or SUBAGENT types.
 */
export class ClaudeAgentTransformer implements ScopeTransformer {
    /**
     * Classify the span type based on span name and attributes.
     * - Session spans (gen_ai.session) → GENERATION (root LLM interaction)
     * - Tool call spans (gen_ai.tool.call *) → SPAN (tool execution)
     * - Subagent spans (gen_ai.subagent) → SPAN (nested agent)
     */
    classify(span: OtelSpan, attributes: Record<string, any>): SpanType {
        // Session spans represent the main LLM generation
        if (span.name === SpanNames.SESSION) {
            return SpanType.GENERATION;
        }

        // Tool calls and subagents are regular spans
        if (span.name.startsWith(SpanNames.TOOL_CALL) || span.name === SpanNames.SUBAGENT) {
            return SpanType.SPAN;
        }

        // Check for gen_ai.system attribute as fallback indicator
        if (attributes[GenAIAttributes.SYSTEM] === 'anthropic') {
            // If it has usage tokens, it's likely a generation
            if (attributes[GenAIAttributes.USAGE_INPUT_TOKENS] !== undefined) {
                return SpanType.GENERATION;
            }
        }

        return SpanType.SPAN;
    }

    /**
     * Transform the span and extract normalized fields from GenAI attributes.
     */
    transform(span: OtelSpan, attributes: Record<string, any>): Partial<NormalizedSpan> {
        const result: Partial<NormalizedSpan> = {};

        // Model (prefer response model over request model)
        const responseModel = attributes[GenAIAttributes.RESPONSE_MODEL];
        const requestModel = attributes[GenAIAttributes.REQUEST_MODEL];
        if (responseModel) {
            result.model = String(responseModel);
        } else if (requestModel) {
            result.model = String(requestModel);
        }

        // Token usage
        const inputTokens = attributes[GenAIAttributes.USAGE_INPUT_TOKENS];
        const outputTokens = attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS];
        if (typeof inputTokens === 'number') {
            result.inputTokens = inputTokens;
        }
        if (typeof outputTokens === 'number') {
            result.outputTokens = outputTokens;
        }
        if (result.inputTokens !== undefined && result.outputTokens !== undefined) {
            result.totalTokens = result.inputTokens + result.outputTokens;
        }

        // Finish reason (stored as JSON array per OTEL spec)
        const finishReasons = attributes[GenAIAttributes.RESPONSE_FINISH_REASONS];
        if (finishReasons) {
            try {
                const reasons = JSON.parse(finishReasons);
                if (Array.isArray(reasons) && reasons.length > 0) {
                    result.finishReason = String(reasons[0]);
                }
            } catch {
                // If not valid JSON, use as-is
                result.finishReason = String(finishReasons);
            }
        }

        // Settings from request attributes
        const maxTokens = attributes[GenAIAttributes.REQUEST_MAX_TOKENS];
        const temperature = attributes[GenAIAttributes.REQUEST_TEMPERATURE];
        if (maxTokens !== undefined || temperature !== undefined) {
            result.settings = {};
            if (typeof maxTokens === 'number') {
                result.settings.maxTokens = maxTokens;
            }
            if (typeof temperature === 'number') {
                result.settings.temperature = temperature;
            }
        }

        // Tool call spans: override name with tool name for better grouping
        const toolName = attributes[GenAIAttributes.TOOL_NAME];
        if (toolName && typeof toolName === 'string') {
            result.name = toolName;
        }

        return result;
    }
}

/**
 * Detects if a span is from Claude Agent SDK OTEL hooks based on attributes.
 * This is more specific than just checking for agentmark.* attributes,
 * since those can also be set by AI SDK telemetry metadata.
 *
 * Detection criteria (must have BOTH):
 * 1. gen_ai.system = "anthropic"
 * 2. One of our specific AgentMark attributes: agentmark.prompt_name, agentmark.function_id, or agentmark.subagent_type
 */
export function isClaudeAgentSpan(attributes: Record<string, any>): boolean {
    // Must have gen_ai.system = "anthropic"
    if (attributes[GenAIAttributes.SYSTEM] !== 'anthropic') {
        return false;
    }

    // Must have one of our specific AgentMark attributes (not just any agentmark.* attribute)
    // These are set specifically by our OTEL hooks, not by AI SDK metadata
    const hasClaudeAgentAttrs =
        attributes['agentmark.prompt_name'] !== undefined ||
        attributes['agentmark.function_id'] !== undefined ||
        attributes['agentmark.subagent_type'] !== undefined;

    return hasClaudeAgentAttrs;
}
