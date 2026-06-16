/**
 * Transformer for the OpenInference semantic conventions — the instrumentation
 * standard maintained by Arize and used by ~30 auto-instrumentors (LangChain,
 * LlamaIndex, OpenAI Agents SDK, CrewAI, DSPy, Haystack, smolagents, Bedrock,
 * Anthropic, Google ADK, Instructor, MCP, Guardrails, …). Those instrumentors
 * each set their own OTel scope name, so this transformer is reached via the
 * attribute-signature dispatcher rather than a scope registration (see the
 * DispatchingTransformer).
 *
 * Span *classification* (openinference.span.kind → SpanKind) is already handled
 * by resolveSemanticKind; this transformer fills the gap that left the IO,
 * model, and token fields empty, because the default OTel-GenAI transformer only
 * reads `gen_ai.*` keys and OpenInference uses an entirely different shape.
 *
 * @see https://github.com/Arize-ai/openinference/blob/main/spec/semantic_conventions.md
 */

import { NormalizedSpan, OtelSpan, ScopeTransformer, SpanType, RetrievalDocument } from '../../types';
import {
    IndexedMessageConfig,
    parseIndexedMessages,
    extractIndexedToolCalls,
    messagesToPlainText,
    collectIndices,
} from '../../extractors/indexed-message-parser';
import { toNumber } from '../../utils/coerce';

const Attrs = {
    SPAN_KIND: 'openinference.span.kind',
    MODEL: 'llm.model_name',
    PROVIDER: 'llm.provider',
    SYSTEM: 'llm.system',
    INVOCATION_PARAMETERS: 'llm.invocation_parameters',
    TOKEN_PROMPT: 'llm.token_count.prompt',
    TOKEN_COMPLETION: 'llm.token_count.completion',
    TOKEN_TOTAL: 'llm.token_count.total',
    TOKEN_REASONING: 'llm.token_count.completion_details.reasoning',
    INPUT_VALUE: 'input.value',
    INPUT_MIME: 'input.mime_type',
    OUTPUT_VALUE: 'output.value',
    OUTPUT_MIME: 'output.mime_type',
    TOOL_NAME: 'tool.name',
    SESSION_ID: 'session.id',
    USER_ID: 'user.id',
    METADATA: 'metadata',
} as const;

const INPUT_MESSAGES: IndexedMessageConfig = {
    prefix: 'llm.input_messages',
    messageInfix: 'message.',
    contentsKey: 'contents',
    contentsPartInfix: 'message_content.',
    toolCalls: {
        arrayKey: 'tool_calls',
        infix: 'tool_call.',
        idKey: 'id',
        nameKey: 'function.name',
        argsKey: 'function.arguments',
    },
};

const OUTPUT_MESSAGES: IndexedMessageConfig = {
    ...INPUT_MESSAGES,
    prefix: 'llm.output_messages',
};

const RETRIEVAL_PREFIX = 'retrieval.documents';

/** Parse `llm.invocation_parameters` (a JSON string) into normalized settings. */
function extractSettings(attributes: Record<string, any>): NormalizedSpan['settings'] {
    const raw = attributes[Attrs.INVOCATION_PARAMETERS];
    if (raw === undefined) return undefined;
    let parsed: any;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return undefined;
        }
    } else if (typeof raw === 'object' && raw !== null) {
        parsed = raw;
    } else {
        return undefined;
    }
    if (!parsed || typeof parsed !== 'object') return undefined;

    const settings: NonNullable<NormalizedSpan['settings']> = {};
    const temperature = toNumber(parsed.temperature);
    const maxTokens = toNumber(parsed.max_tokens ?? parsed.maxTokens ?? parsed.max_completion_tokens);
    const topP = toNumber(parsed.top_p ?? parsed.topP);
    const presencePenalty = toNumber(parsed.presence_penalty ?? parsed.presencePenalty);
    const frequencyPenalty = toNumber(parsed.frequency_penalty ?? parsed.frequencyPenalty);
    if (temperature !== undefined) settings.temperature = temperature;
    if (maxTokens !== undefined) settings.maxTokens = maxTokens;
    if (topP !== undefined) settings.topP = topP;
    if (presencePenalty !== undefined) settings.presencePenalty = presencePenalty;
    if (frequencyPenalty !== undefined) settings.frequencyPenalty = frequencyPenalty;
    return Object.keys(settings).length > 0 ? settings : undefined;
}

/**
 * CHAIN / TOOL / AGENT spans carry generic IO via `input.value` / `output.value`
 * with a mime hint rather than structured messages. Honor the mime: JSON output
 * populates outputObject (+ a stringified output); text stays text.
 */
function extractGenericInput(attributes: Record<string, any>): Partial<NormalizedSpan> {
    const value = attributes[Attrs.INPUT_VALUE];
    if (value === undefined) return {};
    const mime = attributes[Attrs.INPUT_MIME];
    if (mime === 'application/json' && typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            // A JSON array of {role, content} is a messages array; anything else
            // is opaque request data, surfaced as a single user message.
            if (Array.isArray(parsed) && parsed.every((m) => m && typeof m === 'object' && 'role' in m)) {
                return { input: parsed };
            }
            return { input: [{ role: 'user', content: JSON.stringify(parsed) }] };
        } catch {
            /* fall through to raw string */
        }
    }
    return { input: [{ role: 'user', content: String(value) }] };
}

function extractGenericOutput(attributes: Record<string, any>): Partial<NormalizedSpan> {
    const value = attributes[Attrs.OUTPUT_VALUE];
    if (value === undefined) return {};
    const mime = attributes[Attrs.OUTPUT_MIME];
    if (mime === 'application/json' && typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return { output: JSON.stringify(parsed), outputObject: parsed };
        } catch {
            /* fall through to raw string */
        }
    }
    return { output: String(value) };
}

/** Parse a `metadata` attribute that may arrive as a JSON string or an object. */
function parseDocumentMetadata(raw: any): Record<string, any> | undefined {
    let parsed: any = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return undefined;
        }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return undefined;
}

/**
 * Extract retriever documents from OpenInference's flattened attributes,
 * preserving per-document id, relevance score, and metadata. Returns one
 * structured entry per `retrieval.documents.{i}.*` index that carries any field.
 */
function extractRetrievalDocuments(attributes: Record<string, any>): RetrievalDocument[] {
    const docs: RetrievalDocument[] = [];
    for (const i of collectIndices(attributes, RETRIEVAL_PREFIX)) {
        const base = `${RETRIEVAL_PREFIX}.${i}.document`;
        const doc: RetrievalDocument = {};

        const id = attributes[`${base}.id`];
        if (id !== undefined && id !== null && String(id).length > 0) doc.id = String(id);

        const content = attributes[`${base}.content`];
        if (typeof content === 'string' && content.length > 0) doc.content = content;

        const score = toNumber(attributes[`${base}.score`]);
        if (score !== undefined) doc.score = score;

        const metadata = parseDocumentMetadata(attributes[`${base}.metadata`]);
        if (metadata !== undefined) doc.metadata = metadata;

        if (Object.keys(doc).length > 0) docs.push(doc);
    }
    return docs;
}

/** Join document contents into a readable, searchable text output. */
export function retrievalDocumentsToText(documents: RetrievalDocument[]): string | undefined {
    const text = documents
        .map((d) => d.content)
        .filter((c): c is string => typeof c === 'string' && c.length > 0)
        .join('\n\n');
    return text.length > 0 ? text : undefined;
}

export class OpenInferenceTransformer implements ScopeTransformer {
    classify(_span: OtelSpan, attributes: Record<string, any>): SpanType {
        const kind = attributes[Attrs.SPAN_KIND];
        if (typeof kind === 'string' && kind.toUpperCase() === 'LLM') return SpanType.GENERATION;
        // Fallback: a span carrying token counts is a generation even if the
        // kind attribute is missing/non-standard.
        if (attributes[Attrs.TOKEN_PROMPT] !== undefined || attributes[Attrs.TOKEN_COMPLETION] !== undefined) {
            return SpanType.GENERATION;
        }
        return SpanType.SPAN;
    }

    transform(_span: OtelSpan, attributes: Record<string, any>): Partial<NormalizedSpan> {
        const result: Partial<NormalizedSpan> = {};

        // Model
        const model = attributes[Attrs.MODEL];
        if (typeof model === 'string' && model.length > 0) result.model = model;

        // Tokens
        const inputTokens = toNumber(attributes[Attrs.TOKEN_PROMPT]);
        const outputTokens = toNumber(attributes[Attrs.TOKEN_COMPLETION]);
        const totalTokens = toNumber(attributes[Attrs.TOKEN_TOTAL]);
        const reasoningTokens = toNumber(attributes[Attrs.TOKEN_REASONING]);
        if (inputTokens !== undefined) result.inputTokens = inputTokens;
        if (outputTokens !== undefined) result.outputTokens = outputTokens;
        if (totalTokens !== undefined) {
            result.totalTokens = totalTokens;
        } else if (inputTokens !== undefined && outputTokens !== undefined) {
            result.totalTokens = inputTokens + outputTokens;
        }
        if (reasoningTokens !== undefined) result.reasoningTokens = reasoningTokens;

        // Settings
        const settings = extractSettings(attributes);
        if (settings) result.settings = settings;

        // Input: structured messages first, generic input.value as fallback.
        const inputMessages = parseIndexedMessages(attributes, INPUT_MESSAGES);
        if (inputMessages) {
            result.input = inputMessages;
        } else {
            Object.assign(result, extractGenericInput(attributes));
        }

        // Output: structured messages first; tool calls always extracted.
        const outputMessages = parseIndexedMessages(attributes, OUTPUT_MESSAGES);
        const toolCalls = extractIndexedToolCalls(attributes, OUTPUT_MESSAGES);
        if (toolCalls) result.toolCalls = toolCalls;
        if (outputMessages) {
            const text = messagesToPlainText(outputMessages);
            if (text) result.output = text;
        } else {
            Object.assign(result, extractGenericOutput(attributes));
        }

        // Retrieval spans: surface documents as a structured outputObject (rich
        // per-document rendering: id / score / content / metadata) and, when no
        // other output was produced, a joined-text output (search + fallback).
        const documents = extractRetrievalDocuments(attributes);
        if (documents.length > 0) {
            if (result.outputObject === undefined) result.outputObject = { documents };
            if (result.output === undefined) {
                const text = retrievalDocumentsToText(documents);
                if (text) result.output = text;
            }
        }

        // Tool-execution spans: name the span after the tool for graph grouping.
        const toolName = attributes[Attrs.TOOL_NAME];
        if (typeof toolName === 'string' && toolName.length > 0) result.name = toolName;

        // Trace context
        const sessionId = attributes[Attrs.SESSION_ID];
        if (sessionId !== undefined) result.sessionId = String(sessionId);
        const userId = attributes[Attrs.USER_ID];
        if (userId !== undefined) result.userId = String(userId);

        // Metadata blob (JSON map of arbitrary keys)
        const metadataRaw = attributes[Attrs.METADATA];
        if (metadataRaw !== undefined) {
            let parsed: any = metadataRaw;
            if (typeof metadataRaw === 'string') {
                try {
                    parsed = JSON.parse(metadataRaw);
                } catch {
                    parsed = undefined;
                }
            }
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const metadata: Record<string, string> = {};
                for (const [k, v] of Object.entries(parsed)) {
                    metadata[k] = typeof v === 'string' ? v : JSON.stringify(v);
                }
                if (Object.keys(metadata).length > 0) result.metadata = metadata;
            }
        }

        return result;
    }
}
