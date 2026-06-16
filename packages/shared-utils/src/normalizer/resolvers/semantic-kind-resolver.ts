import { NormalizedSpan, SpanType } from '../types';

/** Valid semantic kind values. */
export const SEMANTIC_KINDS = ['function', 'llm', 'tool', 'agent', 'retrieval', 'embedding', 'guardrail'] as const;
export type SemanticKind = typeof SEMANTIC_KINDS[number];

const VALID_KINDS = new Set<string>(SEMANTIC_KINDS);

/** OpenInference span.kind → AgentMark semantic kind. */
const OPENINFERENCE_MAP: Record<string, SemanticKind> = {
    'CHAIN': 'function',
    'LLM': 'llm',
    'TOOL': 'tool',
    'AGENT': 'agent',
    'RETRIEVER': 'retrieval',
    'EMBEDDING': 'embedding',
    'GUARDRAIL': 'guardrail',
    'RERANKER': 'retrieval',
};

/**
 * Vector-store `db.system` values (lowercased) that OpenLLMetry / OTel emit.
 * A query against one of these is a retrieval, not a plain SQL query — the
 * casing varies by instrumentor (Pinecone="Pinecone", chroma="chroma"), so we
 * compare lowercased.
 */
const VECTOR_DB_SYSTEMS = new Set<string>([
    'pinecone',
    'qdrant',
    'weaviate',
    'milvus',
    'chroma',
    'chromadb',
    'marqo',
    'lancedb',
]);

/** Span events that carry per-match vector-store results (OpenLLMetry). */
const VECTOR_RESULT_EVENT_NAMES = new Set<string>(['db.query.result', 'db.search.result']);

/**
 * True when a span looks like a vector-store query: a recognized vector-DB
 * `db.system`, any `db.vector.query.*` attribute, or `db.query.result` /
 * `db.search.result` events. Distinguishes a vector search from a plain SQL
 * query (which carries none of these). Shared by the semantic-kind resolver
 * (→ classifies as "retrieval") and the dispatching transformer (→ routes to
 * the OpenLLMetry extractor so the result events become documents).
 */
export function hasVectorStoreSignature(
    attributes: Record<string, any>,
    events?: ReadonlyArray<{ name: string }>,
): boolean {
    const dbSystem = attributes['db.system'] ?? attributes['db.system.name'];
    if (typeof dbSystem === 'string' && VECTOR_DB_SYSTEMS.has(dbSystem.toLowerCase())) return true;
    if (Object.keys(attributes).some((k) => k.startsWith('db.vector.query.'))) return true;
    if (events?.some((e) => VECTOR_RESULT_EVENT_NAMES.has(e.name))) return true;
    return false;
}

/** Framework-specific attribute mappings (checked in order). */
const FRAMEWORK_MAPPINGS: Array<{ key: string; map: Record<string, SemanticKind> }> = [
    {
        key: 'ai.operationId', // Vercel AI SDK
        // The AI SDK emits ai.operationId WITH the "ai." prefix (e.g.
        // "ai.generateText"); accept both prefixed and unprefixed so generation
        // wrappers resolve to "llm" instead of falling through to "function".
        map: {
            'embed': 'embedding',
            'ai.embed': 'embedding',
            'generateText': 'llm',
            'ai.generateText': 'llm',
            'streamText': 'llm',
            'ai.streamText': 'llm',
            'generateObject': 'llm',
            'ai.generateObject': 'llm',
            'streamObject': 'llm',
            'ai.streamObject': 'llm',
        },
    },
    {
        key: 'traceloop.span.kind', // Traceloop / OpenLLMetry
        map: { 'LLM': 'llm', 'TOOL': 'tool', 'AGENT': 'agent', 'WORKFLOW': 'function', 'TASK': 'function' },
    },
    {
        key: 'langchain.run_type', // LangChain via OTLP
        map: { 'llm': 'llm', 'chat_model': 'llm', 'retriever': 'retrieval', 'tool': 'tool', 'chain': 'function', 'embedding': 'embedding' },
    },
    {
        key: 'genkit:type', // Firebase Genkit
        map: { 'model': 'llm', 'tool': 'tool', 'flow': 'function', 'retriever': 'retrieval', 'embedder': 'embedding' },
    },
];

/**
 * Resolve the semantic kind of a span using a 9-level priority chain.
 *
 * Priority:
 * 1. normalized.semanticKind (from agentmark.span.kind attribute) — if valid
 * 2. openinference.span.kind attribute
 * 3. Framework-specific attributes (Vercel AI SDK, Traceloop, LangChain, Genkit)
 * 4. gen_ai.operation.name → llm/embedding
 * 5. Type = GENERATION → llm
 * 6. Carries a model (gen_ai.request.model) → llm — vendor-neutral generation
 *    signal; catches model calls the framework maps above don't name.
 * 7. Has non-empty ToolCalls → tool
 * 8. Name-based heuristics
 * 9. Default → function
 */
export function resolveSemanticKind(
    normalized: Partial<NormalizedSpan> & { type: SpanType; name: string },
    allAttributes: Record<string, any>,
): SemanticKind {
    // 1. Explicit agentmark.span.kind (already parsed into semanticKind)
    if (normalized.semanticKind && VALID_KINDS.has(normalized.semanticKind)) {
        return normalized.semanticKind as SemanticKind;
    }

    // 2. OpenInference span.kind attribute
    const oiKind = allAttributes['openinference.span.kind'];
    if (oiKind) {
        const mapped = OPENINFERENCE_MAP[String(oiKind).toUpperCase()];
        if (mapped) return mapped;
    }

    // 3. Framework-specific attributes
    for (const { key, map } of FRAMEWORK_MAPPINGS) {
        const val = allAttributes[key];
        if (val) {
            const mapped = map[String(val)];
            if (mapped) return mapped;
        }
    }

    // 3b. Vector-store query spans (OpenLLMetry: Pinecone/Chroma/Qdrant/…).
    // Signalled by a recognized vector-DB `db.system`, vector-specific query
    // attributes, or per-match result events. Kept distinct from a plain SQL
    // query (which stays "function") so it renders with the documents panel.
    if (hasVectorStoreSignature(allAttributes, normalized.events)) {
        return 'retrieval';
    }

    // 4. gen_ai.operation.name
    const opName = allAttributes['gen_ai.operation.name'];
    if (opName) {
        const op = String(opName).toLowerCase();
        if (op === 'chat' || op === 'text_completion' || op === 'generate_content') return 'llm';
        if (op === 'embeddings') return 'embedding';
    }

    // 5. Type = GENERATION → llm
    if (normalized.type === SpanType.GENERATION) {
        return 'llm';
    }

    // 6. Carries a model (OTel gen_ai.request.model) → llm. Vendor-neutral
    // generation signal that catches model calls the framework maps above don't
    // name (e.g. the Vercel ai.generateText wrapper, whose ai.operationId the
    // map may not cover). A span with a resolved model is a model call —
    // including an LLM that also requested tools — so this is checked before the
    // ToolCalls heuristic.
    if (normalized.model) {
        return 'llm';
    }

    // 7. Has non-empty ToolCalls → tool
    if (normalized.toolCalls && normalized.toolCalls.length > 0) {
        return 'tool';
    }

    // 8. Name-based heuristics
    const name = (normalized.name || '').toLowerCase();
    if (/retriev|search|rag/i.test(name)) return 'retrieval';
    if (/embed/i.test(name)) return 'embedding';
    if (/guard|safety/i.test(name)) return 'guardrail';

    // 9. Default
    return 'function';
}
