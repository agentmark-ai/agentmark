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
import {
  VercelAIModelRegistry as SharedVercelAIModelRegistry,
  VercelAIAdapterCore,
  type VercelAdapterSpec,
  type ModelFunctionCreator as SharedModelFunctionCreator,
} from "@agentmark-ai/ai-sdk-shared";

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

type VercelModel = LanguageModel | ImageModel | SpeechModel;

export type ModelFunctionCreator = SharedModelFunctionCreator<VercelModel>;

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

/**
 * Concretely-typed registry for AI SDK v5 models. The implementation lives
 * in `@agentmark-ai/ai-sdk-shared` (version-agnostic, consumed as a regular
 * dependency so its types resolve for consumers too); this subclass pins
 * `TModel` to v5's model union so the public typing is unchanged from when
 * the class body lived here.
 */
export class VercelAIModelRegistry extends SharedVercelAIModelRegistry<VercelModel> {}

/**
 * v5's deltas from the shared adapter core: `max_calls` becomes
 * `stopWhen: stepCountIs(n)`, messages convert to `ModelMessage[]`, and MCP
 * clients come from `@ai-sdk/mcp`. Everything else lives in
 * {@link VercelAIAdapterCore}.
 */
const V5_SPEC: VercelAdapterSpec<Tool> = {
  mcpClientFactory: vercelMcpClientFactory,
  maxCallsEntry: { key: "stopWhen", transform: (v: number) => stepCountIs(v) },
  jsonSchema: (schema) => jsonSchema(schema as Parameters<typeof jsonSchema>[0]),
  convertMessages,
};

export class VercelAIAdapter<
  T extends PromptShape<T>,
  TTools extends Record<string, Tool> = Record<string, Tool>
> extends VercelAIAdapterCore<Tool, VercelModel> {
  declare readonly __dict: T;
  readonly __name = "vercel-ai-v5";

  // Type-only narrowing of the shared core's `unknown` returns to v5's
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
    super(V5_SPEC, modelRegistry, tools as Record<string, Tool> | undefined, mcpServers);
  }
}
