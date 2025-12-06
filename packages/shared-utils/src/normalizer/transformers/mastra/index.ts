import { NormalizedSpan, OtelSpan, ScopeTransformer, SpanType, Message } from '../../types';

export class MastraTransformer implements ScopeTransformer {
    classify(span: OtelSpan, _attributes: Record<string, any>): SpanType {
        // Classify agent generation spans as GENERATION
        const isGenerationSpan = 
            span.name === 'agent.streamLegacy' ||
            span.name === 'agent.stream' ||
            span.name === 'agent.streamObject' ||
            span.name === 'agent.generate' ||
            span.name === 'agent.generateObject';
        
        return isGenerationSpan ? SpanType.GENERATION : SpanType.SPAN;
    }

    transform(span: OtelSpan, attributes: Record<string, any>): Partial<NormalizedSpan> {
        const result: Partial<NormalizedSpan> = {};

        // Extract model from agent.resolveModelConfig.result or from current span
        const modelConfig = this.extractModelConfig(attributes, span);
        if (modelConfig?.modelId) {
            result.model = modelConfig.modelId;
        }

        // Extract input messages
        const input = this.extractInput(span, attributes);
        if (input) {
            result.input = input;
        }

        // Extract output and tokens from agent.stream.result or agent.streamLegacy.result
        const streamResult = this.extractStreamResult(span, attributes);
        if (streamResult) {
            if (streamResult.output) {
                result.output = streamResult.output;
            }
            if (streamResult.outputObject) {
                result.outputObject = streamResult.outputObject;
            }
            if (streamResult.usage) {
                result.inputTokens = streamResult.usage.promptTokens;
                result.outputTokens = streamResult.usage.completionTokens;
                result.totalTokens = streamResult.usage.totalTokens;
            }
        }

        // Extract trace name from agentmark.trace_name or componentName
        if (attributes['agentmark.trace_name']) {
            result.traceName = attributes['agentmark.trace_name'] as string;
        } else if (attributes['componentName']) {
            result.traceName = attributes['componentName'] as string;
        }

        // Extract settings from model config
        if (modelConfig?.settings) {
            result.settings = modelConfig.settings;
        }

        return result;
    }

    private extractModelConfig(
        attributes: Record<string, any>,
        _span: OtelSpan
    ): { modelId?: string; provider?: string; settings?: any } | null {
        // Try to find model config in resolveModelConfig.result attribute
        // This might be in a sibling span, so we check current span first
        const resolveModelConfigResult = attributes['agent.resolveModelConfig.result'];
        if (resolveModelConfigResult) {
            try {
                const config = typeof resolveModelConfigResult === 'string' 
                    ? JSON.parse(resolveModelConfigResult) 
                    : resolveModelConfigResult;
                
                if (config.modelId) {
                    return {
                        modelId: config.modelId,
                        provider: config.config?.provider,
                        settings: config.settings,
                    };
                }
            } catch {
                // Ignore parse errors
            }
        }

        // Also check prepareLLMOptions.result for model info
        const prepareLLMOptionsResult = attributes['agent.prepareLLMOptions.result'];
        if (prepareLLMOptionsResult) {
            try {
                const result = typeof prepareLLMOptionsResult === 'string'
                    ? JSON.parse(prepareLLMOptionsResult)
                    : prepareLLMOptionsResult;
                
                if (result.llm?.name) {
                    // This gives us the LLM component name, but not the model ID
                    // Model ID would be in resolveModelConfig
                }
            } catch {
                // Ignore parse errors
            }
        }

        return null;
    }

    private extractInput(span: OtelSpan, attributes: Record<string, any>): Message[] | undefined {
        // Try to extract messages from various agent span attributes
        const spanName = span.name;
        
        // Check for argument.0 which typically contains messages
        const argument0 = attributes[`${spanName}.argument.0`] || 
                         attributes['agent.prepareLLMOptions.argument.0'] ||
                         attributes['agent.stream.argument.0'] ||
                         attributes['agent.streamLegacy.argument.0'];
        
        if (argument0) {
            try {
                const messages = typeof argument0 === 'string' ? JSON.parse(argument0) : argument0;
                if (Array.isArray(messages)) {
                    return messages as Message[];
                }
            } catch {
                // Ignore parse errors
            }
        }

        return undefined;
    }

    private extractStreamResult(
        span: OtelSpan,
        attributes: Record<string, any>
    ): { output?: string; outputObject?: any; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } } | null {
        const spanName = span.name;
        
        // Check for result attribute
        const resultAttr = attributes[`${spanName}.result`] ||
                          attributes['agent.stream.result'] ||
                          attributes['agent.streamLegacy.result'] ||
                          attributes['agent.streamObject.result'];
        
        if (resultAttr) {
            try {
                const result = typeof resultAttr === 'string' ? JSON.parse(resultAttr) : resultAttr;
                
                const extracted: any = {};
                
                // Extract usage/tokens
                if (result.usage) {
                    extracted.usage = {
                        promptTokens: result.usage.promptTokens,
                        completionTokens: result.usage.completionTokens,
                        totalTokens: result.usage.totalTokens,
                    };
                }
                
                // Extract output object
                if (result.object) {
                    extracted.outputObject = result.object;
                    extracted.output = JSON.stringify(result.object);
                } else if (result.text) {
                    extracted.output = result.text;
                } else if (result.response) {
                    // Sometimes response is nested
                    if (typeof result.response === 'string') {
                        extracted.output = result.response;
                    } else {
                        extracted.output = JSON.stringify(result.response);
                        extracted.outputObject = result.response;
                    }
                }
                
                return extracted;
            } catch {
                // Ignore parse errors
            }
        }

        return null;
    }
}

