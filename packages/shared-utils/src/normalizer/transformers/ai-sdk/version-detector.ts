export type AiSdkVersion = 'v5' | 'v4' | 'unknown';

export function detectVersion(attributes: Record<string, any>): AiSdkVersion {
    // Check for V5 specific attributes (must be defined and not null)
    if (
        (attributes['ai.response.text'] !== undefined && attributes['ai.response.text'] !== null) ||
        (attributes['ai.response.toolCalls'] !== undefined && attributes['ai.response.toolCalls'] !== null) ||
        (attributes['ai.response.object'] !== undefined && attributes['ai.response.object'] !== null)
    ) {
        return 'v5';
    }

    // Check for V4 specific attributes (must be defined and not null)
    if (
        (attributes['ai.result.text'] !== undefined && attributes['ai.result.text'] !== null) ||
        (attributes['ai.result.toolCalls'] !== undefined && attributes['ai.result.toolCalls'] !== null) ||
        (attributes['ai.result.object'] !== undefined && attributes['ai.result.object'] !== null)
    ) {
        return 'v4';
    }

    // Also check for V4 prompt attributes (for error cases where result might not be present)
    if (
        (attributes['ai.prompt.messages'] !== undefined && attributes['ai.prompt.messages'] !== null) ||
        (attributes['ai.prompt'] !== undefined && attributes['ai.prompt'] !== null)
    ) {
        return 'v4';
    }

    // If we have generic gen_ai attributes but no specific SDK ones, it might be an older version or just generic OTel
    // But for the purpose of "AI SDK" transformer, we treat it as unknown if it doesn't match known patterns
    return 'unknown';
}
