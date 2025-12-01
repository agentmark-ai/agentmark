import { NormalizedSpan } from '../types';

export function parseMetadata(attributes: Record<string, any>, prefix: string = 'ai.telemetry.metadata.'): Partial<NormalizedSpan> {
    const result: Partial<NormalizedSpan> = {};

    // Helper to get value with prefix
    const get = (key: string) => attributes[`${prefix}${key}`];

    // Session Context
    if (get('sessionId')) result.sessionId = String(get('sessionId'));
    if (get('sessionName')) result.sessionName = String(get('sessionName'));
    if (get('userId')) result.userId = String(get('userId'));
    if (get('traceName')) result.traceName = String(get('traceName'));

    // Dataset / Evaluation Context
    if (get('dataset_run_id')) result.datasetRunId = String(get('dataset_run_id'));
    if (get('dataset_run_name')) result.datasetRunName = String(get('dataset_run_name'));
    if (get('dataset_path')) result.datasetPath = String(get('dataset_path'));
    if (get('dataset_item_name')) result.datasetItemName = String(get('dataset_item_name'));
    if (get('dataset_expected_output')) result.datasetExpectedOutput = String(get('dataset_expected_output'));

    if (get('prompt')) result.promptName = String(get('prompt'));

    // Version Control
    if (get('commit_sha')) result.commitSha = String(get('commit_sha'));

    return result;
}
