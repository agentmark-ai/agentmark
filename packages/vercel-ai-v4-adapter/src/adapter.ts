import type {
  TextConfig,
  ImageConfig,
  PromptMetadata,
  ChatMessage,
  AdaptOptions,
  ObjectConfig,
  PromptShape,
  PromptKey
} from "@agentmark/agentmark";
import type {
  LanguageModel,
  ImageModel,
  Schema,
  Tool,
  ToolExecutionOptions,
} from "ai";
import { jsonSchema } from "ai";


type ArgOf<X> = X extends { args: infer A } ? A : never;

type ToolArgs<R> =
  R extends { __tools: { input: infer I } }
  ? { [K in keyof I]: ArgOf<I[K]> }
  : never;

type ToolRet<R> =
  R extends { __tools: { output: infer O } } ? O : never;

  type ToolWithExec<R> =
  Omit<Tool<any, R>, 'execute' | 'type'> & {
    type?: undefined | 'function';
    execute: (args: any, options: ToolExecutionOptions) => Promise<R>;
  };

type ToolSetMap<O extends Record<string, any>> = {
  [K in keyof O]: ToolWithExec<O[K]>;
};

export type VercelAITextParams<TS extends Record<string, Tool>> = {
  model: LanguageModel;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stopSequences?: string[];
  tools: TS;
  experimental_telemetry?: any;
};

export interface VercelAIObjectParams<T> {
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

export interface VercelAIImageParams {
  model: ImageModel;
  prompt: string;
  n?: number;
  size?: `${number}x${number}`;
  aspectRatio?: `${number}:${number}`;
  seed?: number;
}

export type ModelFunctionCreator = (modelName: string, options?: AdaptOptions) => LanguageModel | ImageModel;

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

type Merge<A, B> = {
  [K in keyof A | keyof B]:
  K extends keyof B ? B[K]
  : K extends keyof A ? A[K]
  : never;
};

export class VercelAIToolRegistry<
  TD extends { [K in keyof TD]: { args: any } },
  RM extends Partial<Record<keyof TD, any>> = {},
> {
  declare readonly __tools: { input: TD; output: RM };

  private map: { [K in keyof TD]?: (args: TD[K]['args']) => any } = {};

  register<
    K extends keyof TD,
    R,
  >(name: K, fn: (args: TD[K]['args']) => R)
    : VercelAIToolRegistry<TD, Merge<RM, { [P in K]: R }>> {
    this.map[name] = fn;
    return this as unknown as VercelAIToolRegistry<
      TD,
      Merge<RM, { [P in K]: R }>
    >;
  }

  get<K extends keyof TD & keyof RM>(name: K) {
    return this.map[name] as (args: TD[K]['args']) => RM[K];
  }

  has<K extends keyof TD>(name: K): name is K & keyof RM {
    return name in this.map;
  }
}

export class VercelAIModelRegistry {
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

export class VercelAIAdapter<
  T extends PromptShape<T>,
  R extends VercelAIToolRegistry<any, any> = VercelAIToolRegistry<any, any>,
> {
  declare readonly __dict: T;

  private readonly toolsRegistry: R | undefined;

  constructor(
    private modelRegistry: VercelAIModelRegistry,
    toolRegistry?: R,
  ) {
    this.modelRegistry = modelRegistry;
    this.toolsRegistry = toolRegistry;
  }

  adaptText(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata,
  ): VercelAITextParams<ToolSetMap<ToolRet<R>>> {

    const { model_name: name, ...settings } = input.text_config;
    const modelCreator = this.modelRegistry.getModelFunction(name);
    const model = modelCreator(name, options) as LanguageModel;


    type Args = ToolArgs<R>;
    type Ret = ToolRet<R>;

    let toolsObj: ToolSetMap<Ret> | undefined;

    if (input.text_config.tools) {
      toolsObj = {} as ToolSetMap<Ret>;
    
      for (const [keyAny, def] of Object.entries(input.text_config.tools)) {
        const key = keyAny as keyof Ret;
    
        const impl =
          this.toolsRegistry?.has(key)
            ? this.toolsRegistry.get(key)
            : (_: any) => Promise.reject(
                new Error(`Tool ${String(key)} not registered`),
              );
    
        (toolsObj as any)[key] = {
          parameters : jsonSchema(def.parameters),
          description: def.description ?? '',
          execute    : impl as ToolWithExec<Ret[typeof key]>['execute'],
        } satisfies ToolWithExec<Ret[typeof key]>;
      }
    }

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
      tools: toolsObj ?? ({} as ToolSetMap<Ret>),
    };
  }

  adaptObject<K extends PromptKey<T>>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): VercelAIObjectParams<T[K]["output"]> {
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
  ): VercelAIImageParams {
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