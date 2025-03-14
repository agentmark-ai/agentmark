import type {
  TextConfig,
  ObjectConfig,
  ImageConfig,
  Adapter,
  PromptMetadata,
} from "../types";
import { LanguageModel, ImageModel, jsonSchema } from "ai";
import { generateText, generateObject, experimental_generateImage } from "ai";
export type AdaptOptions = {
  telemetry?: {
    isEnabled: boolean;
    functionId?: string;
    metadata?: Record<string, any>;
  },
  apiKey?: string;
  [key: string]: any;
}

type VercelTextParams = Parameters<typeof generateText>[0];
type RequiredVercelTextParams = Pick<VercelTextParams, 'model' | 'messages'>;
type OptionalVercelTextParams = Partial<Pick<VercelTextParams,
  'temperature' | 
  'maxTokens' | 
  'topP' | 
  'topK' | 
  'frequencyPenalty' | 
  'presencePenalty' | 
  'stopSequences' | 
  'seed' | 
  'tools' |
  'experimental_telemetry'
>>;
type TextParams = RequiredVercelTextParams & OptionalVercelTextParams;

type VercelObjectParams = Parameters<typeof generateObject>[0];
type RequiredVercelObjectParams = Pick<VercelObjectParams, 'model' | 'messages'>;
type OptionalVercelObjectParams = Partial<Omit<VercelObjectParams, 'model' | 'messages'>>;
type ObjectParams = RequiredVercelObjectParams & OptionalVercelObjectParams;

type VercelImageParams = Parameters<typeof experimental_generateImage>[0];
type RequiredVercelImageParams = Pick<VercelImageParams, 'model' | 'prompt'>;
type OptionalVercelImageParams = Partial<Pick<VercelImageParams,
  'n' |
  'size' |
  'aspectRatio' |
  'seed'
>>;
type ImageParams = RequiredVercelImageParams & OptionalVercelImageParams;

export type Tool = (args: any) => any;

export type ModelFunctionCreator = (modelName: string, options?: AdaptOptions) => LanguageModel | ImageModel;

interface ModelRegistry {
  getModelFunction(modelName: string): ModelFunctionCreator;
  registerModel(modelPattern: string | RegExp, creator: ModelFunctionCreator): void;
}

const getTelemetryConfig = (
  telemetry: AdaptOptions['telemetry'],
  props: Record<string, any>,
  promptName: string,
) => {
  return {
    ...telemetry,
    metadata: {
      ...telemetry?.metadata,
      prompt: promptName,
      props: JSON.stringify(props),
    }
  }
}

export class VercelToolRegistry {
  private tools: Record<string, Tool> = {};

  constructor() { }

  registerTool(name: string, tool: Tool) {
    this.tools[name] = tool;
  }

  hasTool(name: string) {
    return this.tools[name] !== undefined;
  }

  getTool(name: string) {
    return this.tools[name];
  }
}

export class VercelModelRegistry {
  private exactMatches: Record<string, ModelFunctionCreator> = {};
  private patternMatches: Array<[RegExp, ModelFunctionCreator]> = [];
  private defaultCreator?: ModelFunctionCreator;

  constructor(defaultCreator?: ModelFunctionCreator) {
    this.defaultCreator = defaultCreator;
  }

  registerModel(modelPattern: string | RegExp | Array<string>, creator: ModelFunctionCreator): void {
    if (typeof modelPattern === 'string') {
      this.exactMatches[modelPattern] = creator;
    } else if (Array.isArray(modelPattern)) {
      modelPattern.forEach(model => this.exactMatches[model] = creator);
    } else {
      this.patternMatches.push([modelPattern, creator]);
    }
  }

  getModelFunction(modelName: string): ModelFunctionCreator {
    if (this.exactMatches[modelName]) {
      return this.exactMatches[modelName];
    }

    for (const [pattern, creator] of this.patternMatches) {
      if (pattern.test(modelName)) {
        return creator;
      }
    }

    if (this.defaultCreator) {
      return this.defaultCreator;
    }

    throw new Error(`No model function found for: ${modelName}`);
  }

  registerModels(mappings: Record<string, ModelFunctionCreator>): void {
    for (const [pattern, creator] of Object.entries(mappings)) {
      this.registerModel(pattern, creator);
    }
  }

  setDefaultCreator(creator: ModelFunctionCreator): void {
    this.defaultCreator = creator;
  }
}

export class VercelAdapter implements Adapter<TextParams, ObjectParams, ImageParams, AdaptOptions> {
  private toolRegistry: VercelToolRegistry;
  
  constructor(private modelRegistry: ModelRegistry) {
    this.modelRegistry = modelRegistry;
    this.toolRegistry = new VercelToolRegistry();
  }

  adaptText(input: TextConfig, options: AdaptOptions, metadata: PromptMetadata): RequiredVercelTextParams & OptionalVercelTextParams {
    const modelCreator = this.modelRegistry.getModelFunction(input.metadata.model.name);
    const model = modelCreator(input.metadata.model.name, options) as LanguageModel;
    
    const params: RequiredVercelTextParams & OptionalVercelTextParams = {
      model,
      messages: input.messages,
    };

    const settings = input.metadata.model.settings;
    if (settings?.temperature !== undefined) params.temperature = settings.temperature;
    if (settings?.max_tokens !== undefined) params.maxTokens = settings.max_tokens;
    if (settings?.top_p !== undefined) params.topP = settings.top_p;
    if (settings?.top_k !== undefined) params.topK = settings.top_k;
    if (settings?.frequency_penalty !== undefined) params.frequencyPenalty = settings.frequency_penalty;
    if (settings?.presence_penalty !== undefined) params.presencePenalty = settings.presence_penalty;
    if (settings?.stop_sequences !== undefined) params.stopSequences = settings.stop_sequences;
    if (settings?.seed !== undefined) params.seed = settings.seed;
    if (options.telemetry) params.experimental_telemetry = getTelemetryConfig(options.telemetry, metadata.props, input.name);
    
    if (settings?.tools) {
      params.tools = Object.fromEntries(
        Object.entries(settings.tools).map(([name, tool]) => [
          name,
          {
            description: tool.description || '',
            parameters: jsonSchema(tool.parameters),
            execute: this.toolRegistry.hasTool(name) ? this.toolRegistry.getTool(name) : undefined
          }
        ])
      );
    }

    return params;
  }

  adaptObject(input: ObjectConfig, options: AdaptOptions, metadata: PromptMetadata): RequiredVercelObjectParams & OptionalVercelObjectParams & { output: 'no-schema' | 'object' } {
    const modelCreator = this.modelRegistry.getModelFunction(input.metadata.model.name);
    const model = modelCreator(input.metadata.model.name, options) as LanguageModel;
    const settings = input.metadata.model.settings;
    
    const params: any = {
      model,
      messages: input.messages,
      schema: jsonSchema(settings.schema),
    };
    
    if (settings?.temperature !== undefined) params.temperature = settings.temperature;
    if (settings?.max_tokens !== undefined) params.maxTokens = settings.max_tokens;
    if (settings?.top_p !== undefined) params.topP = settings.top_p;
    if (settings?.top_k !== undefined) params.topK = settings.top_k;
    if (settings?.frequency_penalty !== undefined) params.frequencyPenalty = settings.frequency_penalty;
    if (settings?.presence_penalty !== undefined) params.presencePenalty = settings.presence_penalty;
    if (settings?.seed !== undefined) params.seed = settings.seed;
    if (settings?.schema_name !== undefined) params.schemaName = settings.schema_name;
    if (settings?.schema_description !== undefined) params.schemaDescription = settings.schema_description;
    if (options.telemetry) params.experimental_telemetry = getTelemetryConfig(options.telemetry, metadata.props, input.name);
    
    return params;
  }

  adaptImage(input: ImageConfig, options: AdaptOptions, metadata: PromptMetadata): RequiredVercelImageParams & OptionalVercelImageParams {
    const modelCreator = this.modelRegistry.getModelFunction(input.metadata.model.name);
    const model = modelCreator(input.metadata.model.name, options) as ImageModel;
    const prompt = input.messages.map(message => message.content).join('\n');
    
    const params: RequiredVercelImageParams & OptionalVercelImageParams = {
      model,
      prompt,
    };

    const settings = input.metadata.model.settings;
    if (settings?.num_images !== undefined) params.n = settings.num_images;
    if (settings?.size !== undefined) params.size = settings.size as `${number}x${number}`;
    if (settings?.aspect_ratio !== undefined) params.aspectRatio = settings.aspect_ratio as `${number}:${number}`;
    if (settings?.seed !== undefined) params.seed = settings.seed;
    
    return params;
  }
}
