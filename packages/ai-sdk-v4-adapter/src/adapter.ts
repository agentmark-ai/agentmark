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
  McpClientFactory,
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
  TelemetrySettings,
} from "ai";
import { jsonSchema } from "ai";
import {
  VercelAIModelRegistry as SharedVercelAIModelRegistry,
  type ModelFunctionCreator as SharedModelFunctionCreator,
} from "@agentmark-ai/ai-sdk-shared";

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
  output?: "object";
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

type VercelModel = LanguageModel | ImageModel | SpeechModel;

export type ModelFunctionCreator = SharedModelFunctionCreator<VercelModel>;

const TEXT_PARAM_MAP: ParamMap = {
  temperature: "temperature",
  max_tokens: "maxTokens",
  top_p: "topP",
  top_k: "topK",
  frequency_penalty: "frequencyPenalty",
  presence_penalty: "presencePenalty",
  stop_sequences: "stopSequences",
  seed: "seed",
  max_calls: "maxSteps",
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

const vercelV4McpClientFactory: McpClientFactory<Tool> = async (cfg) => {
  if ("url" in cfg) {
    const { experimental_createMCPClient } = await import("ai");
    const client = await experimental_createMCPClient({
      transport: { type: "sse", url: cfg.url, headers: cfg.headers },
    });
    return client as { tools(): Promise<Record<string, Tool>> };
  }
  const { Experimental_StdioMCPTransport } = await import(
    "ai/mcp-stdio"
  );
  const { experimental_createMCPClient } = await import("ai");
  const transport = new Experimental_StdioMCPTransport({
    command: cfg.command,
    args: cfg.args,
    cwd: cfg.cwd,
    env: cfg.env,
  });
  const client = await experimental_createMCPClient({ transport });
  return client as { tools(): Promise<Record<string, Tool>> };
};

/**
 * Concretely-typed registry for AI SDK v4 models. The implementation lives
 * in `@agentmark-ai/ai-sdk-shared` (version-agnostic, bundled at build
 * time); this subclass pins `TModel` to v4's model union so the public
 * typing is unchanged from when the class body lived here.
 */
export class VercelAIModelRegistry extends SharedVercelAIModelRegistry<VercelModel> {}

export class VercelAIAdapter<
  T extends PromptShape<T>,
  TTools extends Record<string, Tool> = Record<string, Tool>
> extends BaseAdapter<Tool> {
  declare readonly __dict: T;
  readonly __name = "vercel-ai-v4";

  constructor(
    private modelRegistry: VercelAIModelRegistry,
    tools?: TTools,
    mcpServers?: McpServers
  ) {
    super(vercelV4McpClientFactory, tools as Record<string, Tool> | undefined, mcpServers);
  }

  async adaptText(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<VercelAITextParams<TTools>> {
    const { model_name: name, ...settings } = input.text_config;
    const modelCreator = this.modelRegistry.getModelFunction(name, "languageModel");
    const model = modelCreator(name, options) as LanguageModel;

    const toolsObj = (input.text_config.tools
      ? await this.resolveTools(input.text_config.tools as string[])
      : {}) as Record<string, TTools[keyof TTools]>;

    const mapped = applyParamMap(settings as Record<string, unknown>, TEXT_PARAM_MAP);
    const telemetry = buildTelemetryMetadata(
      options.telemetry,
      metadata.props,
      input.name,
      input.agentmark_meta
    );

    return {
      model,
      messages: input.messages,
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
    if (toolsObj && settings?.max_calls === undefined) {
      mapped.maxSteps = 10;
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
      messages: input.messages,
      schema: jsonSchema(input.object_config.schema),
      ...mapped,
      ...(telemetry ? { experimental_telemetry: telemetry } : {}),
      ...(toolsObj ? { tools: toolsObj } : {}),
    };
  }

  adaptImage(
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
    return { model, ...mapped } as VercelAIImageParams;
  }

  adaptSpeech(
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
    return { model, ...mapped } as VercelAISpeechParams;
  }
}
