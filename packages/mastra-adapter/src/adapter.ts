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
type MastraTool = any;

type ToolRet<R> = R extends { __tools: { output: infer O } } ? O : never;

type MastraToolWithExec<R> = {
  id: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
  outputSchema?: z.ZodSchema<R>;
  execute: (args: { context: any }) => Promise<R>;
};

type MastraToolSetMap<O extends Record<string, any>> = {
  [K in keyof O]: MastraToolWithExec<O[K]>;
};

export type MastraGenerateOptions = {
  temperature?: number;
  maxSteps?: number;
  maxRetries?: number;
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string };
  abortSignal?: AbortSignal;
  context?: any[];
  instructions?: string;
  memory?: {
    thread: string | { id: string; metadata?: Record<string, any>; title?: string };
    resource: string;
    options?: {
      lastMessages?: number | false;
      semanticRecall?: boolean | {
        topK?: number;
        messageRange?: number | { before: number; after: number };
      };
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
  onStepFinish?: (step: any) => void;
};

export type MastraTextParams<TS extends Record<string, MastraTool>> = {
  agent: Agent;
  messages: RichChatMessage[];
  toolsets?: Record<string, TS>;
  clientTools?: TS;
} & MastraGenerateOptions;

export interface MastraObjectParams<T> extends MastraGenerateOptions {
  agent: Agent;
  messages: RichChatMessage[];
  output: z.ZodSchema<T>;
  experimental_output?: z.ZodSchema<T>;
}

export interface MastraImageParams extends MastraGenerateOptions {
  agent: Agent;
  messages: RichChatMessage[];
  instructions?: string;
}

export interface MastraSpeechParams extends MastraGenerateOptions {
  agent: Agent;
  messages: RichChatMessage[];
  instructions?: string;
}

export type AgentFunctionCreator = (
  agentName: string,
  options?: AdaptOptions
) => Agent;

const getTelemetryConfig = (
  telemetry: AdaptOptions["telemetry"],
  props: Record<string, any>,
  promptName: string
): MastraGenerateOptions["telemetry"] => {
  if (!telemetry) return undefined;
  
  return {
    isEnabled: telemetry.isEnabled ?? true,
    recordInputs: true,
    recordOutputs: true,
    functionId: telemetry.functionId ?? promptName,
    metadata: {
      ...telemetry.metadata,
      prompt: promptName,
      props: JSON.stringify(props),
    },
  };
};

const getMemoryConfig = (
  options: AdaptOptions,
  promptName: string
): MastraGenerateOptions["memory"] => {
  // Check if memory configuration is provided in options
  if (options.memory) {
    return options.memory as MastraGenerateOptions["memory"];
  }
  
  // Return undefined if no memory config - let Mastra handle defaults
  return undefined;
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

  getAllTools(): Record<string, MastraTool> {
    const tools: Record<string, MastraTool> = {};
    for (const [name] of Object.entries(this.map)) {
      if (this.has(name as keyof TD)) {
        const impl = this.get(name as keyof TD & keyof RM);
        tools[String(name)] = createTool({
          id: String(name),
          description: `Tool: ${String(name)}`,
          inputSchema: z.object({}), // Will be overridden by AgentMark tool definition
          execute: async ({ context }) => {
            return impl(context);
          },
        });
      }
    }
    return tools;
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

  // Helper method to get agent directly
  getAgent(agentName: string, options?: AdaptOptions): Agent {
    const creator = this.getAgentFunction(agentName);
    return creator(agentName, options);
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
    
    // Get the agent for this model
    const agent = this.agentRegistry.getAgent(name, options);

    type Ret = ToolRet<R>;
    let toolsObj: MastraToolSetMap<Ret> | undefined;
    let clientTools: MastraToolSetMap<Ret> | undefined;

    // Handle tools if they exist
    if (input.text_config.tools) {
      toolsObj = {} as MastraToolSetMap<Ret>;

      for (const [keyAny, def] of Object.entries(input.text_config.tools)) {
        const key = keyAny as keyof Ret;

        const impl = this.toolsRegistry?.has(key)
          ? this.toolsRegistry.get(key)
          : (_: any) =>
              Promise.reject(new Error(`Tool ${String(key)} not registered`));

        // Convert AgentMark tool definition to Mastra tool
        const mastraTool = createTool({
          id: String(key),
          description: def.description ?? `Tool: ${String(key)}`,
          inputSchema: this.convertParametersToZodSchema(def.parameters),
          execute: async ({ context }) => {
            try {
              return await impl(context, options.toolContext);
            } catch (error) {
              throw new Error(`Tool execution failed for ${String(key)}: ${error instanceof Error ? error.message : String(error)}`);
            }
          },
        });

        (toolsObj as any)[key] = mastraTool;
      }
    }

    // Build the generate options
    const generateOptions: MastraGenerateOptions = {
      ...(settings?.temperature !== undefined
        ? { temperature: settings.temperature }
        : {}),
      ...(settings?.max_tokens !== undefined
        ? { maxSteps: Math.max(1, Math.floor(settings.max_tokens / 100)) }
        : {}),
      ...(settings?.max_retries !== undefined
        ? { maxRetries: settings.max_retries }
        : {}),
      ...(settings?.tool_choice !== undefined
        ? { toolChoice: this.convertToolChoice(settings.tool_choice) }
        : {}),
      memory: getMemoryConfig(options, input.name),
      telemetry: getTelemetryConfig(options.telemetry, metadata.props, input.name),
    };

    // Add custom instructions if needed
    if (settings?.stop_sequences?.length) {
      generateOptions.instructions = `Stop generation when encountering: ${settings.stop_sequences.join(', ')}`;
    }

    return {
      agent,
      messages: input.messages,
      ...(toolsObj ? { toolsets: { [input.name]: toolsObj } } : {}),
      ...generateOptions,
    };
  }

  adaptObject<K extends KeysWithKind<T, "object"> & string>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): MastraObjectParams<T[K]["output"]> {
    const { model_name: name, ...settings } = input.object_config;
    
    // Get the agent for this model
    const agent = this.agentRegistry.getAgent(name, options);

    // Convert schema to Zod schema
    const schema = this.convertParametersToZodSchema(input.object_config.schema);

    const generateOptions: MastraGenerateOptions = {
      ...(settings?.temperature !== undefined
        ? { temperature: settings.temperature }
        : {}),
      ...(settings?.max_tokens !== undefined
        ? { maxSteps: Math.max(1, Math.floor(settings.max_tokens / 100)) }
        : {}),
      ...(settings?.max_retries !== undefined
        ? { maxRetries: settings.max_retries }
        : {}),
      memory: getMemoryConfig(options, input.name),
      telemetry: getTelemetryConfig(options.telemetry, metadata.props, input.name),
    };

    // Add schema-specific instructions
    let instructions = '';
    if (settings?.schema_name) {
      instructions += `Generate a ${settings.schema_name}. `;
    }
    if (settings?.schema_description) {
      instructions += settings.schema_description;
    }
    if (instructions) {
      generateOptions.instructions = instructions.trim();
    }

    return {
      agent,
      messages: input.messages,
      output: schema,
      experimental_output: schema, // Mastra supports both
      ...generateOptions,
    };
  }

  adaptImage<K extends KeysWithKind<T, "image"> & string>(
    input: ImageConfig,
    options: AdaptOptions
  ): MastraImageParams {
    const { model_name: name, ...settings } = input.image_config;
    
    // Get the agent for this model
    const agent = this.agentRegistry.getAgent(name, options);

    // Create messages with the image prompt and settings
    const messages: RichChatMessage[] = [
      {
        role: "user",
        content: settings.prompt,
      },
    ];

    // Build instructions from image settings
    let instructions = '';
    if (settings?.num_images && settings.num_images > 1) {
      instructions += `Generate exactly ${settings.num_images} images. `;
    }
    if (settings?.size) {
      instructions += `Image size should be ${settings.size}. `;
    }
    if (settings?.aspect_ratio) {
      instructions += `Use aspect ratio ${settings.aspect_ratio}. `;
    }
    if (settings?.seed) {
      instructions += `Use seed ${settings.seed} for reproducibility. `;
    }

    return {
      agent,
      messages,
      ...(instructions ? { instructions: instructions.trim() } : {}),
    };
  }

  adaptSpeech<K extends KeysWithKind<T, "speech"> & string>(
    input: SpeechConfig,
    options: AdaptOptions
  ): MastraSpeechParams {
    const { model_name: name, ...settings } = input.speech_config;
    
    // Get the agent for this model
    const agent = this.agentRegistry.getAgent(name, options);

    // Create messages with the speech text
    const messages: RichChatMessage[] = [
      {
        role: "user",
        content: settings.text,
      },
    ];

    // Build instructions from speech settings
    let instructions = '';
    if (settings?.voice) {
      instructions += `Use voice: ${settings.voice}. `;
    }
    if (settings?.speed) {
      instructions += `Speak at speed: ${settings.speed}. `;
    }
    if (settings?.output_format) {
      instructions += `Output format: ${settings.output_format}. `;
    }
    if (settings?.instructions) {
      instructions += settings.instructions;
    }

    return {
      agent,
      messages,
      ...(instructions ? { instructions: instructions.trim() } : {}),
    };
  }

  // Helper methods for better integration

  private convertParametersToZodSchema(parameters: Record<string, any>): z.ZodSchema<any> {
    try {
      // Simple conversion from JSON schema-like object to Zod
      if (typeof parameters === 'object' && parameters !== null) {
        const zodFields: Record<string, z.ZodTypeAny> = {};
        
        for (const [key, value] of Object.entries(parameters)) {
          if (typeof value === 'object' && value.type) {
            switch (value.type) {
              case 'string':
                zodFields[key] = z.string();
                break;
              case 'number':
                zodFields[key] = z.number();
                break;
              case 'boolean':
                zodFields[key] = z.boolean();
                break;
              case 'array':
                zodFields[key] = z.array(z.any());
                break;
              case 'object':
                zodFields[key] = z.object({});
                break;
              default:
                zodFields[key] = z.any();
            }
          } else {
            zodFields[key] = z.any();
          }
        }
        
        return Object.keys(zodFields).length > 0 
          ? z.object(zodFields) 
          : z.object(parameters);
      }
      
      return z.object(parameters);
    } catch (error) {
      // Fallback to treating the entire parameters object as a Zod object
      return z.object(parameters);
    }
  }

  private convertToolChoice(
    toolChoice: 'auto' | 'none' | 'required' | { type: 'tool'; tool_name: string }
  ): MastraGenerateOptions['toolChoice'] {
    if (typeof toolChoice === 'string') {
      return toolChoice;
    }
    
    if (toolChoice.type === 'tool') {
      return {
        type: 'tool',
        toolName: toolChoice.tool_name,
      };
    }
    
    return 'auto';
  }
}

// Execution helpers for better integration
export class MastraExecutor {
  constructor(private adapter: MastraAdapter<any, any>) {}

  async executeText(params: MastraTextParams<any>): Promise<any> {
    try {
      const result = await params.agent.generate(params.messages, {
        toolsets: params.toolsets,
        clientTools: params.clientTools,
        temperature: params.temperature,
        maxSteps: params.maxSteps,
        maxRetries: params.maxRetries,
        toolChoice: params.toolChoice,
        abortSignal: params.abortSignal,
        context: params.context,
        instructions: params.instructions,
        memory: params.memory,
        telemetry: params.telemetry,
        onStepFinish: params.onStepFinish,
      });
      
      return result;
    } catch (error) {
      throw new Error(`Mastra text generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async executeObject<T>(params: MastraObjectParams<T>): Promise<{ object: T; text?: string }> {
    try {
      const result = await params.agent.generate(params.messages, {
        output: params.output,
        experimental_output: params.experimental_output,
        temperature: params.temperature,
        maxSteps: params.maxSteps,
        maxRetries: params.maxRetries,
        context: params.context,
        instructions: params.instructions,
        memory: params.memory,
        telemetry: params.telemetry,
      });
      
      return result;
    } catch (error) {
      throw new Error(`Mastra object generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async executeImage(params: MastraImageParams): Promise<any> {
    try {
      const result = await params.agent.generate(params.messages, {
        instructions: params.instructions,
        temperature: params.temperature,
        maxSteps: params.maxSteps,
        maxRetries: params.maxRetries,
        context: params.context,
        memory: params.memory,
        telemetry: params.telemetry,
      });
      
      return result;
    } catch (error) {
      throw new Error(`Mastra image generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async executeSpeech(params: MastraSpeechParams): Promise<any> {
    try {
      const result = await params.agent.generate(params.messages, {
        instructions: params.instructions,
        temperature: params.temperature,
        maxSteps: params.maxSteps,
        maxRetries: params.maxRetries,
        context: params.context,
        memory: params.memory,
        telemetry: params.telemetry,
      });
      
      return result;
    } catch (error) {
      throw new Error(`Mastra speech generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}