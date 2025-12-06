export enum SpanType {
    SPAN = 'SPAN',
    GENERATION = 'GENERATION',
    EVENT = 'EVENT',
}

/**
 * Standard message content part types
 */
export interface StandardTextContent {
    type: 'text';
    text: string;
}

export interface StandardToolCallContent {
    type: 'tool-call';
    toolCallId: string;
    toolName: string;
    args: Record<string, any>;  // Normalized field name (V4 uses 'args', V5 uses 'input' -> normalized to 'args')
}

export interface StandardToolResultContent {
    type: 'tool-result';
    toolCallId: string;
    toolName: string;
    result: any;  // Normalized field name (V4 uses 'result', V5 uses 'output.value' -> normalized to 'result')
}

export type StandardMessageContent = 
    | StandardTextContent 
    | StandardToolCallContent 
    | StandardToolResultContent
    | string;  // Plain string content

/**
 * Standard message type used throughout the normalizer.
 * Messages are normalized from V4/V5 formats to this standard format.
 * 
 * Content can be:
 * - A plain string
 * - An array of content parts (text, tool-call, tool-result)
 */
export interface Message {
    role: string;
    content: StandardMessageContent | StandardMessageContent[];
}

export interface ToolCall {
    type: string;  // e.g., "tool-call"
    toolCallId: string;
    toolName: string;
    args: Record<string, any>;  // Unified: v4 uses 'args', v5 uses 'input' (normalized to 'args')
    result?: string;  // Tool execution result (JSON string for tool call execution spans)
    providerMetadata?: Record<string, any>;  // v5 specific: provider-specific metadata
}

export interface OtelScope {
    name?: string;
    version?: string;
}

export interface OtelResource {
    attributes?: Record<string, any>;
}

export interface OtelEvent {
    timeUnixNano: string;
    name: string;
    attributes?: Record<string, any>;
}

export interface OtelLink {
    traceId: string;
    spanId: string;
    traceState?: string;
    attributes?: Record<string, any>;
}

export interface OtelSpan {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    traceState?: string;
    name: string;
    kind: number;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    attributes?: Record<string, any>;
    events?: OtelEvent[];
    links?: OtelLink[];
    status?: {
        code: number;
        message?: string;
    };
}

export interface NormalizedSpan {
    // Identity
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    traceState?: string;

    // Core type and classification
    type: SpanType;

    // Timing
    startTime: number; // Unix timestamp in milliseconds
    endTime?: number; // Unix timestamp in milliseconds
    duration: number; // Duration in milliseconds

    // Span metadata
    name: string;
    kind: string;
    serviceName?: string;
    statusCode: string;
    statusMessage?: string;

    // Normalized LLM generation fields
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;  // Add reasoning tokens
    cost?: number;

    // I/O fields
    input?: Message[];  // Array of messages passed to the model
    output?: string;     // Plain text or JSON-stringified structured data
    outputObject?: Record<string, any>;  // Structured object output (separate from text)
    toolCalls?: ToolCall[];  // Tool calls from the response
    finishReason?: string;  // Unified finish reason (stop, tool-calls, length, etc.)
    settings?: {  // Model generation settings
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        presencePenalty?: number;
        frequencyPenalty?: number;
    };

    // Trace context fields
    sessionId?: string;
    sessionName?: string;
    userId?: string;
    traceName?: string;

    // Dataset/evaluation fields
    datasetRunId?: string;
    datasetRunName?: string;
    datasetPath?: string;
    datasetItemName?: string;
    datasetExpectedOutput?: string;

    // Prompt fields
    promptName?: string;
    props?: string;         // Props/metadata from ai.telemetry.metadata.props

    // Version control field
    commitSha?: string;

    // Custom metadata fields (keys from metadata prefixes that don't map to known fields)
    metadata?: Record<string, string>;

    // Raw data for export/debug
    resourceAttributes: Record<string, any>;
    spanAttributes: Record<string, any>;
    events: Array<{ timestamp: number; name: string; attributes: Record<string, any> }>;
    links: Array<{ traceId: string; spanId: string; traceState?: string; attributes?: Record<string, any> }>;
}

export interface AttributeExtractor {
    extractModel(attributes: Record<string, any>): string | undefined;
    extractInput(attributes: Record<string, any>): Message[] | undefined;
    extractOutput(attributes: Record<string, any>): string | undefined;
    extractTokens(attributes: Record<string, any>): { input?: number; output?: number; total?: number; reasoning?: number };
    extractMetadata(attributes: Record<string, any>): Partial<NormalizedSpan>;
    extractToolCalls(attributes: Record<string, any>): ToolCall[] | undefined;
    extractOutputObject(attributes: Record<string, any>): Record<string, any> | undefined;
    extractFinishReason(attributes: Record<string, any>): string | undefined;
    extractSettings(attributes: Record<string, any>): NormalizedSpan['settings'];
}

export interface ScopeTransformer {
    // Classify the span type based on span and attributes
    classify(span: OtelSpan, attributes: Record<string, any>): SpanType;
    
    // Transform the span and extract normalized fields
    transform(span: OtelSpan, attributes: Record<string, any>): Partial<NormalizedSpan>;
}
