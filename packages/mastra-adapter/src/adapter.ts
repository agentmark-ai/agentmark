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
import type { Agent } from "@mastra/core";
import type { LanguageModel } from "@ai-sdk/openai";
import { jsonSchema } from "ai";
import { z } from "zod";

type ToolRet<R> = R extends { __tools: { output: infer O } } ? O : never;

export interface MastraTextParams {
  messages: RichChatMessage[];
  options?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    seed?: number;
    stopSequences?: string[];
    experimental_telemetry?: any;
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string };
    tools?: Record<string, any>;
  };
}

export interface MastraObjectParams<T> {
  messages: RichChatMessage[];
  output?: z.ZodSchema<T>;
  options?: {
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
  };
}

export interface MastraImageParams {
  prompt: string;
  options?: {
    n?: number;
    size?: `${number}x${number}`;
    aspectRatio?: `${number}:${number}`;
    seed?: number;
  };
}

export interface MastraSpeechParams {
  text: string;
  options?: {
    voice?: string;
    outputFormat?: string;
    instructions?: string;
    speed?: number;
  };
}

export type AgentCreator = (
  name: string,
  config: AgentConfig,
  options?: AdaptOptions
) => Agent;

export interface AgentConfig {
  instructions?: string;
  model?: LanguageModel;
  tools?: Record<string, any>;
  memory?: any;
  telemetry?: any;
}

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
  TD extends { [K in keyof TD]: { args: any } } = any,
  RM extends Partial<Record<keyof TD, any>> = {}
> {
  declare readonly __tools: { input: TD; output: RM };

  private map: {
    [K in keyof TD]?: (args: TD[K]["args"]) => any;
  } = {};

  register<K extends keyof TD, R>(
    name: K,
    fn: (args: TD[K]["args"]) => R
  ): MastraToolRegistry<TD, Merge<RM, { [P in K]: R }>> {
    this.map[name] = fn;
    return this as unknown as MastraToolRegistry<
      TD,
      Merge<RM, { [P in K]: R }>
    >;
  }

  get<K extends keyof TD & keyof RM>(name: K) {
    return this.map[name] as (args: TD[K]["args"]) => RM[K];
  }

  has<K extends keyof TD>(name: K): name is K & keyof RM {
    return name in this.map;
  }
}

export class MastraModelRegistry {
  private exactMatches: Record<string, AgentCreator> = {};
  private patternMatches: Array<[RegExp, AgentCreator]> = [];
  private defaultCreator?: AgentCreator;

  constructor(defaultCreator?: AgentCreator) {
    this.defaultCreator = defaultCreator;
  }

  registerModels(
    modelPattern: string | RegExp | Array<string>,
    creator: AgentCreator
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

  getAgentCreator(modelName: string): AgentCreator {
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

    throw new Error(`No agent creator found for model: ${modelName}`);
  }

  setDefaultCreator(creator: AgentCreator): void {
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

  constructor(private modelRegistry: MastraModelRegistry, toolRegistry?: R) {
    this.modelRegistry = modelRegistry;
    this.toolsRegistry = toolRegistry;
  }

  adaptText<K extends KeysWithKind<T, "text"> & string>(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): MastraTextParams {
    const { model_name: name, ...settings } = input.text_config;
    
    // Convert tools if they exist
    let convertedTools: Record<string, any> | undefined;
    if (input.text_config.tools) {
      convertedTools = {};
      for (const [keyAny, def] of Object.entries(input.text_config.tools)) {
        const key = keyAny;
        const toolDef = def as { description?: string; parameters: Record<string, any> };
        
        const impl = this.toolsRegistry?.has(key as any)
          ? this.toolsRegistry.get(key as any)
          : (_: any) =>
              Promise.reject(new Error(`Tool ${String(key)} not registered`));

        convertedTools[key] = {
          description: toolDef.description ?? "",
          inputSchema: z.object(toolDef.parameters as any),
          execute: impl,
        };
      }
    }

    return {
      messages: input.messages,
      options: {
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
        ...(settings?.tool_choice !== undefined
          ? { toolChoice: settings.tool_choice as any }
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
        ...(convertedTools ? { tools: convertedTools } : {}),
      },
    };
  }

  adaptObject<K extends KeysWithKind<T, "object"> & string>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): MastraObjectParams<T[K]["output"]> {
    const { model_name: name, ...settings } = input.object_config;

    return {
      messages: input.messages,
      output: z.object(input.object_config.schema as any),
      options: {
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
                input.name
              ),
            }
          : {}),
      },
    };
  }

  adaptImage<K extends KeysWithKind<T, "image"> & string>(
    input: ImageConfig,
    options: AdaptOptions
  ): MastraImageParams {
    const { model_name: name, ...settings } = input.image_config;

    return {
      prompt: settings.prompt,
      options: {
        ...(settings?.num_images !== undefined ? { n: settings.num_images } : {}),
        ...(settings?.size !== undefined
          ? { size: settings.size as `${number}x${number}` }
          : {}),
        ...(settings?.aspect_ratio !== undefined
          ? { aspectRatio: settings.aspect_ratio as `${number}:${number}` }
          : {}),
        ...(settings?.seed !== undefined ? { seed: settings.seed } : {}),
      },
    };
  }

  adaptSpeech<K extends KeysWithKind<T, "speech"> & string>(
    input: SpeechConfig,
    options: AdaptOptions
  ): MastraSpeechParams {
    const { model_name: name, ...settings } = input.speech_config;

    return {
      text: settings.text,
      options: {
        ...(settings?.voice !== undefined ? { voice: settings.voice } : {}),
        ...(settings?.output_format !== undefined
          ? { outputFormat: settings.output_format }
          : {}),
        ...(settings?.instructions !== undefined
          ? { instructions: settings.instructions }
          : {}),
        ...(settings?.speed !== undefined ? { speed: settings.speed } : {}),
      },
    };
  }
}