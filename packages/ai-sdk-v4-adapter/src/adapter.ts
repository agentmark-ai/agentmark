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
} from "@agentmark-ai/prompt-core";
import type {
  LanguageModel,
  ImageModel,
  Schema,
  Tool,
  SpeechModel,
  TelemetrySettings,
} from "ai";
import { jsonSchema } from "ai";
import { parseMcpUri } from "@agentmark-ai/prompt-core";
import type { McpServers } from "@agentmark-ai/prompt-core";
import { McpServerRegistry } from "./mcp/mcp-server-registry";

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
  experimental_telemetry?: TelemetrySettings;
  maxSteps?: number;
};

export interface VercelAIObjectParams<T, TTools extends Record<string, Tool> = Record<string, Tool>> {
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
  experimental_telemetry?: TelemetrySettings;
  tools?: Record<string, TTools[keyof TTools]>;
  maxSteps?: number;
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

type AIProvider = {
  languageModel?: (modelId: string) => LanguageModel;
  imageModel?: (modelId: string) => ImageModel;
  speechModel?: (modelId: string) => SpeechModel;
};

const getTelemetryConfig = (
  telemetry: AdaptOptions["telemetry"],
  props: Record<string, unknown>,
  promptName: string,
  agentmarkMeta?: Record<string, unknown>
) => {
  return {
    ...telemetry,
    metadata: {
      ...telemetry?.metadata,
      prompt_name: promptName,
      props: JSON.stringify(props),
      ...(agentmarkMeta ? { ...agentmarkMeta } : {}),
    },
  };
};

export class VercelAIModelRegistry {
  private exactMatches: Record<string, ModelFunctionCreator> = {};
  private patternMatches: Array<[RegExp, ModelFunctionCreator]> = [];
  private defaultCreator?: ModelFunctionCreator;
  private providers: Record<string, AIProvider> = {};

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

  registerProviders(providers: Record<string, AIProvider>): this {
    Object.assign(this.providers, providers);
    return this;
  }

  getModelFunction(
    modelName: string,
    modelType?: "languageModel" | "imageModel" | "speechModel"
  ): ModelFunctionCreator {
    // 1. Exact match (highest priority)
    if (this.exactMatches[modelName]) {
      return this.exactMatches[modelName];
    }

    // 2. Pattern match
    for (const [pattern, creator] of this.patternMatches) {
      if (pattern.test(modelName)) {
        return creator;
      }
    }

    // 3. Provider auto-resolution (if model name contains "/")
    if (modelName.includes("/")) {
      const slashIndex = modelName.indexOf("/");
      const providerName = modelName.substring(0, slashIndex);
      const modelId = modelName.substring(slashIndex + 1);

      if (!providerName || !modelId) {
        throw new Error(
          `Invalid model name format: '${modelName}'. Expected 'provider/model'.`
        );
      }

      const provider = this.providers[providerName];
      if (!provider) {
        throw new Error(
          `Provider '${providerName}' is not registered. Add .registerProviders({ ${providerName} }) to your model registry.`
        );
      }

      const type = modelType ?? "languageModel";
      const factory = provider[type];
      if (typeof factory !== "function") {
        throw new Error(
          `Provider '${providerName}' does not support ${type} models. The model '${modelName}' cannot be created as a ${type}.`
        );
      }

      const boundFactory = (factory as (modelId: string) => LanguageModel).bind(provider);
      return () => boundFactory(modelId);
    }

    // 4. Default creator
    if (this.defaultCreator) {
      return this.defaultCreator;
    }

    // 5. Error
    throw new Error(
      `No model function found for: '${modelName}'. Register it with .registerModels() or use provider/model format with .registerProviders().`
    );
  }
}

export class VercelAIAdapter<
  T extends PromptShape<T>,
  TTools extends Record<string, Tool> = Record<string, Tool>
> {
  declare readonly __dict: T;
  readonly __name = "vercel-ai-v4";

  private readonly tools: TTools | undefined;
  private readonly mcpRegistry: McpServerRegistry;

  constructor(
    private modelRegistry: VercelAIModelRegistry,
    tools?: TTools,
    mcpServers?: McpServers
  ) {
    this.modelRegistry = modelRegistry;
    this.tools = tools;
    this.mcpRegistry = new McpServerRegistry();
    if (mcpServers) {
      this.mcpRegistry.registerServers(mcpServers);
    }
  }

  private async resolveTools(
    toolNames: string[]
  ): Promise<Record<string, TTools[keyof TTools]>> {
    const toolsObj: Record<string, TTools[keyof TTools]> = {};

    for (const toolName of toolNames) {
      if (toolName.startsWith("mcp://")) {
        const { server, tool } = parseMcpUri(toolName);
        if (tool === "*") {
          const allTools = await this.mcpRegistry.getAllTools(server);
          for (const [name, toolImpl] of Object.entries(allTools)) {
            // MCP tools bypass TTools compile-time constraints; they are dynamically typed
            // and trusted from the registry without schema validation at runtime.
            toolsObj[name] = toolImpl as unknown as TTools[keyof TTools];
          }
          continue;
        }
        const resolvedTool = await this.mcpRegistry.getTool(server, tool);
        // MCP tools bypass TTools compile-time constraints; dynamically typed from registry.
        toolsObj[tool] = resolvedTool as unknown as TTools[keyof TTools];
        continue;
      }

      if (this.tools && toolName in this.tools) {
        toolsObj[toolName] = this.tools[toolName] as TTools[keyof TTools];
      } else {
        const available = this.tools ? Object.keys(this.tools).join(", ") : "(none)";
        throw new Error(
          `Tool '${toolName}' referenced in prompt config was not found in the provided tools record. Available tools: ${available}`
        );
      }
    }

    return toolsObj;
  }

  async adaptText<_K extends KeysWithKind<T, "text"> & string>(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<VercelAITextParams<TTools>> {
    const { model_name: name, ...settings } = input.text_config;
    const modelCreator = this.modelRegistry.getModelFunction(name, "languageModel");
    const model = modelCreator(name, options) as LanguageModel;

    const toolsObj = input.text_config.tools
      ? await this.resolveTools(input.text_config.tools as string[])
      : {} as Record<string, TTools[keyof TTools]>;

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
      tools: toolsObj as unknown as TTools,
    };
  }

  async adaptObject<K extends KeysWithKind<T, "object"> & string>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<VercelAIObjectParams<T[K]["output"], TTools>> {
    const { model_name: name, ...settings } = input.object_config;
    const modelCreator = this.modelRegistry.getModelFunction(name, "languageModel");
    const model = modelCreator(name, options) as LanguageModel;

    const toolsObj = input.object_config.tools
      ? await this.resolveTools(input.object_config.tools as string[])
      : undefined;

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
      ...(settings?.max_calls !== undefined
        ? { maxSteps: settings.max_calls }
        : toolsObj
          ? { maxSteps: 10 }
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
      ...(toolsObj ? { tools: toolsObj } : {}),
    };
  }

  adaptImage<_K extends KeysWithKind<T, "image"> & string>(
    input: ImageConfig,
    options: AdaptOptions
  ): VercelAIImageParams {
    const { model_name: name, ...settings } = input.image_config;
    const modelCreator = this.modelRegistry.getModelFunction(name, "imageModel");
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
    const modelCreator = this.modelRegistry.getModelFunction(name, "speechModel");
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
