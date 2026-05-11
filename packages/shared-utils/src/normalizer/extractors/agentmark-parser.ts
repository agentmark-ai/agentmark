import { NormalizedSpan } from '../types';

/**
 * Parse attributes with 'agentmark.' prefix (not 'agentmark.metadata.')
 * These are direct context attributes set by the AgentMark SDK.
 * 
 * @param attributes - The attributes to extract from
 * @param prefix - The prefix to look for (default: 'agentmark.')
 * @returns Partial NormalizedSpan with extracted fields in camelCase
 */
export function parseAgentMarkAttributes(
    attributes: Record<string, any>, 
    prefix: string = 'agentmark.'
): Partial<NormalizedSpan> {
    const result: Partial<NormalizedSpan> = {};

    // Helper to get value with prefix
    const get = (key: string) => attributes[`${prefix}${key}`];

    // Session Context
    if (get('session_id')) result.sessionId = String(get('session_id'));
    if (get('session_name')) result.sessionName = String(get('session_name'));
    if (get('user_id')) result.userId = String(get('user_id'));
    if (get('trace_name')) result.traceName = String(get('trace_name'));

    // Prompt Context
    if (get('prompt_name')) result.promptName = String(get('prompt_name'));
    // Template variables. Only `agentmark.props` populates `result.props`
    // — never fall back to `agentmark.input`. The two attributes have
    // different semantics:
    //   `agentmark.props`  = frontmatter template variables. Set by
    //                        spans that ran a templated prompt (e.g.
    //                        invoke_agent in traced.py).
    //   `agentmark.input`  = arbitrary input data (dataset rows on a
    //                        wrapper span, chat messages on a generation
    //                        span, tool args on an execute_tool span).
    // Backfilling props from input would mis-label every wrapper / tool /
    // generation span as "has template variables", which the trace
    // drawer's Test Prompt button reads as "this is a prompt invocation
    // you can re-run". The asymmetry is intentional: AgentMarkTransformer
    // already does the safe direction (`props -> input`) at
    // transformers/agentmark/index.ts:258.
    if (get('props')) result.props = String(get('props'));

    // Span Kind (set by @traced decorator / traced() wrapper)
    // Route to semanticKind — keep kind as OTel-only (see Hazard 1 in issue #1817)
    if (get('span.kind')) result.semanticKind = String(get('span.kind'));

    // Dataset / Evaluation Context
    if (get('dataset_run_id')) result.datasetRunId = String(get('dataset_run_id'));
    if (get('dataset_run_name')) result.datasetRunName = String(get('dataset_run_name'));
    if (get('dataset_item_name')) result.datasetItemName = String(get('dataset_item_name'));
    if (get('dataset_expected_output')) result.datasetExpectedOutput = String(get('dataset_expected_output'));
    if (get('dataset_input')) result.datasetInput = String(get('dataset_input'));
    if (get('dataset_path')) result.datasetPath = String(get('dataset_path'));

    return result;
}

