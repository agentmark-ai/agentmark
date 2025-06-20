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
import { z } from "zod";

// Type definitions for Mastra interfaces (avoid importing during tests)
export interface MastraAgent {
  name: string;
  instructions?: string;
  model?: any;
  generate?: (messages: any[]) => Promise<any>;
  stream?: (messages: any[]) => AsyncIterable<any>;
}

export interface MastraTool {
  id: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
  outputSchema?: z.ZodSchema<any>;
  execute: (args: { context: any }) => Promise<any>;
}

// Factory function type for creating tools
export type ToolFactory = (config: {
  id: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
  execute: (args: { context: any }) => Promise<any>;
}) => MastraTool;

type ToolRet<R> = R extends { __tools: { output: infer O } } ? O : never;

type ToolWithExec<R> = {
  id: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
  outputSchema?: z.ZodSchema<R>;
  execute: (args: any) => Promise<R>;
};

type ToolSetMap<O extends Record<string, any>> = {
  [K in keyof O]: ToolWithExec<O[K]>;
};

export type MastraTextParams<TS extends Record<string, any>> = {
  agent: MastraAgent;
  messages: RichChatMessage[];
  tools?: TS;
};

export interface MastraObjectParams<T> {
  agent: MastraAgent;
  messages: RichChatMessage[];
  schema: z.ZodSchema<T>;
  schemaName?: string;
  schemaDescription?: string;
}

export interface MastraImageParams {
  agent: MastraAgent;
  prompt: string;
  n?: number;
  size?: `${number}x${number}`;
  aspectRatio?: `${number}:${number}`;
  seed?: number;
}

export interface MastraSpeechParams {
  agent: MastraAgent;
  text: string;
  voice?: string;
  outputFormat?: string;
  instructions?: string;
  speed?: number;
}

export type AgentFunction = (
  name: string,
  instructions: string,
  model: any,
  options?: AdaptOptions
) => MastraAgent;

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

export class MastraAgentRegistry {
  private exactMatches: Record<string, AgentFunction> = {};
  private patternMatches: Array<[RegExp, AgentFunction]> = [];
  private defaultCreator?: AgentFunction;

  constructor(defaultCreator?: AgentFunction) {
    this.defaultCreator = defaultCreator;
  }

  registerAgents(
    agentPattern: string | RegExp | Array<string>,
    creator: AgentFunction
  ): void {
    if (typeof agentPattern === "string") {
      this.exactMatches[agentPattern] = creator;
    } else if (Array.isArray(agentPattern)) {
      agentPattern.forEach((agent) => {
        this.exactMatches[agent] = creator;
      });
    } else {
      this.patternMatches.push([agentPattern, creator]);
    }
  }

  getAgentFunction(agentName: string): AgentFunction {
    if (this.exactMatches[agentName]) {
      return this.exactMatches[agentName];
    }

    for (const [pattern, creator] of this.patternMatches) {
      if (pattern.test(agentName)) {
        return creator;
      }
    }

    if (this.defaultCreator) {
      return this.defaultCreator;
    }

    throw new Error(`No agent function found for: ${agentName}`);
  }

  setDefaultCreator(creator: AgentFunction): void {
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
  private readonly toolFactory: ToolFactory;

  constructor(
    private agentRegistry: MastraAgentRegistry, 
    toolRegistry?: R,
    toolFactory?: ToolFactory
  ) {
    this.agentRegistry = agentRegistry;
    this.toolsRegistry = toolRegistry;
    this.toolFactory = toolFactory || this.defaultToolFactory;
  }

  // Default tool factory for testing
  private defaultToolFactory: ToolFactory = (config) => ({
    id: config.id,
    description: config.description,
    inputSchema: config.inputSchema,
    execute: config.execute,
  });

  adaptText<K extends KeysWithKind<T, "text"> & string>(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): MastraTextParams<ToolSetMap<ToolRet<R>>> {
    const { model_name: name, ...settings } = input.text_config;
    const agentCreator = this.agentRegistry.getAgentFunction(name);
    
    // Create agent with basic configuration
    const agent = agentCreator(
      `Agent for ${input.name}`,
      `You are an AI assistant handling: ${input.name}`,
      null, // Let the agent creator handle the model
      options
    );

    type Ret = ToolRet<R>;
    let toolsObj: ToolSetMap<Ret> | undefined;

    if (input.text_config.tools) {
      toolsObj = {} as ToolSetMap<Ret>;

      for (const [keyAny, def] of Object.entries(input.text_config.tools)) {
        const key = keyAny as keyof Ret;

        const impl = this.toolsRegistry?.has(key)
          ? this.toolsRegistry.get(key)
          : (_: any) =>
              Promise.reject(new Error(`Tool ${String(key)} not registered`));

        (toolsObj as any)[key] = this.toolFactory({
          id: String(key),
          description: def.description ?? "",
          inputSchema: z.object(def.parameters as any),
          execute: async ({ context }) => impl(context, options.toolContext),
        }) as ToolWithExec<Ret[typeof key]>;
      }
    }

    return {
      agent,
      messages: input.messages,
      tools: toolsObj ?? ({} as ToolSetMap<Ret>),
    };
  }

  adaptObject<K extends KeysWithKind<T, "object"> & string>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): MastraObjectParams<T[K]["output"]> {
    const { model_name: name, ...settings } = input.object_config;
    const agentCreator = this.agentRegistry.getAgentFunction(name);
    
    const agent = agentCreator(
      `Object Agent for ${input.name}`,
      `You are an AI assistant that returns structured output for: ${input.name}`,
      null,
      options
    );

    return {
      agent,
      messages: input.messages,
      schema: z.object(input.object_config.schema as any),
      ...(settings?.schema_name !== undefined
        ? { schemaName: settings.schema_name }
        : {}),
      ...(settings?.schema_description !== undefined
        ? { schemaDescription: settings.schema_description }
        : {}),
    };
  }

  adaptImage<K extends KeysWithKind<T, "image"> & string>(
    input: ImageConfig,
    options: AdaptOptions
  ): MastraImageParams {
    const { model_name: name, ...settings } = input.image_config;
    const agentCreator = this.agentRegistry.getAgentFunction(name);
    
    const agent = agentCreator(
      `Image Agent for ${input.name}`,
      `You are an AI assistant that generates images for: ${input.name}`,
      null,
      options
    );

    return {
      agent,
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
    const agentCreator = this.agentRegistry.getAgentFunction(name);
    
    const agent = agentCreator(
      `Speech Agent for ${input.name}`,
      `You are an AI assistant that handles speech for: ${input.name}`,
      null,
      options
    );

    return {
      agent,
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