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
} from "@agentmark/agentmark-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Import types - using any for now since we don't have direct types access
type Agent = any;
type Tool = any;

type ToolRet<R> = R extends { __tools: { output: infer O } } ? O : never;

export type MastraTextParams<TS extends Record<string, Tool>> = {
  agent: Agent;
  messages: RichChatMessage[];
  tools?: TS;
  toolsets?: Record<string, TS>;
  experimental_telemetry?: any;
};

export interface MastraObjectParams<T> {
  agent: Agent;
  messages: RichChatMessage[];
  schema: z.ZodSchema<T>;
  schemaName?: string;
  schemaDescription?: string;
  experimental_telemetry?: any;
}

export interface MastraImageParams {
  prompt: string;
  model: any;
  n?: number;
  size?: `${number}x${number}`;
  aspectRatio?: `${number}:${number}`;
  seed?: number;
}

export interface MastraSpeechParams {
  text: string;
  model: any;
  voice?: string;
  outputFormat?: string;
  instructions?: string;
  speed?: number;
}

export type ModelCreator = (
  modelName: string,
  options?: AdaptOptions
) => any;

const getTelemetryConfig = (
  telemetry: AdaptOptions["telemetry"],
  props: Record<string, any>,
  promptName: string
) => {
  return {
    ...telemetry,
    metadata: {
      ...telemetry?.metadata,
      prompt: promptName,
      props: JSON.stringify(props),
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

export class MastraToolRegistry<
  TD extends { [K in keyof TD]: { args: any } },
  RM extends Partial<Record<keyof TD, any>> = {}
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
  ): MastraToolRegistry<TD, Merge<RM, { [P in K]: R }>> {
    this.map[name] = fn;
    return this as unknown as MastraToolRegistry<
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

export class MastraModelRegistry {
  private exactMatches: Record<string, ModelCreator> = {};
  private patternMatches: Array<[RegExp, ModelCreator]> = [];
  private defaultCreator?: ModelCreator;

  constructor(defaultCreator?: ModelCreator) {
    this.defaultCreator = defaultCreator;
  }

  registerModels(
    modelPattern: string | RegExp | Array<string>,
    creator: ModelCreator
  ): void {
    if (typeof modelPattern === "string") {
      this.exactMatches[modelPattern] = creator;
    } else if (Array.isArray(modelPattern)) {
      modelPattern.forEach((model) => {
        this.exactMatches[model] = creator;
      });
    } else {
      this.patternMatches.push([modelPattern, creator]);
    }
  }

  getModelFunction(modelName: string): ModelCreator {
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

  setDefaultCreator(creator: ModelCreator): void {
    this.defaultCreator = creator;
  }
}

export class MastraAdapter<
  T extends PromptShape<T>,
  R extends MastraToolRegistry<any, any> = MastraToolRegistry<any, any>
> {
  declare readonly __dict: T;
  readonly __name = "mastra";

  private readonly toolsRegistry: R | undefined;

  constructor(
    private modelRegistry: MastraModelRegistry,
    private agentRegistry: Record<string, Agent>,
    toolRegistry?: R
  ) {
    this.modelRegistry = modelRegistry;
    this.agentRegistry = agentRegistry;
    this.toolsRegistry = toolRegistry;
  }

  adaptText<K extends KeysWithKind<T, "text"> & string>(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): MastraTextParams<Record<string, Tool>> {
    const { model_name: name } = input.text_config;
    
    // Get or create a Mastra agent for this configuration
    const agent = this.getOrCreateAgent(name, input, options);

    type Ret = ToolRet<R>;
    let toolsObj: Record<string, Tool> | undefined;

    if (input.text_config.tools) {
      toolsObj = {} as Record<string, Tool>;

      for (const [keyAny, def] of Object.entries(input.text_config.tools)) {
        const key = keyAny as keyof Ret;

        const impl = this.toolsRegistry?.has(key)
          ? this.toolsRegistry.get(key)
          : (_: any) =>
              Promise.reject(new Error(`Tool ${String(key)} not registered`));

        // Create the tool and cast to the expected type
        toolsObj[keyAny] = createTool({
          id: String(key),
          description: def.description ?? "",
          inputSchema: z.object(def.parameters),
          execute: async ({ context }) => impl(context, options.toolContext),
        }) as Tool;
      }
    }

    return {
      agent,
      messages: input.messages,
      ...(toolsObj ? { toolsets: { default: toolsObj } } : {}),
      ...(options.telemetry
        ? {
            experimental_telemetry: getTelemetryConfig(
              options.telemetry,
              metadata.props,
              input.name
            ),
          }
        : {}),
    };
  }

  adaptObject<K extends KeysWithKind<T, "object"> & string>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): MastraObjectParams<T[K]["output"]> {
    const { model_name: name } = input.object_config;
    
    // Get or create a Mastra agent for this configuration
    const agent = this.getOrCreateAgent(name, input, options);

    return {
      agent,
      messages: input.messages,
      schema: z.object(input.object_config.schema),
      ...(input.object_config.schema_name !== undefined
        ? { schemaName: input.object_config.schema_name }
        : {}),
      ...(input.object_config.schema_description !== undefined
        ? { schemaDescription: input.object_config.schema_description }
        : {}),
      ...(options.telemetry
        ? {
            experimental_telemetry: getTelemetryConfig(
              options.telemetry,
              metadata.props,
              input.name
            ),
          }
        : {}),
    };
  }

  adaptImage<K extends KeysWithKind<T, "image"> & string>(
    input: ImageConfig,
    options: AdaptOptions
  ): MastraImageParams {
    const { model_name: name, ...settings } = input.image_config;
    const modelCreator = this.modelRegistry.getModelFunction(name);
    const model = modelCreator(name, options);

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

  adaptSpeech<K extends KeysWithKind<T, "speech"> & string>(
    input: SpeechConfig,
    options: AdaptOptions
  ): MastraSpeechParams {
    const { model_name: name, ...settings } = input.speech_config;
    const modelCreator = this.modelRegistry.getModelFunction(name);
    const model = modelCreator(name, options);

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

  private getOrCreateAgent(
    modelName: string,
    input: TextConfig | ObjectConfig,
    options: AdaptOptions
  ): Agent {
    const agentKey = `${input.name}-${modelName}`;
    
    if (this.agentRegistry[agentKey]) {
      return this.agentRegistry[agentKey];
    }

    // Create a new agent with the model and configuration
    const modelCreator = this.modelRegistry.getModelFunction(modelName);
    const model = modelCreator(modelName, options);

    // Convert messages to instructions for the agent
    const systemMessages = input.messages
      .filter(msg => msg.role === 'system')
      .map(msg => typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))
      .join('\n');

    // Dynamic import for Agent to avoid build-time dependency issues
    let Agent: any;
    try {
      Agent = require("@mastra/core").Agent;
    } catch (error) {
      // Fallback - could also use dynamic import()
      throw new Error("@mastra/core is required but not available. Please install @mastra/core.");
    }
    
    const agent = new Agent({
      name: input.name,
      instructions: systemMessages || `You are a helpful AI assistant.`,
      model: model,
    });

    this.agentRegistry[agentKey] = agent;
    return agent;
  }
}