import { NormalizedSpan } from '../types';

export function parseMetadata(attributes: Record<string, any>, prefix: string = 'agentmark.metadata.'): Partial<NormalizedSpan> {
    const result: Partial<NormalizedSpan> = {};

    // Helper to get value with prefix
    const get = (key: string) => attributes[`${prefix}${key}`];
        
    // Session Context
    if (get('sessionId') !== undefined) result.sessionId = String(get('sessionId'));
    if (get('sessionName') !== undefined) result.sessionName = String(get('sessionName'));
    if (get('userId') !== undefined) result.userId = String(get('userId'));
    if (get('traceName') !== undefined) result.traceName = String(get('traceName'));

    // Dataset / Evaluation Context
    if (get('dataset_run_id') !== undefined) result.datasetRunId = String(get('dataset_run_id'));
    if (get('dataset_run_name') !== undefined) result.datasetRunName = String(get('dataset_run_name'));
    if (get('dataset_path') !== undefined) result.datasetPath = String(get('dataset_path'));
    if (get('dataset_item_name') !== undefined) result.datasetItemName = String(get('dataset_item_name'));
    if (get('dataset_expected_output') !== undefined) result.datasetExpectedOutput = String(get('dataset_expected_output'));

    if (get('prompt') !== undefined) result.promptName = String(get('prompt'));
    if (get('templateName') !== undefined) result.templateName = String(get('templateName'));
    if (get('props') !== undefined) result.props = String(get('props'));

    // Version Control
    if (get('commit_sha') !== undefined) result.commitSha = String(get('commit_sha'));

    return result;
}
