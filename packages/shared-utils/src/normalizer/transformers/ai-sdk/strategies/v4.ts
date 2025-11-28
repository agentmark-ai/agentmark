import { AttributeExtractor, NormalizedSpan } from '../../../types';
import { parseTokens } from '../../../extractors/token-parser';
import { parseMetadata } from '../../../extractors/metadata-parser';

export class AiSdkV4Strategy implements AttributeExtractor {
    extractModel(attributes: Record<string, any>): string | undefined {
        return attributes['gen_ai.request.model'] || attributes['ai.model.id'];
    }

    extractInput(attributes: Record<string, any>): string | undefined {
        // V4 often puts input in prompt messages
        return attributes['ai.prompt.messages']
            ? JSON.stringify(attributes['ai.prompt.messages'])
            : undefined;
    }

    extractOutput(attributes: Record<string, any>): string | undefined {
        // V4 uses 'ai.result.*'
        if (attributes['ai.result.text']) return attributes['ai.result.text'];
        if (attributes['ai.result.object']) return JSON.stringify(attributes['ai.result.object']);
        return undefined;
    }

    extractTokens(attributes: Record<string, any>): { input?: number; output?: number; total?: number } {
        // V4 often uses legacy token keys
        const tokens = parseTokens(attributes, {
            inputKey: 'gen_ai.usage.prompt_tokens',
            outputKey: 'gen_ai.usage.completion_tokens',
            totalKey: 'gen_ai.usage.total_tokens',
            promptKey: 'ai.usage.promptTokens',      // SDK specific fallback
            completionKey: 'ai.usage.completionTokens' // SDK specific fallback
        });

        return {
            input: tokens.inputTokens,
            output: tokens.outputTokens,
            total: tokens.totalTokens
        };
    }

    extractMetadata(attributes: Record<string, any>): Partial<NormalizedSpan> {
        return parseMetadata(attributes);
    }
}
