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

// Mastra types (using any for now since we don't have direct types access)
type Agent = any;
type Tool = any;

type ToolRet<R> = R extends { __tools: { output: infer O } } ? O : never;

type MastraToolWithExec<R> = {
  description: string;
  inputSchema: z.ZodSchema<any>;
  outputSchema?: z.ZodSchema<R>;
  execute: (args: { context: any }) => Promise<R>;
};

type MastraToolSetMap<O extends Record<string, any>> = {
  [K in keyof O]: MastraToolWithExec<O[K]>;
};

export type MastraTextParams<TS extends Record<string, Tool>> = {
  messages: RichChatMessage[];
  toolsets?: Record<string, TS>;
  temperature?: number;
  maxSteps?: number;
  maxRetries?: number;
  experimental_telemetry?: any;
  context?: any[];
  instructions?: string;
  memory?: {
    thread: string | { id: string; metadata?: Record<string, any>; title?: string };
    resource: string;
    options?: {
      lastMessages?: number | false;
      semanticRecall?: boolean | object;
      workingMemory?: {
        enabled?: boolean;
        template?: string;
      };
      threads?: {
        generateTitle?: boolean;
      };
    };
  };
  telemetry?: {
    isEnabled?: boolean;
    recordInputs?: boolean;
    recordOutputs?: boolean;
    functionId?: string;
    metadata?: Record<string, any>;
    tracer?: any;
  };
};

export interface MastraObjectParams<T> {
  messages: RichChatMessage[];
  output: z.ZodSchema<T>;
  temperature?: number;
  maxSteps?: number;
  maxRetries?: number;
  experimental_telemetry?: any;
  context?: any[];
  instructions?: string;
  memory?: {
    thread: string | { id: string; metadata?: Record<string, any>; title?: string };
    resource: string;
    options?: {
      lastMessages?: number | false;
      semanticRecall?: boolean | object;
      workingMemory?: {
        enabled?: boolean;
        template?: string;
      };
      threads?: {
        generateTitle?: boolean;
      };
    };
  };
  telemetry?: {
    isEnabled?: boolean;
    recordInputs?: boolean;
    recordOutputs?: boolean;
    functionId?: string;
    metadata?: Record<string, any>;
    tracer?: any;
  };
}

export interface MastraImageParams {
  messages: RichChatMessage[];
  instructions?: string;
  temperature?: number;
  context?: any[];
  experimental_telemetry?: any;
}

export interface MastraSpeechParams {
  messages: RichChatMessage[];
  instructions?: string;
  temperature?: number;
  context?: any[];
  experimental_telemetry?: any;
}

export type AgentFunctionCreator = (
  agentName: string,
  options?: AdaptOptions
) => Agent;

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
  private exactMatches: Record<string, AgentFunctionCreator> = {};
  private patternMatches: Array<[RegExp, AgentFunctionCreator]> = [];
  private defaultCreator?: AgentFunctionCreator;

  constructor(defaultCreator?: AgentFunctionCreator) {
    this.defaultCreator = defaultCreator;
  }

  registerAgents(
    agentPattern: string | RegExp | Array<string>,
    creator: AgentFunctionCreator
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

  getAgentFunction(agentName: string): AgentFunctionCreator {
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

  setDefaultCreator(creator: AgentFunctionCreator): void {
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
    private agentRegistry: MastraAgentRegistry,
    toolRegistry?: R
  ) {
    this.agentRegistry = agentRegistry;
    this.toolsRegistry = toolRegistry;
  }

  adaptText<K extends KeysWithKind<T, "text"> & string>(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): MastraTextParams<MastraToolSetMap<ToolRet<R>>> {
    const { model_name: name, ...settings } = input.text_config;
    const agentCreator = this.agentRegistry.getAgentFunction(name);
    const agent = agentCreator(name, options);

    type Ret = ToolRet<R>;

    let toolsObj: MastraToolSetMap<Ret> | undefined;

    if (input.text_config.tools) {
      toolsObj = {} as MastraToolSetMap<Ret>;

      for (const [keyAny, def] of Object.entries(input.text_config.tools)) {
        const key = keyAny as keyof Ret;

        const impl = this.toolsRegistry?.has(key)
          ? this.toolsRegistry.get(key)
          : (_: any) =>
              Promise.reject(new Error(`Tool ${String(key)} not registered`));

        (toolsObj as any)[key] = createTool({
          id: String(key),
          description: def.description ?? "",
          inputSchema: z.object(def.parameters),
          execute: async ({ context }) => {
            return impl(context, options.toolContext);
          },
        });
      }
    }

    return {
      messages: input.messages,
      ...(settings?.temperature !== undefined
        ? { temperature: settings.temperature }
        : {}),
      ...(settings?.max_tokens !== undefined
        ? { maxSteps: Math.floor(settings.max_tokens / 100) } // rough conversion
        : {}),
      ...(settings?.stop_sequences !== undefined
        ? { maxRetries: settings.stop_sequences.length }
        : {}),
      ...(options.telemetry
        ? {
            telemetry: {
              isEnabled: true,
              ...getTelemetryConfig(
                options.telemetry,
                metadata.props,
                input.name
              ),
            },
          }
        : {}),
      ...(toolsObj ? { toolsets: { tools: toolsObj } } : {}),
    };
  }

  adaptObject<K extends KeysWithKind<T, "object"> & string>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): MastraObjectParams<T[K]["output"]> {
    const { model_name: name, ...settings } = input.object_config;
    const agentCreator = this.agentRegistry.getAgentFunction(name);
    const agent = agentCreator(name, options);

    return {
      messages: input.messages,
      output: z.object(input.object_config.schema),
      ...(settings?.temperature !== undefined
        ? { temperature: settings.temperature }
        : {}),
      ...(settings?.max_tokens !== undefined
        ? { maxSteps: Math.floor(settings.max_tokens / 100) }
        : {}),
      ...(options.telemetry
        ? {
            telemetry: {
              isEnabled: true,
              ...getTelemetryConfig(
                options.telemetry,
                metadata.props,
                input.name
              ),
            },
          }
        : {}),
    };
  }

  adaptImage<K extends KeysWithKind<T, "image"> & string>(
    input: ImageConfig,
    options: AdaptOptions
  ): MastraImageParams {
    const { model_name: name, ...settings } = input.image_config;
    const agentCreator = this.agentRegistry.getAgentFunction(name);
    const agent = agentCreator(name, options);

    // Create a message with the image prompt
    const messages: RichChatMessage[] = [
      {
        role: "user",
        content: settings.prompt,
      },
    ];

    return {
      messages,
      ...(settings?.num_images !== undefined
        ? { instructions: `Generate ${settings.num_images} images` }
        : {}),
      ...(options.telemetry
        ? {
            experimental_telemetry: getTelemetryConfig(
              options.telemetry,
              {},
              input.name
            ),
          }
        : {}),
    };
  }

  adaptSpeech<K extends KeysWithKind<T, "speech"> & string>(
    input: SpeechConfig,
    options: AdaptOptions
  ): MastraSpeechParams {
    const { model_name: name, ...settings } = input.speech_config;
    const agentCreator = this.agentRegistry.getAgentFunction(name);
    const agent = agentCreator(name, options);

    // Create a message with the speech text
    const messages: RichChatMessage[] = [
      {
        role: "user",
        content: settings.text,
      },
    ];

    return {
      messages,
      ...(settings?.voice !== undefined
        ? { instructions: `Use voice: ${settings.voice}` }
        : {}),
      ...(settings?.speed !== undefined
        ? { instructions: `Speak at speed: ${settings.speed}` }
        : {}),
      ...(options.telemetry
        ? {
            experimental_telemetry: getTelemetryConfig(
              options.telemetry,
              {},
              input.name
            ),
          }
        : {}),
    };
  }
}