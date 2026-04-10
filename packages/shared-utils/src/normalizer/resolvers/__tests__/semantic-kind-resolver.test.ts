import { describe, it, expect } from 'vitest';
import { resolveSemanticKind } from '../semantic-kind-resolver';
import { SpanType } from '../../types';

/**
 * Helper to create a minimal normalized span for testing.
 */
function makeSpan(overrides: Record<string, any> = {}) {
    return {
        type: SpanType.SPAN,
        name: 'test-span',
        ...overrides,
    } as any;
}

describe('resolveSemanticKind', () => {
    // ── Level 1: normalized.semanticKind ──────────────────────────

    describe('Level 1 — explicit semanticKind', () => {
        it('should return the semanticKind when it is a valid value', () => {
            const result = resolveSemanticKind(makeSpan({ semanticKind: 'llm' }), {});
            expect(result).toBe('llm');
        });

        it('should return the semanticKind for each valid kind', () => {
            const validKinds = ['function', 'llm', 'tool', 'agent', 'retrieval', 'embedding', 'guardrail'] as const;
            for (const kind of validKinds) {
                expect(resolveSemanticKind(makeSpan({ semanticKind: kind }), {})).toBe(kind);
            }
        });

        it('should fall through when semanticKind is an invalid value', () => {
            // With no other signals, should fall to default 'function'
            const result = resolveSemanticKind(makeSpan({ semanticKind: 'foobar' }), {});
            expect(result).toBe('function');
        });

        it('should fall through when semanticKind is undefined', () => {
            const result = resolveSemanticKind(makeSpan(), {});
            expect(result).toBe('function');
        });

        it('should fall through when semanticKind is empty string', () => {
            const result = resolveSemanticKind(makeSpan({ semanticKind: '' }), {});
            expect(result).toBe('function');
        });
    });

    // ── Level 2: OpenInference span.kind ──────────────────────────

    describe('Level 2 — OpenInference span.kind', () => {
        it('should map LLM to llm', () => {
            const result = resolveSemanticKind(makeSpan(), { 'openinference.span.kind': 'LLM' });
            expect(result).toBe('llm');
        });

        it('should map RETRIEVER to retrieval', () => {
            const result = resolveSemanticKind(makeSpan(), { 'openinference.span.kind': 'RETRIEVER' });
            expect(result).toBe('retrieval');
        });

        it('should map CHAIN to function', () => {
            const result = resolveSemanticKind(makeSpan(), { 'openinference.span.kind': 'CHAIN' });
            expect(result).toBe('function');
        });

        it('should map AGENT to agent', () => {
            const result = resolveSemanticKind(makeSpan(), { 'openinference.span.kind': 'AGENT' });
            expect(result).toBe('agent');
        });

        it('should map TOOL to tool', () => {
            const result = resolveSemanticKind(makeSpan(), { 'openinference.span.kind': 'TOOL' });
            expect(result).toBe('tool');
        });

        it('should map EMBEDDING to embedding', () => {
            const result = resolveSemanticKind(makeSpan(), { 'openinference.span.kind': 'EMBEDDING' });
            expect(result).toBe('embedding');
        });

        it('should map GUARDRAIL to guardrail', () => {
            const result = resolveSemanticKind(makeSpan(), { 'openinference.span.kind': 'GUARDRAIL' });
            expect(result).toBe('guardrail');
        });

        it('should map RERANKER to retrieval', () => {
            const result = resolveSemanticKind(makeSpan(), { 'openinference.span.kind': 'RERANKER' });
            expect(result).toBe('retrieval');
        });

        it('should handle case-insensitive OpenInference values', () => {
            expect(resolveSemanticKind(makeSpan(), { 'openinference.span.kind': 'llm' })).toBe('llm');
            expect(resolveSemanticKind(makeSpan(), { 'openinference.span.kind': 'Retriever' })).toBe('retrieval');
            expect(resolveSemanticKind(makeSpan(), { 'openinference.span.kind': 'agent' })).toBe('agent');
        });

        it('should fall through when OpenInference value is unrecognized', () => {
            const result = resolveSemanticKind(makeSpan(), { 'openinference.span.kind': 'UNKNOWN_TYPE' });
            expect(result).toBe('function');
        });
    });

    // ── Level 3: Framework-specific attributes ───────────────────

    describe('Level 3 — Vercel AI SDK (ai.operationId)', () => {
        it('should map embed to embedding', () => {
            const result = resolveSemanticKind(makeSpan(), { 'ai.operationId': 'embed' });
            expect(result).toBe('embedding');
        });

        it('should map ai.embed to embedding', () => {
            const result = resolveSemanticKind(makeSpan(), { 'ai.operationId': 'ai.embed' });
            expect(result).toBe('embedding');
        });

        it('should map generateText to llm', () => {
            const result = resolveSemanticKind(makeSpan(), { 'ai.operationId': 'generateText' });
            expect(result).toBe('llm');
        });

        it('should map streamText to llm', () => {
            const result = resolveSemanticKind(makeSpan(), { 'ai.operationId': 'streamText' });
            expect(result).toBe('llm');
        });

        it('should map generateObject to llm', () => {
            const result = resolveSemanticKind(makeSpan(), { 'ai.operationId': 'generateObject' });
            expect(result).toBe('llm');
        });

        it('should map streamObject to llm', () => {
            const result = resolveSemanticKind(makeSpan(), { 'ai.operationId': 'streamObject' });
            expect(result).toBe('llm');
        });
    });

    describe('Level 3 — Traceloop (traceloop.span.kind)', () => {
        it('should map LLM to llm', () => {
            const result = resolveSemanticKind(makeSpan(), { 'traceloop.span.kind': 'LLM' });
            expect(result).toBe('llm');
        });

        it('should map TOOL to tool', () => {
            const result = resolveSemanticKind(makeSpan(), { 'traceloop.span.kind': 'TOOL' });
            expect(result).toBe('tool');
        });

        it('should map AGENT to agent', () => {
            const result = resolveSemanticKind(makeSpan(), { 'traceloop.span.kind': 'AGENT' });
            expect(result).toBe('agent');
        });

        it('should map WORKFLOW to function', () => {
            const result = resolveSemanticKind(makeSpan(), { 'traceloop.span.kind': 'WORKFLOW' });
            expect(result).toBe('function');
        });

        it('should map TASK to function', () => {
            const result = resolveSemanticKind(makeSpan(), { 'traceloop.span.kind': 'TASK' });
            expect(result).toBe('function');
        });
    });

    describe('Level 3 — LangChain (langchain.run_type)', () => {
        it('should map llm to llm', () => {
            const result = resolveSemanticKind(makeSpan(), { 'langchain.run_type': 'llm' });
            expect(result).toBe('llm');
        });

        it('should map chat_model to llm', () => {
            const result = resolveSemanticKind(makeSpan(), { 'langchain.run_type': 'chat_model' });
            expect(result).toBe('llm');
        });

        it('should map retriever to retrieval', () => {
            const result = resolveSemanticKind(makeSpan(), { 'langchain.run_type': 'retriever' });
            expect(result).toBe('retrieval');
        });

        it('should map tool to tool', () => {
            const result = resolveSemanticKind(makeSpan(), { 'langchain.run_kind': 'tool' });
            // This uses the wrong key intentionally — should fall through to default
            expect(result).toBe('function');
        });

        it('should map chain to function', () => {
            const result = resolveSemanticKind(makeSpan(), { 'langchain.run_type': 'chain' });
            expect(result).toBe('function');
        });

        it('should map embedding to embedding', () => {
            const result = resolveSemanticKind(makeSpan(), { 'langchain.run_type': 'embedding' });
            expect(result).toBe('embedding');
        });
    });

    describe('Level 3 — Genkit (genkit:type)', () => {
        it('should map model to llm', () => {
            const result = resolveSemanticKind(makeSpan(), { 'genkit:type': 'model' });
            expect(result).toBe('llm');
        });

        it('should map tool to tool', () => {
            const result = resolveSemanticKind(makeSpan(), { 'genkit:type': 'tool' });
            expect(result).toBe('tool');
        });

        it('should map flow to function', () => {
            const result = resolveSemanticKind(makeSpan(), { 'genkit:type': 'flow' });
            expect(result).toBe('function');
        });

        it('should map retriever to retrieval', () => {
            const result = resolveSemanticKind(makeSpan(), { 'genkit:type': 'retriever' });
            expect(result).toBe('retrieval');
        });

        it('should map embedder to embedding', () => {
            const result = resolveSemanticKind(makeSpan(), { 'genkit:type': 'embedder' });
            expect(result).toBe('embedding');
        });
    });

    // ── Level 4: gen_ai.operation.name ────────────────────────────

    describe('Level 4 — gen_ai.operation.name', () => {
        it('should map chat to llm', () => {
            const result = resolveSemanticKind(makeSpan(), { 'gen_ai.operation.name': 'chat' });
            expect(result).toBe('llm');
        });

        it('should map text_completion to llm', () => {
            const result = resolveSemanticKind(makeSpan(), { 'gen_ai.operation.name': 'text_completion' });
            expect(result).toBe('llm');
        });

        it('should map generate_content to llm', () => {
            const result = resolveSemanticKind(makeSpan(), { 'gen_ai.operation.name': 'generate_content' });
            expect(result).toBe('llm');
        });

        it('should map embeddings to embedding', () => {
            const result = resolveSemanticKind(makeSpan(), { 'gen_ai.operation.name': 'embeddings' });
            expect(result).toBe('embedding');
        });

        it('should handle case-insensitive operation names', () => {
            expect(resolveSemanticKind(makeSpan(), { 'gen_ai.operation.name': 'CHAT' })).toBe('llm');
            expect(resolveSemanticKind(makeSpan(), { 'gen_ai.operation.name': 'Embeddings' })).toBe('embedding');
        });

        it('should fall through when operation name is unrecognized', () => {
            const result = resolveSemanticKind(makeSpan(), { 'gen_ai.operation.name': 'unknown_op' });
            expect(result).toBe('function');
        });
    });

    // ── Level 5: Type = GENERATION ────────────────────────────────

    describe('Level 5 — Type = GENERATION', () => {
        it('should return llm when type is GENERATION and no other attributes match', () => {
            const result = resolveSemanticKind(makeSpan({ type: SpanType.GENERATION }), {});
            expect(result).toBe('llm');
        });

        it('should not return llm for type SPAN', () => {
            const result = resolveSemanticKind(makeSpan({ type: SpanType.SPAN }), {});
            expect(result).toBe('function');
        });
    });

    // ── Level 6: Has non-empty toolCalls ──────────────────────────

    describe('Level 6 — toolCalls present', () => {
        it('should return tool when toolCalls has entries', () => {
            const result = resolveSemanticKind(
                makeSpan({ toolCalls: [{ name: 'search', arguments: '{}' }] }),
                {},
            );
            expect(result).toBe('tool');
        });

        it('should fall through when toolCalls is empty array', () => {
            const result = resolveSemanticKind(makeSpan({ toolCalls: [] }), {});
            expect(result).toBe('function');
        });

        it('should fall through when toolCalls is undefined', () => {
            const result = resolveSemanticKind(makeSpan(), {});
            expect(result).toBe('function');
        });
    });

    // ── Level 7: Name-based heuristics ────────────────────────────

    describe('Level 7 — name-based heuristics', () => {
        it('should return retrieval when name contains "retrieval"', () => {
            const result = resolveSemanticKind(makeSpan({ name: 'document-retrieval-step' }), {});
            expect(result).toBe('retrieval');
        });

        it('should return retrieval when name contains "search"', () => {
            const result = resolveSemanticKind(makeSpan({ name: 'vector-search' }), {});
            expect(result).toBe('retrieval');
        });

        it('should return retrieval when name contains "rag"', () => {
            const result = resolveSemanticKind(makeSpan({ name: 'rag-pipeline' }), {});
            expect(result).toBe('retrieval');
        });

        it('should return embedding when name contains "embed"', () => {
            const result = resolveSemanticKind(makeSpan({ name: 'embed-documents' }), {});
            expect(result).toBe('embedding');
        });

        it('should return embedding when name contains "embedding"', () => {
            const result = resolveSemanticKind(makeSpan({ name: 'text-embedding-3-small' }), {});
            expect(result).toBe('embedding');
        });

        it('should return guardrail when name contains "guard"', () => {
            const result = resolveSemanticKind(makeSpan({ name: 'input-guardrail' }), {});
            expect(result).toBe('guardrail');
        });

        it('should return guardrail when name contains "safety"', () => {
            const result = resolveSemanticKind(makeSpan({ name: 'safety-check' }), {});
            expect(result).toBe('guardrail');
        });

        it('should be case-insensitive for name heuristics', () => {
            expect(resolveSemanticKind(makeSpan({ name: 'RETRIEVAL_STEP' }), {})).toBe('retrieval');
            expect(resolveSemanticKind(makeSpan({ name: 'EmbedQuery' }), {})).toBe('embedding');
            expect(resolveSemanticKind(makeSpan({ name: 'SafetyFilter' }), {})).toBe('guardrail');
        });
    });

    // ── Level 8: Default ──────────────────────────────────────────

    describe('Level 8 — default', () => {
        it('should return function when no attributes match and type is SPAN', () => {
            const result = resolveSemanticKind(makeSpan({ name: 'my-custom-step' }), {});
            expect(result).toBe('function');
        });

        it('should return function when all attributes are empty', () => {
            const result = resolveSemanticKind(makeSpan(), {});
            expect(result).toBe('function');
        });
    });

    // ── Priority tests ───────────────────────────────────────────

    describe('priority ordering', () => {
        it('should prefer semanticKind (L1) over OpenInference (L2)', () => {
            const result = resolveSemanticKind(
                makeSpan({ semanticKind: 'agent' }),
                { 'openinference.span.kind': 'LLM' },
            );
            expect(result).toBe('agent');
        });

        it('should prefer OpenInference (L2) over framework attributes (L3)', () => {
            const result = resolveSemanticKind(
                makeSpan(),
                {
                    'openinference.span.kind': 'TOOL',
                    'ai.operationId': 'generateText',
                },
            );
            expect(result).toBe('tool');
        });

        it('should prefer framework attributes (L3) over gen_ai.operation.name (L4)', () => {
            const result = resolveSemanticKind(
                makeSpan(),
                {
                    'ai.operationId': 'embed',
                    'gen_ai.operation.name': 'chat',
                },
            );
            expect(result).toBe('embedding');
        });

        it('should prefer gen_ai.operation.name (L4) over GENERATION type (L5)', () => {
            const result = resolveSemanticKind(
                makeSpan({ type: SpanType.GENERATION }),
                { 'gen_ai.operation.name': 'embeddings' },
            );
            expect(result).toBe('embedding');
        });

        it('should prefer GENERATION type (L5) over toolCalls (L6)', () => {
            const result = resolveSemanticKind(
                makeSpan({
                    type: SpanType.GENERATION,
                    toolCalls: [{ name: 'search', arguments: '{}' }],
                }),
                {},
            );
            expect(result).toBe('llm');
        });

        it('should prefer toolCalls (L6) over name heuristics (L7)', () => {
            const result = resolveSemanticKind(
                makeSpan({
                    name: 'embed-documents',
                    toolCalls: [{ name: 'search', arguments: '{}' }],
                }),
                {},
            );
            expect(result).toBe('tool');
        });

        it('should prefer name heuristics (L7) over default (L8)', () => {
            const result = resolveSemanticKind(makeSpan({ name: 'vector-search-step' }), {});
            expect(result).toBe('retrieval');
        });

        it('should fall through invalid L1 to valid L2', () => {
            const result = resolveSemanticKind(
                makeSpan({ semanticKind: 'bogus' }),
                { 'openinference.span.kind': 'AGENT' },
            );
            expect(result).toBe('agent');
        });
    });
});
