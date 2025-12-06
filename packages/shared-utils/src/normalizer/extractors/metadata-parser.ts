import { NormalizedSpan } from '../types';
import { isSafeKey } from '../utils/key-sanitizer';

// Known metadata fields that should be excluded from custom metadata
const KNOWN_METADATA_FIELDS = new Set([
    'session_id',
    'session_name',
    'user_id',
    'trace_name',
    'dataset_run_id',
    'dataset_run_name',
    'dataset_path',
    'dataset_item_name',
    'dataset_expected_output',
    'prompt_name',
    'props',
    'commit_sha',
]);

export function parseMetadata(attributes: Record<string, any>, prefix: string = 'agentmark.metadata.'): Partial<NormalizedSpan> {
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
    if (get('dataset_path')) result.datasetPath = String(get('dataset_path'));
    if (get('dataset_item_name')) result.datasetItemName = String(get('dataset_item_name'));
    if (get('dataset_expected_output')) result.datasetExpectedOutput = String(get('dataset_expected_output'));

    if (get('prompt_name')) result.promptName = String(get('prompt_name'));

    if (get('props')) result.props = String(get('props'));

    // Version Control
    if (get('commit_sha')) result.commitSha = String(get('commit_sha'));

    return result;
}

/**
 * Extracts custom metadata keys from attributes that start with the given prefix.
 * Excludes known metadata fields that are already extracted as normalized fields.
 * 
 * @param attributes - The attributes to extract from
 * @param prefix - The prefix to look for (default: 'agentmark.metadata.')
 * @returns A record of custom metadata keys (with prefix stripped) to string values
 */
export function extractCustomMetadata(attributes: Record<string, any>, prefix: string = 'agentmark.metadata.'): Record<string, string> {
    const customMetadata: Record<string, string> = {};

    for (const [key, value] of Object.entries(attributes)) {
        // Check if the key starts with the prefix
        if (key.startsWith(prefix)) {
            // Extract the metadata key by removing the prefix
            const metadataKey = key.slice(prefix.length);
            
            // Skip known fields, empty keys, and dangerous keys to prevent prototype pollution
            if (metadataKey && !KNOWN_METADATA_FIELDS.has(metadataKey) && isSafeKey(metadataKey)) {
                // Convert value to string (raw strings, no JSON parsing)
                customMetadata[metadataKey] = String(value);
            }
        }
    }

    return customMetadata;
}
