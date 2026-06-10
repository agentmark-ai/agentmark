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

    // Spec replacement for the deprecated gen_ai.system attribute.
    PROVIDER_NAME: 'gen_ai.provider.name',

    // Vendor-namespaced IO keys (dual-emitted by observe()/setInput()/
    // setOutput() alongside the deprecated gen_ai.request.input /
    // gen_ai.response.output during the OTel GenAI spec migration).
    AM_REQUEST_INPUT: 'agentmark.request.input',
    AM_RESPONSE_OUTPUT: 'agentmark.response.output',

    // Standard OTel GenAI semconv content keys (spec status: Development).
    // Accepted as fallbacks so spec-conformant instrumentation routed to
    // this transformer doesn't silently lose IO data on ingest.
    // https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
    INPUT_MESSAGES: 'gen_ai.input.messages',
    OUTPUT_MESSAGES: 'gen_ai.output.messages',
    SYSTEM_INSTRUCTIONS: 'gen_ai.system_instructions',

    // Legacy (pre-1.27) OTel GenAI content keys.
    LEGACY_PROMPT: 'gen_ai.prompt',
    LEGACY_COMPLETION: 'gen_ai.completion',

    // Legacy OTel GenAI usage keys (pre input_tokens/output_tokens rename).
    USAGE_PROMPT_TOKENS: 'gen_ai.usage.prompt_tokens',
    USAGE_COMPLETION_TOKENS: 'gen_ai.usage.completion_tokens',
} as const;

/**
 * Parse a free-form serialized input value into normalized Messages.
 * Handles a JSON {role, content} messages array, or any other string
 * (wrapped as a single user message — backwards compatible).
 */
function parseLooseInput(raw: string): Message[] {
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            const isMessagesArray = parsed.every(
                (item: unknown) =>
                    item &&
                    typeof item === 'object' &&
                    'role' in item &&
                    'content' in item
            );
            if (isMessagesArray) {
                return parsed as Message[];
            }
        }
    } catch {
        // Not valid JSON — fall through to plain-text handling.
    }
    return [{ role: 'user', content: raw }];
}

/**
 * Extract text content from an OTel GenAI spec parts array
 * ({type: "text", content} | {type: "tool_call", ...} | ...).
 */
function specPartsToText(parts: any[]): string {
    return parts
        .filter((p: any) => p && p.type === 'text' && typeof p.content === 'string')
        .map((p: any) => p.content)
        .join('\n');
}

/**
 * Parse spec-shaped gen_ai.input.messages / gen_ai.output.messages
 * ({role, parts: [...]}) into normalized {role, content} Messages.
 * Returns null when the value is not a non-empty spec messages array.
 */
function parseSpecMessages(raw: string): Message[] | null {
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        const messages: Message[] = [];
        for (const msg of parsed) {
            if (!msg || !msg.role) continue;
            if (typeof msg.content === 'string') {
                messages.push({ role: msg.role, content: msg.content });
            } else if (Array.isArray(msg.parts)) {
                const text = specPartsToText(msg.parts);
                if (text) messages.push({ role: msg.role, content: text });
            }
        }
        return messages.length > 0 ? messages : null;
    } catch {
        return null;
    }
}

/**
 * Extract the text of gen_ai.system_instructions — either a plain string
 * or a JSON array of spec parts ([{type: "text", content}]).
 */
function parseSystemInstructions(raw: string): string | null {
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            const text = specPartsToText(parsed);
            return text || null;
        }
        if (typeof parsed === 'string') return parsed || null;
    } catch {
        // Not JSON — treat the raw value as the instruction text.
    }
    return raw || null;
}

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

        // Embedding operations are generations too (they have tokens/cost)
        if (operationName === OperationNames.EMBEDDINGS) {
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

        // Fallback: check for LLM-specific attributes that indicate generation.
        // gen_ai.system is deprecated in the OTel GenAI spec in favor of
        // gen_ai.provider.name — accept either.
        if (attributes[GenAIAttributes.SYSTEM] === 'anthropic' ||
            attributes[GenAIAttributes.PROVIDER_NAME] === 'anthropic') {
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

        // Token usage. The current spec keys (input_tokens / output_tokens)
        // win; the legacy prompt_tokens / completion_tokens names are
        // accepted as fallbacks for older OTel GenAI emitters.
        const inputTokens = attributes[GenAIAttributes.USAGE_INPUT_TOKENS]
            ?? attributes[GenAIAttributes.USAGE_PROMPT_TOKENS];
        const outputTokens = attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS]
            ?? attributes[GenAIAttributes.USAGE_COMPLETION_TOKENS];
        if (typeof inputTokens === 'number') {
            result.inputTokens = inputTokens;
        }
        if (typeof outputTokens === 'number') {
            result.outputTokens = outputTokens;
        }
        if (result.inputTokens !== undefined && result.outputTokens !== undefined) {
            result.totalTokens = result.inputTokens + result.outputTokens;
        }

        // Cost from agentmark.usage.cost_usd attribute
        const costUsd = attributes['agentmark.usage.cost_usd'];
        if (typeof costUsd === 'number' && costUsd > 0) {
            result.cost = costUsd;
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

        // Input. Precedence (additive — AgentMark keys always win over the
        // standard-spec fallbacks, so existing traffic is byte-identical):
        //   1. gen_ai.request.input      (deprecated AgentMark key, still emitted)
        //   2. agentmark.request.input   (vendor-namespaced replacement)
        //   3. gen_ai.input.messages     (OTel GenAI spec shape, {role, parts[]})
        //   4. gen_ai.prompt             (legacy OTel GenAI key)
        // The agentmark.input / agentmark.props fallback below also outranks
        // the spec keys (3/4) — every agentmark.* key wins over spec fallbacks.
        const requestInput = attributes[GenAIAttributes.REQUEST_INPUT]
            ?? attributes[GenAIAttributes.AM_REQUEST_INPUT];
        const hasAgentmarkInput = Boolean(
            attributes['agentmark.input'] ?? attributes['agentmark.props']
        );
        if (requestInput && typeof requestInput === 'string') {
            result.input = parseLooseInput(requestInput);
        } else if (!hasAgentmarkInput) {
            const inputMessages = attributes[GenAIAttributes.INPUT_MESSAGES];
            if (inputMessages && typeof inputMessages === 'string') {
                const messages = parseSpecMessages(inputMessages);
                if (messages) result.input = messages;
            }
            if (!result.input) {
                const legacyPrompt = attributes[GenAIAttributes.LEGACY_PROMPT];
                if (legacyPrompt && typeof legacyPrompt === 'string') {
                    result.input = parseLooseInput(legacyPrompt);
                }
            }
        }

        // gen_ai.system_instructions (OTel GenAI spec): fold into the input
        // messages as a leading system message — matching how our SDKs embed
        // the system prompt as messages[0] in gen_ai.request.input.
        const systemInstructions = attributes[GenAIAttributes.SYSTEM_INSTRUCTIONS];
        if (systemInstructions && typeof systemInstructions === 'string' && !hasAgentmarkInput) {
            const text = parseSystemInstructions(systemInstructions);
            if (text && (!result.input || result.input[0]?.role !== 'system')) {
                result.input = [{ role: 'system', content: text }, ...(result.input ?? [])];
            }
        }

        // Output. Precedence mirrors input:
        //   1. gen_ai.response.output    (deprecated AgentMark key, still emitted)
        //   2. agentmark.response.output (vendor-namespaced replacement)
        //   3. gen_ai.output.messages    (OTel GenAI spec shape)
        //   4. gen_ai.completion         (legacy OTel GenAI key)
        // The agentmark.output fallback below also outranks the spec keys.
        const responseOutput = attributes[GenAIAttributes.RESPONSE_OUTPUT]
            ?? attributes[GenAIAttributes.AM_RESPONSE_OUTPUT];
        const hasAgentmarkOutput = Boolean(attributes['agentmark.output']);
        if (responseOutput && typeof responseOutput === 'string') {
            result.output = responseOutput;
            try {
                result.outputObject = JSON.parse(responseOutput);
            } catch { /* not JSON, keep as text only */ }
        } else if (!hasAgentmarkOutput) {
            const outputMessages = attributes[GenAIAttributes.OUTPUT_MESSAGES];
            if (outputMessages && typeof outputMessages === 'string') {
                const messages = parseSpecMessages(outputMessages);
                if (messages) {
                    result.output = messages.map((m) => m.content).join('\n');
                }
            }
            if (result.output === undefined) {
                const legacyCompletion = attributes[GenAIAttributes.LEGACY_COMPLETION];
                if (legacyCompletion && typeof legacyCompletion === 'string') {
                    result.output = legacyCompletion;
                    try {
                        result.outputObject = JSON.parse(legacyCompletion);
                    } catch { /* not JSON, keep as text only */ }
                }
            }
        }

        // Fallback: agentmark.input / agentmark.output (set by SDK's set_input/set_output)
        // Also accept the legacy `agentmark.props` key as a fallback. Pre-2026-05
        // adapter wrappers set props instead of input; the OtelGenAiTransformer
        // already accepted both, this transformer didn't, which caused
        // experiment wrapper spans (emitted under the "agentmark" scope) to
        // render with empty Input panels in the trace drawer despite the
        // adapter setting the attribute. Defense-in-depth: tolerate either
        // key here so any external caller still using the legacy attribute
        // works without forcing them to migrate.
        const amInput = attributes['agentmark.input'] ?? attributes['agentmark.props'];
        if (amInput && typeof amInput === 'string' && !result.input) {
            // The WebhookRunner writes agentmark.input as a JSON messages
            // array ({role, content} pairs). Parse it so the wrapper span's
            // input renders as messages, mirroring the REQUEST_INPUT
            // handling above; anything else stays a single user message.
            let parsedMessages: Message[] | null = null;
            try {
                const parsed = JSON.parse(amInput);
                if (
                    Array.isArray(parsed) &&
                    parsed.length > 0 &&
                    parsed.every(
                        (item: unknown) =>
                            item &&
                            typeof item === 'object' &&
                            'role' in item &&
                            'content' in item
                    )
                ) {
                    parsedMessages = parsed as Message[];
                }
            } catch { /* not JSON — fall through to plain text */ }
            result.input = parsedMessages ?? [{ role: 'user', content: amInput }];
        }
        const amOutput = attributes['agentmark.output'];
        if (amOutput && typeof amOutput === 'string' && !result.output) {
            result.output = amOutput;
            try {
                result.outputObject = JSON.parse(amOutput);
            } catch { /* ignore */ }
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
