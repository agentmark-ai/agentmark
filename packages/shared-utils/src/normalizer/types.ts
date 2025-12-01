export enum SpanType {
    SPAN = 'SPAN',
    GENERATION = 'GENERATION',
    EVENT = 'EVENT',
}

export interface Message {
    role: string;
    content: string | Array<{ type: string; text: string }>;
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

    // Prompt/template fields
    promptName?: string;
    templateName?: string;  // Template name from ai.telemetry.metadata.templateName
    props?: string;         // Props/metadata from ai.telemetry.metadata.props

    // Version control field
    commitSha?: string;

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
}

export interface ScopeTransformer {
    // Classify the span type based on span and attributes
    classify(span: OtelSpan, attributes: Record<string, any>): SpanType;
    
    // Transform the span and extract normalized fields
    transform(span: OtelSpan, attributes: Record<string, any>): Partial<NormalizedSpan>;
}
