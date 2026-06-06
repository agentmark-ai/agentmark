import type {
  TextConfig,
  ImageConfig,
  ObjectConfig,
  SpeechConfig,
  PromptMetadata,
  RichChatMessage,
  AdaptOptions,
  McpServers,
  McpClientFactory,
  ParamMap,
  ParamMapEntry,
} from "@agentmark-ai/prompt-core";
import {
  BaseAdapter,
  applyParamMap,
  buildTelemetryMetadata,
} from "@agentmark-ai/prompt-core";
import type { VercelAIModelRegistry } from "./model-registry";

/**
 * Version-agnostic adapter core shared by the v4 and v5 adapters.
 *
 * The four adapt-method bodies were previously duplicated verbatim (~200 LOC)
 * across both adapters; the real deltas between AI SDK majors are tiny and
 * are injected via {@link VercelAdapterSpec} — the same pattern
 * `createVercelExecutor` uses with `ChunkAdapter`. Like the executor factory
 * and model registry, this module takes no type-level dependency on either
 * `ai` major: SDK helpers (`jsonSchema`) and SDK-typed callbacks come in
 * through the spec, and the concrete param types stay in the version-pinned
 * adapter packages.
 */
export interface VercelAdapterSpec<TTool> {
  /** Boots an MCP client against this major's MCP entrypoint. */
  mcpClientFactory: McpClientFactory<TTool>;
  /**
   * ParamMap entry for AgentMark's `max_calls`:
   * v4 → `"maxSteps"`, v5 → `{ key: "stopWhen", transform: stepCountIs }`.
   * The default for tool-bearing object prompts (10) flows through this same
   * entry, so each major expresses the default in its own vocabulary.
   */
  maxCallsEntry: Extract<ParamMapEntry, string | { key: string; transform: (value: any) => unknown }>;
  /** The SDK's `jsonSchema()` helper (this package never imports `ai`). */
  jsonSchema: (schema: unknown) => unknown;
  /**
   * Convert AgentMark messages to the SDK's message type. v4 passes
   * `RichChatMessage[]` through untouched; v5 maps to `ModelMessage[]`.
   */
  convertMessages?: (messages: RichChatMessage[]) => unknown;
}

const BASE_TEXT_PARAM_MAP: ParamMap = {
  temperature: "temperature",
  max_tokens: "maxTokens",
  top_p: "topP",
  top_k: "topK",
  frequency_penalty: "frequencyPenalty",
  presence_penalty: "presencePenalty",
  stop_sequences: "stopSequences",
  seed: "seed",
};

const OBJECT_EXTRA_PARAM_MAP: ParamMap = {
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

/** Apply a ParamMapEntry to a single value (used for the max_calls default). */
function applyEntry(
  mapped: Record<string, unknown>,
  entry: VercelAdapterSpec<unknown>["maxCallsEntry"],
  value: number
): void {
  if (typeof entry === "string") {
    mapped[entry] = value;
    return;
  }
  mapped[entry.key] = entry.transform(value);
}

/**
 * Shared implementation of the four `Adapter` methods for Vercel AI SDK
 * majors. Subclasses pin the SDK's tool/model types, set `__name`, and
 * (optionally) re-declare the adapt methods with concretely-typed returns —
 * the bodies live here so a fix lands in both majors at once.
 */
export abstract class VercelAIAdapterCore<
  TTool,
  TModel = unknown
> extends BaseAdapter<TTool> {
  private readonly spec: VercelAdapterSpec<TTool>;
  private readonly textParamMap: ParamMap;
  private readonly objectParamMap: ParamMap;

  constructor(
    spec: VercelAdapterSpec<TTool>,
    protected readonly modelRegistry: VercelAIModelRegistry<TModel>,
    tools?: Record<string, TTool>,
    mcpServers?: McpServers
  ) {
    super(spec.mcpClientFactory, tools, mcpServers);
    this.spec = spec;
    this.textParamMap = { ...BASE_TEXT_PARAM_MAP, max_calls: spec.maxCallsEntry };
    this.objectParamMap = { ...this.textParamMap, ...OBJECT_EXTRA_PARAM_MAP };
  }

  private messages(messages: RichChatMessage[]): unknown {
    return this.spec.convertMessages
      ? this.spec.convertMessages(messages)
      : messages;
  }

  async adaptText(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<unknown> {
    const { model_name: name, ...settings } = input.text_config;
    const modelCreator = this.modelRegistry.getModelFunction(name, "languageModel");
    const model = modelCreator(name, options);

    const toolsObj = input.text_config.tools
      ? await this.resolveTools(input.text_config.tools as string[])
      : ({} as Record<string, TTool>);

    const mapped = applyParamMap(
      settings as Record<string, unknown>,
      this.textParamMap
    );
    const telemetry = buildTelemetryMetadata(
      options.telemetry,
      metadata.props,
      input.name,
      input.agentmark_meta
    );

    return {
      model,
      messages: this.messages(input.messages),
      ...mapped,
      ...(telemetry ? { experimental_telemetry: telemetry } : {}),
      tools: toolsObj,
    };
  }

  async adaptObject(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<unknown> {
    const { model_name: name, ...settings } = input.object_config;
    const modelCreator = this.modelRegistry.getModelFunction(name, "languageModel");
    const model = modelCreator(name, options);

    const toolsObj = input.object_config.tools
      ? await this.resolveTools(input.object_config.tools as string[])
      : undefined;

    const mapped = applyParamMap(
      settings as Record<string, unknown>,
      this.objectParamMap
    );
    // Default to 10 steps when tools are present and max_calls is not set —
    // preserves legacy adapter behavior for tool-bearing object prompts.
    if (toolsObj && settings?.max_calls === undefined) {
      applyEntry(mapped, this.spec.maxCallsEntry, 10);
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
      messages: this.messages(input.messages),
      schema: this.spec.jsonSchema(input.object_config.schema),
      ...mapped,
      ...(telemetry ? { experimental_telemetry: telemetry } : {}),
      ...(toolsObj ? { tools: toolsObj } : {}),
    };
  }

  adaptImage(input: ImageConfig, options: AdaptOptions): unknown {
    const { model_name: name, ...settings } = input.image_config;
    const modelCreator = this.modelRegistry.getModelFunction(name, "imageModel");
    const model = modelCreator(name, options);

    const mapped = applyParamMap(
      settings as Record<string, unknown>,
      IMAGE_PARAM_MAP
    );
    return { model, ...mapped };
  }

  adaptSpeech(input: SpeechConfig, options: AdaptOptions): unknown {
    const { model_name: name, ...settings } = input.speech_config;
    const modelCreator = this.modelRegistry.getModelFunction(name, "speechModel");
    const model = modelCreator(name, options);

    const mapped = applyParamMap(
      settings as Record<string, unknown>,
      SPEECH_PARAM_MAP
    );
    return { model, ...mapped };
  }
}
