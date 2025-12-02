export interface TokenKeys {
    inputKey?: string;
    outputKey?: string;
    totalKey?: string;
    promptKey?: string;      // Legacy alias for input
    completionKey?: string;  // Legacy alias for output
    reasoningKey?: string; 
}

export interface TokenCounts {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
}

export function parseTokens(attributes: Record<string, any>, keys: TokenKeys): TokenCounts {
    const result: TokenCounts = {};

    // Helper to safely parse integer
    const parseIntSafe = (val: any): number | undefined => {
        if (typeof val === 'number') return Math.floor(val);
        if (typeof val === 'string') {
            // Handle JSON string format (e.g., from OTel SDK)
            try {
                const parsed = JSON.parse(val);
                if (typeof parsed === 'number') return Math.floor(parsed);
                if (parsed && typeof parsed.intValue === 'number') return Math.floor(parsed.intValue);
            } catch {
                // Not JSON, try direct parseInt
            }
            const parsed = parseInt(val, 10);
            return isNaN(parsed) ? undefined : parsed;
        }
        return undefined;
    };

    // Extract input tokens (check inputKey first, then promptKey)
    if (keys.inputKey && attributes[keys.inputKey] !== undefined) {
        result.inputTokens = parseIntSafe(attributes[keys.inputKey]);
    } else if (keys.promptKey && attributes[keys.promptKey] !== undefined) {
        result.inputTokens = parseIntSafe(attributes[keys.promptKey]);
    }

    // Extract output tokens (check outputKey first, then completionKey)
    if (keys.outputKey && attributes[keys.outputKey] !== undefined) {
        result.outputTokens = parseIntSafe(attributes[keys.outputKey]);
    } else if (keys.completionKey && attributes[keys.completionKey] !== undefined) {
        result.outputTokens = parseIntSafe(attributes[keys.completionKey]);
    }

    // Extract total tokens
    if (keys.totalKey && attributes[keys.totalKey] !== undefined) {
        result.totalTokens = parseIntSafe(attributes[keys.totalKey]);
    }

    // Calculate total if missing but input/output are present
    if (result.totalTokens === undefined && result.inputTokens !== undefined && result.outputTokens !== undefined) {
        result.totalTokens = result.inputTokens + result.outputTokens;
    }

    // Extract reasoning tokens
    if (keys.reasoningKey && attributes[keys.reasoningKey] !== undefined) {
        result.reasoningTokens = parseIntSafe(attributes[keys.reasoningKey]);
    }

    return result;
}

// Helper function to extract reasoning tokens from providerMetadata
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
