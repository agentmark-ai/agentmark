import type {
  TextConfig,
  ImageConfig,
  Adapter,
  PromptMetadata,
  ChatMessage,
  AdaptOptions,
  ObjectConfig,
  PromptShape,
  PromptKey
} from "@puzzlet/agentmark";
import type {
  LanguageModel,
  ImageModel, 
  generateText,
  Schema,
} from "ai";
import { jsonSchema } from "ai";

type AITextParams = Parameters<typeof generateText>[0];
type RequiredAITextParams = Pick<AITextParams, 'model' | 'messages'>;
type TextResult = RequiredAITextParams & Partial<Omit<AITextParams, 'model' | 'messages'>>;

export interface AIObjectParams<T> {
  model: LanguageModel;
  messages: ChatMessage[];
  schema: Schema<T>;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  schemaName?: string;
  schemaDescription?: string;
  experimental_telemetry?: any;
}

export interface AIImageParams {
  model: ImageModel;
  prompt: string;
  n?: number;
  size?: `${number}x${number}`;
  aspectRatio?: `${number}:${number}`;
  seed?: number;
}

export type Tool = (args: any) => any;

export type ModelFunctionCreator = (modelName: string, options?: AdaptOptions) => LanguageModel | ImageModel;

interface ModelRegistry {
  getModelFunction(modelName: string): ModelFunctionCreator;
  registerModels(modelPattern: string | RegExp, creator: ModelFunctionCreator): void;
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

export class AIToolRegistry {
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

export class AIModelRegistry {
  private exactMatches: Record<string, ModelFunctionCreator> = {};
  private patternMatches: Array<[RegExp, ModelFunctionCreator]> = [];
  private defaultCreator?: ModelFunctionCreator;

  constructor(defaultCreator?: ModelFunctionCreator) {
    this.defaultCreator = defaultCreator;
  }

  registerModels(modelPattern: string | RegExp | Array<string>, creator: ModelFunctionCreator): void {
    if (typeof modelPattern === 'string') {
      this.exactMatches[modelPattern] = creator;
    } else if (Array.isArray(modelPattern)) {
      modelPattern.forEach(model => {
        this.exactMatches[model] = creator;
      });
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

  setDefaultCreator(creator: ModelFunctionCreator): void {
    this.defaultCreator = creator;
  }
}

export class AIAdapter<
  T extends PromptShape<T> = any
> implements Adapter<T> {
  declare readonly __dict: T;

  constructor(
    private modelRegistry: AIModelRegistry,
    private toolRegistry?: AIToolRegistry
  ) {
    this.modelRegistry = modelRegistry;
    this.toolRegistry = toolRegistry;
  }

  adaptText(
    input: TextConfig, 
    options: AdaptOptions, 
    metadata: PromptMetadata
  ): TextResult {
    const { model_name: name, ...settings } = input.text_config;
    const modelCreator = this.modelRegistry.getModelFunction(name);
    const model = modelCreator(name, options) as LanguageModel;

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
              execute: this.toolRegistry?.hasTool(name) ? this.toolRegistry?.getTool(name) : undefined
            }
          ])
        )
      } : {})
    };
  }

  adaptObject<K extends PromptKey<T>>(
    input: ObjectConfig,
    options: AdaptOptions, 
    metadata: PromptMetadata
  ): AIObjectParams<T[K]["output"]> {
    const { model_name: name, ...settings } = input.object_config;
    const modelCreator = this.modelRegistry.getModelFunction(name);
    const model = modelCreator(name, options) as LanguageModel;
    
    return {
      model,
      messages: input.messages,
      schema: jsonSchema(input.object_config.schema),
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

  adaptImage(
    input: ImageConfig, 
    options: AdaptOptions,
  ): AIImageParams {
    const { model_name: name, ...settings } = input.image_config;
    const modelCreator = this.modelRegistry.getModelFunction(name);
    const model = modelCreator(name, options) as ImageModel;
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