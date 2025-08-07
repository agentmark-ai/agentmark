import {
  TextConfig,
  ImageConfig,
  ObjectConfig,
  SpeechConfig,
  Adapter,
  PromptShape,
  AgentMark,
  Loader,
  AdaptOptions,
  PromptMetadata,
  KeysWithKind,
  RichChatMessage,
  TextPrompt,
  TextConfigSchema,
} from "@agentmark/agentmark-core";
import type { LanguageModel } from "ai";
import { MastraModelRegistry } from "./model-registry";
import { MastraToolRegistry } from "./tool-registry";
import { Root } from "mdast";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export interface MastraTextParams {
  model: LanguageModel;
  name: string;
  instructions: string;
  messages: RichChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stopSequences?: string[];
}

export interface MastraObjectParams<T = any> {
  model: LanguageModel;
  name: string;
  schema: T;
  messages: RichChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stopSequences?: string[];
}

export interface MastraFormatOptions {
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: any;
    };
  }>;
  toolChoice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; function: { name: string } };
  maxSteps?: number;

  memory?: {
    type: "conversation" | "vector" | "buffer";
    config?: {
      maxTokens?: number;
      similarity?: number;
      [key: string]: any;
    };
  };

  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stop?: string | string[];

  abortSignal?: AbortSignal;
  headers?: Record<string, string>;

  experimental_telemetry?: {
    isEnabled?: boolean;
    functionId?: string;
    metadata?: Record<string, any>;
  };

  telemetry?: {
    isEnabled?: boolean;
    functionId?: string;
    metadata?: Record<string, any>;
  };
  toolContext?: Record<string, any>;
  apiKey?: string;
  baseURL?: string;
  timeout?: number;
  retries?: number;
  [key: string]: any;
}

export type MessageExecutionOptions = Pick<
  MastraFormatOptions,
  | "telemetry"
  | "experimental_telemetry"
  | "maxSteps"
  | "temperature"
  | "maxTokens"
  | "topP"
  | "topK"
  | "frequencyPenalty"
  | "presencePenalty"
  | "seed"
  | "stop"
  | "tools"
  | "toolChoice"
  | "abortSignal"
  | "headers"
> & {
  [key: string]: any;
};

export class MastraAdapter<T extends PromptShape<T> = any>
  implements Adapter<T>
{
  public __name = "MastraAdapter";
  public __dict: T = {} as T;

  constructor(
    private modelRegistry: MastraModelRegistry,
    private toolRegistry?: MastraToolRegistry // Use proper type
  ) {}

  getModelRegistry(): MastraModelRegistry {
    return this.modelRegistry;
  }

  private jsonSchemaToZod(jsonSchema: any): z.ZodSchema {
    if (jsonSchema.type === "object" && jsonSchema.properties) {
      const zodObject: Record<string, z.ZodSchema> = {};

      for (const [propName, propDef] of Object.entries(jsonSchema.properties)) {
        const prop = propDef as any;
        if (prop.type === "string") {
          zodObject[propName] = z.string();
        } else if (prop.type === "number") {
          zodObject[propName] = z.number();
        } else if (prop.type === "boolean") {
          zodObject[propName] = z.boolean();
        } else {
          zodObject[propName] = z.string();
        }
      }
      return z.object(zodObject);
    }
    return z.any();
  }

  adaptText<K extends KeysWithKind<T, "text"> & string>(
    input: TextConfig,
    options?: AdaptOptions,
    metadata?: PromptMetadata
  ): MastraTextParams {
    throw new Error("adaptText is not implemented - use formatAgent instead");
  }

  adaptTextForAgent<
    K extends KeysWithKind<T, "text"> & string,
    UsedProps extends Partial<T[K]["input"]>
  >(
    input: TextConfig,
    propsWrapper: { props: ExactProps<T[K]["input"], UsedProps> },
    metadata?: PromptMetadata
  ): Promise<{
    formatMessage: (
      messageProps: {
        props: MessageProps<T[K]["input"], UsedProps>;
      } & MessageExecutionOptions
    ) => Promise<RichChatMessage[]>;
    name: string;
    instructions: string;
    model: () => any;
    tools?: Record<string, any>; // Add tools to the return type
    [key: string]: any;
  }> {
    const adapter = this;
    const agentProps = propsWrapper.props;
    const systemMessage = input.messages.find((msg) => msg.role === "system");
    const instructions =
      systemMessage && typeof systemMessage.content === "string"
        ? systemMessage.content
        : "You are a helpful assistant.";

    const modelName = input.text_config.model_name;
    const modelCreator = this.modelRegistry.getModelFunction(modelName);

    const executableTools: Record<string, any> = {};
    if (input.text_config.tools) {
      for (const [toolName, toolDef] of Object.entries(
        input.text_config.tools
      )) {
        const toolImpl = this.toolRegistry?.get(toolName);
        if (toolImpl) {
          // Create complete Mastra tool from schema + execution logic
          // Convert JSON Schema to Zod schema
          const inputSchema = this.jsonSchemaToZod(toolDef.parameters);

          executableTools[toolName] = createTool({
            id: toolName,
            description: toolDef.description, // From MDX schema
            inputSchema: inputSchema, // From MDX schema converted to Zod
            outputSchema: z.string(), // Default output schema
            execute: toolImpl.execute, // From tool registry
          });
        } else {
          console.warn(
            `Tool '${toolName}' defined in schema but not registered in toolRegistry`
          );
        }
      }
    }

    return Promise.resolve({
      formatMessage: async (
        messageProps: {
          props: MessageProps<T[K]["input"], UsedProps>;
        } & MessageExecutionOptions
      ) => {
        const allProps = {
          ...agentProps,
          ...messageProps.props,
        } as T[K]["input"];
        return input.messages.filter((message) => message.role !== "system");
      },
      name: input.name,
      instructions: instructions,
      model: () => modelCreator(modelName),
      messages: input.messages,
      text_config: input.text_config,
      test_settings: input.test_settings,
      agentmark_meta: input.agentmark_meta,
      tools: executableTools,
    });
  }

  adaptTextForMessage<K extends KeysWithKind<T, "text"> & string>(
    input: TextConfig,
    options?: AdaptOptions,
    metadata?: PromptMetadata
  ): RichChatMessage[] {
    return this.formatMessage(input);
  }

  adaptObject<K extends KeysWithKind<T, "object"> & string>(
    input: ObjectConfig,
    options?: AdaptOptions,
    metadata?: PromptMetadata
  ): MastraObjectParams<T[K]["output"]> {
    throw new Error("adaptObject is not implemented - use formatAgent instead");
  }

  adaptImage<K extends KeysWithKind<T, "image"> & string>(
    input: ImageConfig,
    options?: AdaptOptions,
    metadata?: PromptMetadata
  ): MastraTextParams {
    throw new Error("adaptImage is not implemented - use formatAgent instead");
  }

  adaptSpeech<K extends KeysWithKind<T, "speech"> & string>(
    input: SpeechConfig,
    options?: AdaptOptions,
    metadata?: PromptMetadata
  ): MastraTextParams {
    throw new Error("adaptSpeech is not implemented - use formatAgent instead");
  }

  formatMessage(
    input: TextConfig | ObjectConfig | ImageConfig | SpeechConfig
  ): RichChatMessage[] {
    if ("messages" in input && input.messages) {
      return input.messages.filter((message) => message.role !== "system");
    }
    return [];
  }
}

// Helper type to ensure exact properties only
type ExactProps<T, U> = U & {
  [K in Exclude<keyof U, keyof T>]: never;
};

// Helper type for message props that prevents both duplicate and invalid props
type MessageProps<TInput, TUsed> =
  // If all properties are used, only allow empty object but block any properties
  keyof Omit<TInput, keyof TUsed> extends never
    ? { [K in keyof TInput]?: never } // Block all original properties with optional never
    : { [K in keyof Omit<TInput, keyof TUsed>]: TInput[K] } & {
        [K in keyof TUsed]?: never;
      };

export class MastraTextPrompt<
  T extends PromptShape<T>,
  K extends KeysWithKind<T, "text"> & string
> extends TextPrompt<T, MastraAdapter<T>, K> {
  async formatAgent<
    UsedProps extends Partial<T[K]["input"]>
  >(agentPropsWrapper: {
    props: ExactProps<T[K]["input"], UsedProps>;
  }): Promise<{
    formatMessage: (
      messagePropsWrapper: {
        props: MessageProps<T[K]["input"], UsedProps>;
      } & MessageExecutionOptions
    ) => Promise<RichChatMessage[]>;
    name: string;
    instructions: string;
    model: () => any;
    tools?: Record<string, any>; // Add tools to the return type
    [key: string]: any;
  }> {
    const agentProps = agentPropsWrapper.props;

    const placeholderProps = {} as T[K]["input"];
    const partialProps = { ...placeholderProps, ...agentProps };

    const compiledConfig = await this.compile(partialProps);
    const agentResult = await this.adapter.adaptTextForAgent(
      compiledConfig,
      agentPropsWrapper
    );
    return {
      ...agentResult,
      formatMessage: async (
        messagePropsWrapper: {
          props: MessageProps<T[K]["input"], UsedProps>;
        } & MessageExecutionOptions
      ) => {
        const messageProps = messagePropsWrapper.props;

        const allProps = {
          ...agentProps,
          ...messageProps,
        };

        const finalCompiledConfig = await this.compile(allProps);
        return this.adapter.adaptTextForMessage(finalCompiledConfig);
      },
    };
  }

  async formatMessage(props: T[K]["input"]): Promise<RichChatMessage[]> {
    const compiledConfig = await this.compile(props);
    return this.adapter.adaptTextForMessage(compiledConfig);
  }
}

export class MastraAgentMark<T extends PromptShape<T>> extends AgentMark<
  T,
  MastraAdapter<T>
> {
  constructor(config: {
    adapter?: MastraAdapter<T>;
    loader?: any;
    modelRegistry: MastraModelRegistry;
    toolRegistry?: MastraToolRegistry; // Use proper type
  }) {
    const adapter =
      config.adapter ||
      new MastraAdapter(config.modelRegistry, config.toolRegistry);
    super({
      adapter,
      loader: config.loader,
    });
  }

  async loadTextPrompt<K extends KeysWithKind<T, "text"> & string>(
    pathOrPreloaded: Root | K,
    options?: any
  ): Promise<MastraTextPrompt<T, K>> {
    let content: unknown;
    const pathProvided = typeof pathOrPreloaded === "string";

    if (pathProvided && this.loader) {
      content = await this.loader.load(pathOrPreloaded, "text", options);
    } else {
      content = pathOrPreloaded;
    }

    const textConfig: TextConfig = await this.templateEngine.compile({
      template: content,
    });

    TextConfigSchema.parse(textConfig);
    return new MastraTextPrompt<T, K>(
      content,
      this.templateEngine,
      this.getAdapter(),
      pathOrPreloaded as K,
      undefined,
      this.loader
    );
  }
}

export function createAgentMarkClient<T extends PromptShape<T> = any>(config: {
  loader?: any;
  modelRegistry: MastraModelRegistry;
  toolRegistry?: MastraToolRegistry; // Use proper type
}): MastraAgentMark<T> {
  return new MastraAgentMark(config);
}
