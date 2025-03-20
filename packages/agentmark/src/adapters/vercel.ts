import type {
  TextConfig,
  ObjectConfig,
  ImageConfig,
  Adapter,
  PromptMetadata,
  ChatMessage,
  AdapterTextResult,
  AdapterObjectResult,
  AdapterImageResult,
} from "../types";
import type {
  LanguageModel,
  ImageModel, 
  generateText,
  experimental_generateImage,
  Schema
} from "ai";
import { jsonSchema } from "ai";

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
type TextResult = RequiredVercelTextParams & Partial<Omit<VercelTextParams, 'model' | 'messages'>>;

export type VercelTextResult<U> = TextResult & AdapterTextResult<U>;

export type SchemaObjectParams<U> = {
  model: LanguageModel;
  messages: ChatMessage[];
  schema: Schema<U>;
};

export type VercelSchemaObjectParams<U = unknown> = SchemaObjectParams<U> & AdapterObjectResult<U>;

type VercelImageParams = Parameters<typeof experimental_generateImage>[0];
type RequiredVercelImageParams = Pick<VercelImageParams, 'model' | 'prompt'>;
type ImageParams = RequiredVercelImageParams & Partial<Omit<VercelImageParams, 'model' | 'prompt'>>;

export type VercelImageResult<U> = ImageParams & AdapterImageResult<U>;

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

export class VercelAdapter implements Adapter<VercelTextResult<any>, VercelSchemaObjectParams<any>, VercelImageResult<any>> {
  private toolRegistry: VercelToolRegistry;

  constructor(
    private modelRegistry: ModelRegistry
  ) {
    this.modelRegistry = modelRegistry;
    this.toolRegistry = new VercelToolRegistry();
  }

  adaptText<U>(
    input: TextConfig, 
    options: AdaptOptions, 
    metadata: PromptMetadata
  ): VercelTextResult<U> {
    const modelCreator = this.modelRegistry.getModelFunction(input.metadata.model.name);
    const model = modelCreator(input.metadata.model.name, options) as LanguageModel;
    const settings = input.metadata.model.settings;

    return {
      model,
      messages: input.messages,
      ...(settings?.temperature !== undefined ? { temperature: settings.temperature } : {}),
      ...(settings?.max_tokens !== undefined ? { maxTokens: settings.max_tokens } : {}),
      ...(settings?.top_p !== undefined ? { topP: settings.top_p } : {}),
      ...(settings?.top_k !== undefined ? { topK: settings.top_k } : {}),
      ...(settings?.frequency_penalty !== undefined ? { frequencyPenalty: settings.frequency_penalty } : {}),
      ...(settings?.presence_penalty !== undefined ? { presencePenalty: settings.presence_penalty } : {}),
      ...(settings?.stop_sequences !== undefined ? { stopSequences: settings.stop_sequences } : {}),
      ...(settings?.seed !== undefined ? { seed: settings.seed } : {}),
      ...(options.telemetry ? { experimental_telemetry: getTelemetryConfig(options.telemetry, metadata.props, input.name) } : {}),
      ...(settings?.tools ? {
        tools: Object.fromEntries(
          Object.entries(settings.tools).map(([name, tool]) => [
            name,
            {
              description: tool.description || '',
              parameters: jsonSchema(tool.parameters),
              execute: this.toolRegistry.hasTool(name) ? this.toolRegistry.getTool(name) : undefined
            }
          ])
        )
      } : {})
    };
  }

  adaptObject<U>(
    input: ObjectConfig & { typedSchema: Schema<U> }, 
    options: AdaptOptions, 
    metadata: PromptMetadata
  ): VercelSchemaObjectParams<U> {
    const modelCreator = this.modelRegistry.getModelFunction(input.metadata.model.name);
    const model = modelCreator(input.metadata.model.name, options) as LanguageModel;
    const settings = input.metadata.model.settings;
    
    return {
      model,
      messages: input.messages,
      schema: input.typedSchema,
      ...(settings?.temperature !== undefined ? { temperature: settings.temperature } : {}),
      ...(settings?.max_tokens !== undefined ? { maxTokens: settings.max_tokens } : {}),
      ...(settings?.top_p !== undefined ? { topP: settings.top_p } : {}),
      ...(settings?.top_k !== undefined ? { topK: settings.top_k } : {}),
      ...(settings?.frequency_penalty !== undefined ? { frequencyPenalty: settings.frequency_penalty } : {}),
      ...(settings?.presence_penalty !== undefined ? { presencePenalty: settings.presence_penalty } : {}),
      ...(settings?.seed !== undefined ? { seed: settings.seed } : {}),
      ...(settings?.schema_name !== undefined ? { schemaName: settings.schema_name } : {}),
      ...(settings?.schema_description !== undefined ? { schemaDescription: settings.schema_description } : {}),
      ...(options.telemetry ? { experimental_telemetry: getTelemetryConfig(options.telemetry, metadata.props, input.name) } : {})
    };
  }

  adaptImage<U>(
    input: ImageConfig, 
    options: AdaptOptions,
    metadata: PromptMetadata
  ): VercelImageResult<U> {
    const modelCreator = this.modelRegistry.getModelFunction(input.metadata.model.name);
    const model = modelCreator(input.metadata.model.name, options) as ImageModel;
    const settings = input.metadata.model.settings;
    const prompt = input.messages.map(message => message.content).join('\n');

    return {
      model,
      prompt,
      ...(settings?.num_images !== undefined ? { n: settings.num_images } : {}),
      ...(settings?.size !== undefined ? { size: settings.size as `${number}x${number}` } : {}),
      ...(settings?.aspect_ratio !== undefined ? { aspectRatio: settings.aspect_ratio as `${number}:${number}` } : {}),
      ...(settings?.seed !== undefined ? { seed: settings.seed } : {})
    };
  }
}