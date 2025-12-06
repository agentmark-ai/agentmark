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

    // Dataset / Evaluation Context
    if (get('dataset_run_id')) result.datasetRunId = String(get('dataset_run_id'));
    if (get('dataset_run_name')) result.datasetRunName = String(get('dataset_run_name'));
    if (get('dataset_item_name')) result.datasetItemName = String(get('dataset_item_name'));
    if (get('dataset_expected_output')) result.datasetExpectedOutput = String(get('dataset_expected_output'));

    return result;
}

