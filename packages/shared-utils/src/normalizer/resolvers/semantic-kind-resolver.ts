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

/** Framework-specific attribute mappings (checked in order). */
const FRAMEWORK_MAPPINGS: Array<{ key: string; map: Record<string, SemanticKind> }> = [
    {
        key: 'ai.operationId', // Vercel AI SDK
        map: {
            'embed': 'embedding',
            'ai.embed': 'embedding',
            'generateText': 'llm',
            'streamText': 'llm',
            'generateObject': 'llm',
            'streamObject': 'llm',
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
 * Resolve the semantic kind of a span using an 8-level priority chain.
 *
 * Priority:
 * 1. normalized.semanticKind (from agentmark.span.kind attribute) — if valid
 * 2. openinference.span.kind attribute
 * 3. Framework-specific attributes (Vercel AI SDK, Traceloop, LangChain, Genkit)
 * 4. gen_ai.operation.name → llm/embedding
 * 5. Type = GENERATION → llm
 * 6. Has non-empty ToolCalls → tool
 * 7. Name-based heuristics
 * 8. Default → function
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

    // 6. Has non-empty ToolCalls → tool
    if (normalized.toolCalls && normalized.toolCalls.length > 0) {
        return 'tool';
    }

    // 7. Name-based heuristics
    const name = (normalized.name || '').toLowerCase();
    if (/retriev|search|rag/i.test(name)) return 'retrieval';
    if (/embed/i.test(name)) return 'embedding';
    if (/guard|safety/i.test(name)) return 'guardrail';

    // 8. Default
    return 'function';
}
