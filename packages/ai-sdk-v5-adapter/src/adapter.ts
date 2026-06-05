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
  McpServers,
  ParamMap,
} from "@agentmark-ai/prompt-core";
import {
  BaseAdapter,
  applyParamMap,
  buildTelemetryMetadata,
} from "@agentmark-ai/prompt-core";
import type {
  LanguageModel,
  ImageModel,
  Schema,
  Tool,
  SpeechModel,
  ModelMessage,
  TelemetrySettings,
  StopCondition,
  ToolSet,
} from "ai";
import { jsonSchema, stepCountIs } from "ai";
import type { McpClientFactory } from "@agentmark-ai/prompt-core";

function convertMessages(messages: RichChatMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role === "system")
      return { role: "system", content: msg.content } as ModelMessage;
    if (msg.role === "assistant")
      return { role: "assistant", content: msg.content } as ModelMessage;
    if (msg.role === "user") {
      if (typeof msg.content === "string")
        return { role: "user", content: msg.content } as ModelMessage;
      const convertedContent = msg.content.map((part) => {
        if (part.type === "file") {
          return {
            type: "file" as const,
            data: part.data,
            mediaType: part.mimeType,
          };
        }
        return part;
      });
      return { role: "user", content: convertedContent } as ModelMessage;
    }
    return msg as ModelMessage;
  });
}

export type VercelAITextParams<TS extends Record<string, Tool>> = {
  model: LanguageModel;
  messages: ModelMessage[];
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
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
};

export interface VercelAIObjectParams<T, TTools extends Record<string, Tool> = Record<string, Tool>> {
  output?: "object";
  model: LanguageModel;
  messages: ModelMessage[];
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
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
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

/**
 * Declarative field map — translates snake_case AgentMark config to the
 * camelCase keys AI SDK v5 expects. Centralizes all rename logic that the
 * legacy adapter scattered across 30 lines of `...(x !== undefined ? {y: x} : {})`.
 */
const TEXT_PARAM_MAP: ParamMap = {
  temperature: "temperature",
  max_tokens: "maxTokens",
  top_p: "topP",
  top_k: "topK",
  frequency_penalty: "frequencyPenalty",
  presence_penalty: "presencePenalty",
  stop_sequences: "stopSequences",
  seed: "seed",
  max_calls: { key: "stopWhen", transform: (v: number) => stepCountIs(v) },
};

const OBJECT_PARAM_MAP: ParamMap = {
  ...TEXT_PARAM_MAP,
  schema_name: "schemaName",
  schema_description: "schemaDescription",
};

const IMAGE_PARAM_MAP: ParamMap = {
  prompt: "prompt",
  num_images: "n",
  size: "size",
  aspect_ratio: "aspectRatio",
  seed: "seed",
};

const SPEECH_PARAM_MAP: ParamMap = {
  text: "text",
  voice: "voice",
  output_format: "outputFormat",
  instructions: "instructions",
  speed: "speed",
};

/**
 * Bootstrap an MCP client for AI SDK v5. Dynamic import lets us keep
 * `@ai-sdk/mcp` as a peer dep so consumers who don't use MCP don't pay
 * the bundle cost.
 */
const vercelMcpClientFactory: McpClientFactory<Tool> = async (cfg) => {
  if ("url" in cfg) {
    const { experimental_createMCPClient } = await import("@ai-sdk/mcp");
    return (await experimental_createMCPClient({
      transport: { type: "sse", url: cfg.url, headers: cfg.headers },
    })) as { tools(): Promise<Record<string, Tool>> };
  }
  const { Experimental_StdioMCPTransport } = await import(
    "@ai-sdk/mcp/mcp-stdio"
  );
  const { experimental_createMCPClient } = await import("@ai-sdk/mcp");
  const transport = new Experimental_StdioMCPTransport({
    command: cfg.command,
    args: cfg.args,
    cwd: cfg.cwd,
    env: cfg.env,
  });
  return (await experimental_createMCPClient({ transport })) as {
    tools(): Promise<Record<string, Tool>>;
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
    if (this.exactMatches[modelName]) return this.exactMatches[modelName];

    for (const [pattern, creator] of this.patternMatches) {
      if (pattern.test(modelName)) return creator;
    }

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

      const boundFactory = (factory as (modelId: string) => LanguageModel).bind(
        provider
      );
      return () => boundFactory(modelId);
    }

    if (this.defaultCreator) return this.defaultCreator;

    throw new Error(
      `No model function found for: '${modelName}'. Register it with .registerModels() or use provider/model format with .registerProviders().`
    );
  }
}

export class VercelAIAdapter<
  T extends PromptShape<T>,
  TTools extends Record<string, Tool> = Record<string, Tool>
> extends BaseAdapter<Tool> {
  declare readonly __dict: T;
  readonly __name = "vercel-ai-v5";

  constructor(
    private modelRegistry: VercelAIModelRegistry,
    tools?: TTools,
    mcpServers?: McpServers
  ) {
    super(vercelMcpClientFactory, tools as Record<string, Tool> | undefined, mcpServers);
  }

  async adaptText<_K extends KeysWithKind<T, "text"> & string>(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<VercelAITextParams<TTools>> {
    const { model_name: name, ...settings } = input.text_config;
    const modelCreator = this.modelRegistry.getModelFunction(name, "languageModel");
    const model = modelCreator(name, options) as LanguageModel;

    const toolsObj = (input.text_config.tools
      ? await this.resolveTools(input.text_config.tools as string[])
      : ({} as Record<string, Tool>)) as Record<string, TTools[keyof TTools]>;

    const mapped = applyParamMap(settings as Record<string, unknown>, TEXT_PARAM_MAP);
    const telemetry = buildTelemetryMetadata(
      options.telemetry,
      metadata.props,
      input.name,
      input.agentmark_meta
    );

    return {
      model,
      messages: convertMessages(input.messages),
      ...mapped,
      ...(telemetry ? { experimental_telemetry: telemetry } : {}),
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
      ? ((await this.resolveTools(
          input.object_config.tools as string[]
        )) as Record<string, TTools[keyof TTools]>)
      : undefined;

    const mapped = applyParamMap(
      settings as Record<string, unknown>,
      OBJECT_PARAM_MAP
    );
    // Default to stepCountIs(10) when tools present and max_calls not set —
    // preserves legacy adapter behavior for tool-bearing object prompts.
    if (toolsObj && settings?.max_calls === undefined) {
      mapped.stopWhen = stepCountIs(10);
    }

    const telemetry = buildTelemetryMetadata(
      options.telemetry,
      metadata.props,
      input.name,
      input.agentmark_meta
    );

    return {
      output: "object" as const,
      model,
      messages: convertMessages(input.messages),
      schema: jsonSchema(input.object_config.schema),
      ...mapped,
      ...(telemetry ? { experimental_telemetry: telemetry } : {}),
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

    const mapped = applyParamMap(
      settings as Record<string, unknown>,
      IMAGE_PARAM_MAP
    );

    return {
      model,
      ...mapped,
    } as VercelAIImageParams;
  }

  adaptSpeech<_K extends KeysWithKind<T, "speech"> & string>(
    input: SpeechConfig,
    options: AdaptOptions
  ): VercelAISpeechParams {
    const { model_name: name, ...settings } = input.speech_config;
    const modelCreator = this.modelRegistry.getModelFunction(name, "speechModel");
    const model = modelCreator(name, options) as SpeechModel;

    const mapped = applyParamMap(
      settings as Record<string, unknown>,
      SPEECH_PARAM_MAP
    );

    return {
      model,
      ...mapped,
    } as VercelAISpeechParams;
  }
}
