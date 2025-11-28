export type AiSdkVersion = 'v5' | 'v4' | 'unknown';

export function detectVersion(attributes: Record<string, any>): AiSdkVersion {
    // Check for V5 specific attributes
    if (
        attributes['ai.response.text'] !== undefined ||
        attributes['ai.response.toolCalls'] !== undefined ||
        attributes['ai.response.object'] !== undefined
    ) {
        return 'v5';
    }

    // Check for V4 specific attributes
    if (
        attributes['ai.result.text'] !== undefined ||
        attributes['ai.result.toolCalls'] !== undefined ||
        attributes['ai.result.object'] !== undefined
    ) {
        return 'v4';
    }

    // If we have generic gen_ai attributes but no specific SDK ones, it might be an older version or just generic OTel
    // But for the purpose of "AI SDK" transformer, we treat it as unknown if it doesn't match known patterns
    return 'unknown';
}
