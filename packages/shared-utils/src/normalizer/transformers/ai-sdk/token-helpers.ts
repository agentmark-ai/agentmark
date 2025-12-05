/**
 * AI SDK-specific token extraction helpers
 */

/**
 * Extracts reasoning tokens from AI SDK's providerMetadata attribute.
 * This is a fallback when ai.usage.reasoningTokens is not directly available.
 */
export function extractReasoningFromProviderMetadata(attributes: Record<string, any>): number | undefined {
    const providerMetadata = attributes['ai.response.providerMetadata'];
    if (!providerMetadata) return undefined;

    try {
        const parsed = typeof providerMetadata === 'string' 
            ? JSON.parse(providerMetadata) 
            : providerMetadata;
        
        // Check OpenAI provider metadata
        if (parsed?.openai?.reasoningTokens !== undefined) {
            return typeof parsed.openai.reasoningTokens === 'number' 
                ? parsed.openai.reasoningTokens 
                : undefined;
        }
    } catch {
        // Invalid JSON, ignore
    }

    return undefined;
}






