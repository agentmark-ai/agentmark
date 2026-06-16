/**
 * Transformer for the OpenLLMetry / Traceloop conventions (which OpenLIT also
 * largely follows). These instrumentors back the AutoGen, Semantic Kernel, and
 * Agno integrations, among others. Like OpenInference, each emits its own OTel
 * scope name, so this transformer is reached via the attribute-signature
 * dispatcher rather than a scope registration.
 *
 * Tokens and model already partly resolve through the default OTel-GenAI
 * transformer's legacy `gen_ai.usage.prompt_tokens` fallbacks; the gap this
 * closes is the IO, which OpenLLMetry flattens into indexed
 * `gen_ai.prompt.{i}.*` / `gen_ai.completion.{i}.*` attributes (and, for
 * workflow/task spans, `traceloop.entity.input/output`) rather than the
 * `gen_ai.input.messages` JSON array the default transformer expects.
 *
 * @see https://www.traceloop.com/docs/openllmetry/privacy/traces
 */

import { NormalizedSpan, OtelSpan, ScopeTransformer, SpanType, Message, RetrievalDocument } from '../../types';
import { parseTokens } from '../../extractors/token-parser';
import {
    IndexedMessageConfig,
    parseIndexedMessages,
    extractIndexedToolCalls,
    messagesToPlainText,
} from '../../extractors/indexed-message-parser';
import { toNumber } from '../../utils/coerce';

const Attrs = {
    SPAN_KIND: 'traceloop.span.kind',
    REQUEST_MODEL: 'gen_ai.request.model',
    RESPONSE_MODEL: 'gen_ai.response.model',
    REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
    REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
    REQUEST_TOP_P: 'gen_ai.request.top_p',
    REQUEST_PRESENCE_PENALTY: 'gen_ai.request.presence_penalty',
    REQUEST_FREQUENCY_PENALTY: 'gen_ai.request.frequency_penalty',
    RESPONSE_FINISH_REASON: 'gen_ai.response.finish_reason',
    TOTAL_TOKENS_ALT: 'llm.usage.total_tokens',
    ENTITY_INPUT: 'traceloop.entity.input',
    ENTITY_OUTPUT: 'traceloop.entity.output',
    ENTITY_NAME: 'traceloop.entity.name',
    ASSOCIATION_PREFIX: 'traceloop.association.properties.',
} as const;

const PROMPT_MESSAGES: IndexedMessageConfig = {
    prefix: 'gen_ai.prompt',
    messageInfix: '',
    toolCalls: { arrayKey: 'tool_calls', infix: '', idKey: 'id', nameKey: 'name', argsKey: 'arguments' },
};

const COMPLETION_MESSAGES: IndexedMessageConfig = {
    ...PROMPT_MESSAGES,
    prefix: 'gen_ai.completion',
};

function extractSettings(attributes: Record<string, any>): NormalizedSpan['settings'] {
    const settings: NonNullable<NormalizedSpan['settings']> = {};
    const temperature = toNumber(attributes[Attrs.REQUEST_TEMPERATURE]);
    const maxTokens = toNumber(attributes[Attrs.REQUEST_MAX_TOKENS]);
    const topP = toNumber(attributes[Attrs.REQUEST_TOP_P]);
    const presencePenalty = toNumber(attributes[Attrs.REQUEST_PRESENCE_PENALTY]);
    const frequencyPenalty = toNumber(attributes[Attrs.REQUEST_FREQUENCY_PENALTY]);
    if (temperature !== undefined) settings.temperature = temperature;
    if (maxTokens !== undefined) settings.maxTokens = maxTokens;
    if (topP !== undefined) settings.topP = topP;
    if (presencePenalty !== undefined) settings.presencePenalty = presencePenalty;
    if (frequencyPenalty !== undefined) settings.frequencyPenalty = frequencyPenalty;
    return Object.keys(settings).length > 0 ? settings : undefined;
}

/**
 * Workflow / task spans carry IO as `traceloop.entity.input` /
 * `traceloop.entity.output` JSON strings rather than chat messages. Surface the
 * input as a single user message and the output as text (+ outputObject when the
 * payload is a JSON object).
 */
function extractEntityInput(attributes: Record<string, any>): Message[] | undefined {
    const raw = attributes[Attrs.ENTITY_INPUT];
    if (raw === undefined) return undefined;
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    return [{ role: 'user', content: text }];
}

function extractEntityOutput(attributes: Record<string, any>): Partial<NormalizedSpan> {
    const raw = attributes[Attrs.ENTITY_OUTPUT];
    if (raw === undefined) return {};
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return { output: raw, outputObject: parsed };
            }
        } catch {
            /* plain text */
        }
        return { output: raw };
    }
    const result: Partial<NormalizedSpan> = { output: JSON.stringify(raw) };
    if (typeof raw === 'object' && raw !== null) result.outputObject = raw as Record<string, any>;
    return result;
}

/**
 * Best-effort fallback for emitters (notably OpenLIT) that record prompt /
 * completion content in span *events* instead of attributes. Reads the first
 * event attribute holding `gen_ai.prompt` / `gen_ai.completion` content.
 */
function extractFromEvents(
    events: OtelSpan['events'],
    attrKey: string,
): string | undefined {
    if (!events) return undefined;
    for (const event of events) {
        const value = event.attributes?.[attrKey] ?? event.attributes?.['content'];
        if (typeof value === 'string' && value.length > 0) return value;
    }
    return undefined;
}

/** Parse a result-event `metadata` value that may be a JSON string or object. */
function parseResultMetadata(raw: any): Record<string, any> | undefined {
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

const VECTOR_RESULT_EVENT_NAMES = new Set(['db.query.result', 'db.search.result']);

/**
 * Vector-store instrumentation (Pinecone, Chroma, Marqo, Milvus, …) records one
 * span EVENT per returned match — named `db.query.result` / `db.search.result`
 * — carrying that match's id, relevance score OR vector distance, content
 * (`document`), and metadata. Stores differ in which fields they populate AND in
 * the attribute prefix (Chroma → `db.query.result.{distance,document,metadata}`;
 * Milvus → `db.search.result.{distance,entity}`), so both prefixes and both
 * score/distance are honored. Milvus packs the matched row (content + user
 * fields) into a single `entity` value — recovered into metadata so nothing is
 * lost, since we can't reliably know which entity field is the "content".
 * Returns matches in event (rank) order as structured RetrievalDocuments.
 *
 * Verified live against real Traceloop instrumentation for Chroma (full) and
 * Milvus (`entity` recovery); Qdrant/LanceDB/Weaviate instrumentors emit no
 * per-match result data at all, so those spans classify as retrieval but carry
 * no documents (nothing to extract).
 */
function extractVectorResultDocuments(events: OtelSpan['events']): RetrievalDocument[] {
    if (!events) return [];
    const docs: RetrievalDocument[] = [];
    for (const event of events) {
        if (!VECTOR_RESULT_EVENT_NAMES.has(event.name)) continue;
        const a = event.attributes ?? {};
        const get = (field: string) =>
            a[`db.query.result.${field}`] ?? a[`db.search.result.${field}`];

        const doc: RetrievalDocument = {};
        const id = get('id');
        if (id !== undefined && id !== null && String(id).length > 0) doc.id = String(id);
        const content = get('document');
        if (typeof content === 'string' && content.length > 0) doc.content = content;
        const score = toNumber(get('score'));
        if (score !== undefined) doc.score = score;
        const distance = toNumber(get('distance'));
        if (distance !== undefined) doc.distance = distance;

        let metadata = parseResultMetadata(get('metadata'));
        // Milvus carries the matched row in `entity` rather than `metadata`; it
        // may be JSON or a Python-repr dict string. Parse what we can, else keep
        // the raw value so the content/fields stay visible in the UI.
        if (metadata === undefined) {
            const entity = get('entity');
            if (entity !== undefined && entity !== null && String(entity).length > 0) {
                metadata = parseResultMetadata(entity) ?? { entity: String(entity) };
            }
        }
        if (metadata !== undefined) doc.metadata = metadata;

        if (Object.keys(doc).length > 0) docs.push(doc);
    }
    return docs;
}

function extractFinishReason(attributes: Record<string, any>): string | undefined {
    const direct = attributes[Attrs.RESPONSE_FINISH_REASON];
    if (direct !== undefined) {
        return Array.isArray(direct) ? String(direct[0]) : String(direct);
    }
    const indexed = attributes['gen_ai.completion.0.finish_reason'];
    if (indexed !== undefined) return String(indexed);
    return undefined;
}

export class OpenLLMetryTransformer implements ScopeTransformer {
    classify(_span: OtelSpan, attributes: Record<string, any>): SpanType {
        const kind = attributes[Attrs.SPAN_KIND];
        if (typeof kind === 'string' && kind.toUpperCase() === 'LLM') return SpanType.GENERATION;
        if (
            attributes['gen_ai.usage.prompt_tokens'] !== undefined ||
            attributes['gen_ai.usage.completion_tokens'] !== undefined ||
            attributes['gen_ai.usage.input_tokens'] !== undefined
        ) {
            return SpanType.GENERATION;
        }
        return SpanType.SPAN;
    }

    transform(span: OtelSpan, attributes: Record<string, any>): Partial<NormalizedSpan> {
        const result: Partial<NormalizedSpan> = {};

        // Model (response model preferred, request model fallback)
        const model = attributes[Attrs.RESPONSE_MODEL] ?? attributes[Attrs.REQUEST_MODEL];
        if (typeof model === 'string' && model.length > 0) result.model = model;

        // Tokens — current spec keys with legacy prompt/completion fallbacks.
        const tokens = parseTokens(attributes, {
            inputKey: 'gen_ai.usage.input_tokens',
            outputKey: 'gen_ai.usage.output_tokens',
            totalKey: 'gen_ai.usage.total_tokens',
            promptKey: 'gen_ai.usage.prompt_tokens',
            completionKey: 'gen_ai.usage.completion_tokens',
        });
        if (tokens.inputTokens !== undefined) result.inputTokens = tokens.inputTokens;
        if (tokens.outputTokens !== undefined) result.outputTokens = tokens.outputTokens;
        if (tokens.totalTokens !== undefined) {
            result.totalTokens = tokens.totalTokens;
        } else {
            const altTotal = toNumber(attributes[Attrs.TOTAL_TOKENS_ALT]);
            if (altTotal !== undefined) result.totalTokens = altTotal;
        }

        // Settings
        const settings = extractSettings(attributes);
        if (settings) result.settings = settings;

        // Finish reason
        const finishReason = extractFinishReason(attributes);
        if (finishReason) result.finishReason = finishReason;

        // Input: indexed prompt messages → entity input → event content.
        const promptMessages = parseIndexedMessages(attributes, PROMPT_MESSAGES);
        if (promptMessages) {
            result.input = promptMessages;
        } else {
            const entityInput = extractEntityInput(attributes);
            if (entityInput) {
                result.input = entityInput;
            } else {
                const eventPrompt = extractFromEvents(span.events, 'gen_ai.prompt');
                if (eventPrompt) result.input = [{ role: 'user', content: eventPrompt }];
            }
        }

        // Output: indexed completion messages → entity output → event content.
        const completionMessages = parseIndexedMessages(attributes, COMPLETION_MESSAGES);
        const toolCalls = extractIndexedToolCalls(attributes, COMPLETION_MESSAGES);
        if (toolCalls) result.toolCalls = toolCalls;
        if (completionMessages) {
            const text = messagesToPlainText(completionMessages);
            if (text) result.output = text;
        } else {
            const entityOutput = extractEntityOutput(attributes);
            if (entityOutput.output !== undefined) {
                Object.assign(result, entityOutput);
            } else {
                const eventCompletion = extractFromEvents(span.events, 'gen_ai.completion');
                if (eventCompletion) result.output = eventCompletion;
            }
        }

        // Vector-store query spans: results arrive as `db.query.result` span
        // events (one per match). Surface them as a structured outputObject for
        // the ranked-documents panel, plus joined text for search/fallback.
        if (result.outputObject === undefined) {
            const documents = extractVectorResultDocuments(span.events);
            if (documents.length > 0) {
                result.outputObject = { documents };
                if (result.output === undefined) {
                    const text = documents
                        .map((d) => d.content)
                        .filter((c): c is string => typeof c === 'string' && c.length > 0)
                        .join('\n\n');
                    if (text) result.output = text;
                }
            }
        }

        // Workflow/task entity name → trace name
        const entityName = attributes[Attrs.ENTITY_NAME];
        if (typeof entityName === 'string' && entityName.length > 0) result.traceName = entityName;

        // Association properties → session/user/metadata
        const metadata: Record<string, string> = {};
        for (const [key, value] of Object.entries(attributes)) {
            if (!key.startsWith(Attrs.ASSOCIATION_PREFIX)) continue;
            const prop = key.slice(Attrs.ASSOCIATION_PREFIX.length);
            if (prop === 'session_id') {
                result.sessionId = String(value);
            } else if (prop === 'user_id') {
                result.userId = String(value);
            } else if (prop) {
                metadata[prop] = typeof value === 'string' ? value : JSON.stringify(value);
            }
        }
        if (Object.keys(metadata).length > 0) result.metadata = metadata;

        return result;
    }
}
