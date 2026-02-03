import { NormalizedSpan, OtelSpan, ScopeTransformer, SpanType, Message, ToolCall } from '../../types';
import { parseAgentMarkAttributes } from '../../extractors/agentmark-parser';
import { parseMetadata, extractCustomMetadata } from '../../extractors/metadata-parser';

/**
 * GenAI Semantic Convention attribute names.
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
const GenAIAttributes = {
    SYSTEM: 'gen_ai.system',
    OPERATION_NAME: 'gen_ai.operation.name',
    REQUEST_MODEL: 'gen_ai.request.model',
    REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
    REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
    REQUEST_INPUT: 'gen_ai.request.input',
    RESPONSE_ID: 'gen_ai.response.id',
    RESPONSE_MODEL: 'gen_ai.response.model',
    RESPONSE_OUTPUT: 'gen_ai.response.output',
    RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',
    USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
    USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
    TOOL_NAME: 'gen_ai.tool.name',
    TOOL_CALL_ID: 'gen_ai.tool.call.id',
    TOOL_INPUT: 'gen_ai.tool.input',
    TOOL_OUTPUT: 'gen_ai.tool.output',
} as const;

/**
 * Standard span names following OpenTelemetry GenAI semantic conventions.
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
 *
 * Span naming convention: `{operation_name}` or `{operation_name} {target}`
 * - chat / chat {model} - LLM chat completion (GENERATION)
 * - execute_tool / execute_tool {tool_name} - Tool execution (SPAN)
 * - invoke_agent / invoke_agent {agent_name} - Agent invocation (SPAN)
 */
const SpanNames = {
    // OTEL GenAI standard operation names (these can be followed by model/tool/agent name)
    CHAT: 'chat',
    EXECUTE_TOOL: 'execute_tool',
    INVOKE_AGENT: 'invoke_agent',

    // Legacy span names (for backwards compatibility)
    SESSION: 'gen_ai.session',
    TOOL_CALL: 'gen_ai.tool.call',
    SUBAGENT: 'gen_ai.subagent',
    CONVERSATION: 'gen_ai.conversation',
    LLM_TURN: 'gen_ai.llm.turn',
} as const;

/**
 * Operation names per OTEL GenAI semantic conventions.
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
 */
const OperationNames = {
    CHAT: 'chat',
    EMBEDDINGS: 'embeddings',
    TEXT_COMPLETION: 'text_completion',
    GENERATE_CONTENT: 'generate_content',
    EXECUTE_TOOL: 'execute_tool',
    CREATE_AGENT: 'create_agent',
    INVOKE_AGENT: 'invoke_agent',
} as const;

/**
 * Transformer for AgentMark spans emitted via OTEL.
 * Handles GenAI semantic convention attributes and classifies spans.
 *
 * Classification rules (per OTEL GenAI conventions):
 * - GENERATION: Spans that represent actual LLM API calls (chat, text_completion)
 * - SPAN: All other spans (tool execution, agent invocation, grouping spans)
 *
 * Only spans that send requests to the LLM should be GENERATION type.
 * Wrapper/grouping spans like conversations are regular SPAN type.
 */
export class AgentMarkTransformer implements ScopeTransformer {
    /**
     * Classify the span type based on span name and attributes.
     *
     * GENERATION type (actual LLM calls):
     * - Spans starting with "chat " (OTEL convention)
     * - gen_ai.llm.turn spans (legacy traced module)
     * - gen_ai.session spans (legacy hooks) - these wrap LLM calls
     * - Spans with gen_ai.operation.name = "chat" or "text_completion"
     *
     * SPAN type (everything else):
     * - gen_ai.conversation (grouping span)
     * - execute_tool / gen_ai.tool.call (tool execution)
     * - invoke_agent / gen_ai.subagent (agent invocation)
     */
    classify(span: OtelSpan, attributes: Record<string, any>): SpanType {
        const operationName = attributes[GenAIAttributes.OPERATION_NAME];

        // Check operation name first (OTEL standard)
        if (operationName === OperationNames.CHAT || operationName === OperationNames.TEXT_COMPLETION) {
            return SpanType.GENERATION;
        }

        // OTEL convention: "chat" or "chat {model}" format
        if (span.name === SpanNames.CHAT || span.name.startsWith(SpanNames.CHAT + ' ')) {
            return SpanType.GENERATION;
        }

        // LLM turn spans represent actual LLM responses (GENERATION) - legacy
        if (span.name === SpanNames.LLM_TURN) {
            return SpanType.GENERATION;
        }

        // Legacy session spans (these wrapped LLM interactions)
        if (span.name === SpanNames.SESSION) {
            return SpanType.GENERATION;
        }

        // Tool calls are not LLM generations (execute_tool or execute_tool {name})
        if (span.name === SpanNames.EXECUTE_TOOL ||
            span.name.startsWith(SpanNames.EXECUTE_TOOL + ' ') ||
            span.name.startsWith(SpanNames.TOOL_CALL)) {
            return SpanType.SPAN;
        }

        // Agent invocations are not direct LLM calls (invoke_agent or invoke_agent {name})
        if (span.name === SpanNames.INVOKE_AGENT ||
            span.name.startsWith(SpanNames.INVOKE_AGENT + ' ')) {
            return SpanType.SPAN;
        }

        // Legacy conversation/subagent spans are grouping spans, not LLM calls
        if (span.name === SpanNames.CONVERSATION || span.name === SpanNames.SUBAGENT) {
            return SpanType.SPAN;
        }

        // Fallback: check for LLM-specific attributes that indicate generation
        if (attributes[GenAIAttributes.SYSTEM] === 'anthropic') {
            // Has usage tokens AND response output = likely an LLM generation
            if (attributes[GenAIAttributes.USAGE_INPUT_TOKENS] !== undefined &&
                attributes[GenAIAttributes.RESPONSE_OUTPUT] !== undefined) {
                return SpanType.GENERATION;
            }
        }

        return SpanType.SPAN;
    }

    /**
     * Transform the span and extract normalized fields from GenAI attributes.
     */
    transform(_span: OtelSpan, attributes: Record<string, any>): Partial<NormalizedSpan> {
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

        // Input/Output
        const requestInput = attributes[GenAIAttributes.REQUEST_INPUT];
        if (requestInput && typeof requestInput === 'string') {
            // Try to parse as JSON messages array first (new format from traced wrapper)
            try {
                const parsed = JSON.parse(requestInput);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    // Validate it looks like a messages array
                    const isMessagesArray = parsed.every(
                        (item: unknown) =>
                            item &&
                            typeof item === 'object' &&
                            'role' in item &&
                            'content' in item
                    );
                    if (isMessagesArray) {
                        result.input = parsed as Message[];
                    } else {
                        // Not a messages array, treat as plain text
                        result.input = [{ role: 'user', content: requestInput }];
                    }
                } else {
                    // Empty array or not an array, treat as plain text
                    result.input = [{ role: 'user', content: requestInput }];
                }
            } catch {
                // Not valid JSON, treat as plain text (backwards compatibility)
                result.input = [{ role: 'user', content: requestInput }];
            }
        }

        const responseOutput = attributes[GenAIAttributes.RESPONSE_OUTPUT];
        if (responseOutput && typeof responseOutput === 'string') {
            result.output = responseOutput;
        }

        // Tool call spans: extract tool info
        const toolName = attributes[GenAIAttributes.TOOL_NAME];
        const toolCallId = attributes[GenAIAttributes.TOOL_CALL_ID];
        const toolInput = attributes[GenAIAttributes.TOOL_INPUT];
        const toolOutput = attributes[GenAIAttributes.TOOL_OUTPUT];

        if (toolName && typeof toolName === 'string') {
            // Override name with tool name for better grouping
            result.name = toolName;

            // Build tool call info
            const toolCall: ToolCall = {
                type: 'tool-call',
                toolCallId: typeof toolCallId === 'string' ? toolCallId : '',
                toolName: toolName,
                args: {},
            };

            // Parse tool input (JSON string)
            if (toolInput && typeof toolInput === 'string') {
                try {
                    toolCall.args = JSON.parse(toolInput);
                } catch {
                    // If not valid JSON, store as raw value
                    toolCall.args = { raw: toolInput };
                }
            }

            // Parse tool output (JSON string)
            if (toolOutput && typeof toolOutput === 'string') {
                toolCall.result = toolOutput;
            }

            result.toolCalls = [toolCall];
        }

        // Extract agentmark-specific attributes (prompt_name, props, session_id, etc.)
        // First extract from agentmark.* prefix (direct attributes)
        const agentmarkAttrs = parseAgentMarkAttributes(attributes);

        // Also extract from agentmark.metadata.* prefix (for custom metadata passed via telemetry)
        const metadataAttrs = parseMetadata(attributes, 'agentmark.metadata.');

        // Extract custom metadata keys (anything not in known fields)
        const customMetadata = extractCustomMetadata(attributes, 'agentmark.metadata.');

        return {
            ...result,
            ...metadataAttrs,      // agentmark.metadata.* values (lower priority)
            ...agentmarkAttrs,     // agentmark.* values (higher priority)
            // Only include metadata field if there are custom metadata keys
            ...(Object.keys(customMetadata).length > 0 ? { metadata: customMetadata } : {}),
        };
    }
}

/**
 * The scope name used by AgentMark's OTEL tracer.
 * Used by the registry to route spans to this transformer.
 */
export const AGENTMARK_SCOPE_NAME = 'agentmark';

// Backwards compatibility export
export { AgentMarkTransformer as ClaudeAgentTransformer };
