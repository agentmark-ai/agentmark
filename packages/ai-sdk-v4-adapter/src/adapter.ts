import type {
  TextConfig,
  ImageConfig,
  PromptMetadata,
  RichChatMessage,
  AdaptOptions,
  ObjectConfig,
  PromptShape,
  KeysWithKind,
  SpeechConfig,
} from "@agentmark/prompt-core";
import type {
  LanguageModel,
  ImageModel,
  Schema,
  Tool,
  ToolExecutionOptions,
  SpeechModel,
} from "ai";
import { jsonSchema } from "ai";
import { parseMcpUri } from "@agentmark/prompt-core";
import { McpServerRegistry } from "./mcp/mcp-server-registry";

type ToolRet<R> = R extends { __tools: { output: infer O } } ? O : never;

type ToolWithExec<R> = Omit<Tool<any, R>, "execute" | "type"> & {
  type?: undefined | "function";
  execute: (args: any, options: ToolExecutionOptions) => Promise<R>;
};

type ToolSetMap<O extends Record<string, any>> = {
  [K in keyof O]: ToolWithExec<O[K]>;
};

export type VercelAITextParams<TS extends Record<string, Tool>> = {
  model: LanguageModel;
  messages: RichChatMessage[];
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
  maxSteps?: number;
};

export interface VercelAIObjectParams<T> {
  output?: 'object';
  model: LanguageModel;
  messages: RichChatMessage[];
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

export interface VercelAISpeechParams {
  model: SpeechModel;
  text: string;
  voice?: string;
  outputFormat?: string;
  instructions?: string;
  speed?: number;
}

export type ModelFunctionCreator = (
  modelName: string,
  options?: AdaptOptions
) => LanguageModel | ImageModel | SpeechModel;

const getTelemetryConfig = (
  telemetry: AdaptOptions["telemetry"],
  props: Record<string, any>,
  promptName: string,
  agentmarkMeta?: Record<string, any>
) => {
  return {
    ...telemetry,
    metadata: {
      ...telemetry?.metadata,
      prompt: promptName,
      props: JSON.stringify(props),
      ...(agentmarkMeta ? { ...agentmarkMeta } : {}),
    },
  };
};

type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? B[K]
    : K extends keyof A
    ? A[K]
    : never;
};

export class VercelAIToolRegistry<
  TD extends { [K in keyof TD]: { args: any } },
  RM extends Partial<Record<keyof TD, any>> = Partial<Record<keyof TD, any>>
> {
  declare readonly __tools: { input: TD; output: RM };

  private map: {
    [K in keyof TD]?: (
      args: TD[K]["args"],
      toolContext?: Record<string, any>
    ) => any;
  } = {};

  register<K extends keyof TD, R>(
    name: K,
    fn: (args: TD[K]["args"], toolContext?: Record<string, any>) => R
  ): VercelAIToolRegistry<TD, Merge<RM, { [P in K]: R }>> {
    this.map[name] = fn;
    return this as unknown as VercelAIToolRegistry<
      TD,
      Merge<RM, { [P in K]: R }>
    >;
  }

  get<K extends keyof TD & keyof RM>(name: K) {
    return this.map[name] as (
      args: TD[K]["args"],
      toolContext?: Record<string, any>
    ) => RM[K];
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

  registerModels(
    modelPattern: string | RegExp | Array<string>,
    creator: ModelFunctionCreator
  ): this {
    if (typeof modelPattern === "string") {
      this.exactMatches[modelPattern] = creator;
    } else if (Array.isArray(modelPattern)) {
      modelPattern.forEach((model) => {
        this.exactMatches[model] = creator;
      });
    } else {
      this.patternMatches.push([modelPattern, creator]);
    }
    return this;
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
}

export class VercelAIAdapter<
  T extends PromptShape<T>,
  R extends VercelAIToolRegistry<any, any> = VercelAIToolRegistry<any, any>
> {
  declare readonly __dict: T;
  readonly __name = "vercel-ai-v4";

  private readonly toolsRegistry: R | undefined;
  private readonly mcpRegistry: McpServerRegistry;

  constructor(
    private modelRegistry: VercelAIModelRegistry,
    toolRegistry?: R,
    mcpRegistry?: McpServerRegistry
  ) {
    this.modelRegistry = modelRegistry;
    this.toolsRegistry = toolRegistry;
    this.mcpRegistry = mcpRegistry ?? new McpServerRegistry();
  }

  async adaptText<_K extends KeysWithKind<T, "text"> & string>(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<VercelAITextParams<ToolSetMap<ToolRet<R>>>> {
    const { model_name: name, ...settings } = input.text_config;
    const modelCreator = this.modelRegistry.getModelFunction(name);
    const model = modelCreator(name, options) as LanguageModel;

    type Ret = ToolRet<R>;

    let toolsObj: ToolSetMap<Ret> | undefined;

    if (input.text_config.tools) {
      toolsObj = {} as ToolSetMap<Ret>;

      for (const [keyAny, defAny] of Object.entries(input.text_config.tools)) {
        const key = keyAny as keyof Ret;

        if (typeof defAny === "string") {
          if (defAny.startsWith("mcp://")) {
            const { server, tool } = parseMcpUri(defAny);
            if (tool === "*") {
              const allTools = await this.mcpRegistry.getAllTools(server);
              for (const [toolName, toolImpl] of Object.entries(allTools)) {
                (toolsObj as any)[toolName] = toolImpl as any;
              }
              continue;
            }
            const resolvedTool = await this.mcpRegistry.getTool(server, tool);
            (toolsObj as any)[key] = resolvedTool as any;
            continue;
          }
          throw new Error(
            `Invalid tool entry for '${String(
              key
            )}': expected MCP URI string or inline tool definition`
          );
        }

        const def = defAny as { description?: string; parameters: Record<string, any> };

        const impl = this.toolsRegistry?.has(key)
          ? this.toolsRegistry.get(key)
          : (_: any) =>
              Promise.reject(new Error(`Tool ${String(key)} not registered`));

        (toolsObj as any)[key] = {
          parameters: jsonSchema(def.parameters),
          description: def.description ?? "",
          execute: ((args) => impl(args, options.toolContext)) as ToolWithExec<
            Ret[typeof key]
          >["execute"],
        } satisfies ToolWithExec<Ret[typeof key]>;
      }
    }

    return {
      model,
      messages: input.messages,
      ...(settings?.temperature !== undefined
        ? { temperature: settings.temperature }
        : {}),
      ...(settings?.max_tokens !== undefined
        ? { maxTokens: settings.max_tokens }
        : {}),
      ...(settings?.top_p !== undefined ? { topP: settings.top_p } : {}),
      ...(settings?.top_k !== undefined ? { topK: settings.top_k } : {}),
      ...(settings?.frequency_penalty !== undefined
        ? { frequencyPenalty: settings.frequency_penalty }
        : {}),
      ...(settings?.presence_penalty !== undefined
        ? { presencePenalty: settings.presence_penalty }
        : {}),
      ...(settings?.stop_sequences !== undefined
        ? { stopSequences: settings.stop_sequences }
        : {}),
      ...(settings?.seed !== undefined ? { seed: settings.seed } : {}),
      ...(settings?.max_calls !== undefined
        ? { maxSteps: settings.max_calls }
        : {}),
      ...(options.telemetry
        ? {
            experimental_telemetry: getTelemetryConfig(
              options.telemetry,
              metadata.props,
              input.name,
              input.agentmark_meta
            ),
          }
        : {}),
      tools: toolsObj ?? ({} as ToolSetMap<Ret>),
    };
  }

  adaptObject<K extends KeysWithKind<T, "object"> & string>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): VercelAIObjectParams<T[K]["output"]> {
    const { model_name: name, ...settings } = input.object_config;
    const modelCreator = this.modelRegistry.getModelFunction(name);
    const model = modelCreator(name, options) as LanguageModel;

    return {
      output: 'object' as const,
      model,
      messages: input.messages,
      schema: jsonSchema(input.object_config.schema),
      ...(settings?.temperature !== undefined
        ? { temperature: settings.temperature }
        : {}),
      ...(settings?.max_tokens !== undefined
        ? { maxTokens: settings.max_tokens }
        : {}),
      ...(settings?.top_p !== undefined ? { topP: settings.top_p } : {}),
      ...(settings?.top_k !== undefined ? { topK: settings.top_k } : {}),
      ...(settings?.frequency_penalty !== undefined
        ? { frequencyPenalty: settings.frequency_penalty }
        : {}),
      ...(settings?.presence_penalty !== undefined
        ? { presencePenalty: settings.presence_penalty }
        : {}),
      ...(settings?.seed !== undefined ? { seed: settings.seed } : {}),
      ...(settings?.schema_name !== undefined
        ? { schemaName: settings.schema_name }
        : {}),
      ...(settings?.schema_description !== undefined
        ? { schemaDescription: settings.schema_description }
        : {}),
      ...(options.telemetry
        ? {
            experimental_telemetry: getTelemetryConfig(
              options.telemetry,
              metadata.props,
              input.name,
              input.agentmark_meta
            ),
          }
        : {}),
    };
  }

  adaptImage<_K extends KeysWithKind<T, "image"> & string>(
    input: ImageConfig,
    options: AdaptOptions
  ): VercelAIImageParams {
    const { model_name: name, ...settings } = input.image_config;
    const modelCreator = this.modelRegistry.getModelFunction(name);
    const model = modelCreator(name, options) as ImageModel;

    return {
      model,
      prompt: settings.prompt,
      ...(settings?.num_images !== undefined ? { n: settings.num_images } : {}),
      ...(settings?.size !== undefined
        ? { size: settings.size as `${number}x${number}` }
        : {}),
      ...(settings?.aspect_ratio !== undefined
        ? { aspectRatio: settings.aspect_ratio as `${number}:${number}` }
        : {}),
      ...(settings?.seed !== undefined ? { seed: settings.seed } : {}),
    };
  }

  adaptSpeech<_K extends KeysWithKind<T, "speech"> & string>(
    input: SpeechConfig,
    options: AdaptOptions
  ): VercelAISpeechParams {
    const { model_name: name, ...settings } = input.speech_config;
    const modelCreator = this.modelRegistry.getModelFunction(name);
    const model = modelCreator(name, options) as SpeechModel;

    return {
      model,
      text: settings.text,
      ...(settings?.voice !== undefined ? { voice: settings.voice } : {}),
      ...(settings?.output_format !== undefined
        ? { outputFormat: settings.output_format }
        : {}),
      ...(settings?.instructions !== undefined
        ? { instructions: settings.instructions }
        : {}),
      ...(settings?.speed !== undefined ? { speed: settings.speed } : {}),
    };
  }
}
