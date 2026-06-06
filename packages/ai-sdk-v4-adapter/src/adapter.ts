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
  McpClientFactory,
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
  VercelAIAdapterCore,
  type VercelAdapterSpec,
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

/**
 * v4's deltas from the shared adapter core: `max_calls` maps straight to
 * `maxSteps`, messages pass through unconverted, and MCP clients come from
 * `ai` / `ai/mcp-stdio`. Everything else lives in {@link VercelAIAdapterCore}.
 */
const V4_SPEC: VercelAdapterSpec<Tool> = {
  mcpClientFactory: vercelV4McpClientFactory,
  maxCallsEntry: "maxSteps",
  jsonSchema: (schema) => jsonSchema(schema as Parameters<typeof jsonSchema>[0]),
};

export class VercelAIAdapter<
  T extends PromptShape<T>,
  TTools extends Record<string, Tool> = Record<string, Tool>
> extends VercelAIAdapterCore<Tool, VercelModel> {
  declare readonly __dict: T;
  readonly __name = "vercel-ai-v4";

  // Type-only narrowing of the shared core's `unknown` returns to v4's
  // concrete param types — `declare` emits no runtime wrapper; the bodies
  // live in VercelAIAdapterCore.
  declare adaptText: (
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ) => Promise<VercelAITextParams<TTools>>;

  declare adaptObject: <K extends KeysWithKind<T, "object"> & string>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ) => Promise<VercelAIObjectParams<T[K]["output"], TTools>>;

  declare adaptImage: (
    input: ImageConfig,
    options: AdaptOptions
  ) => VercelAIImageParams;

  declare adaptSpeech: (
    input: SpeechConfig,
    options: AdaptOptions
  ) => VercelAISpeechParams;

  constructor(
    modelRegistry: VercelAIModelRegistry,
    tools?: TTools,
    mcpServers?: McpServers
  ) {
    super(V4_SPEC, modelRegistry, tools as Record<string, Tool> | undefined, mcpServers);
  }
}
