import {
  AgentMark,
  type PromptShape,
  type Adapter,
  type Loader,
  type KeysWithKind,
  TextPrompt,
  type AdaptOptions,
  type PromptMetadata,
  type TextConfig,
  type ObjectConfig,
  type ImageConfig,
  type SpeechConfig,
  type RichChatMessage,
} from "@agentmark/agentmark-core";
import { LlamaIndexToolRegistry, ToolMetadata, Merge } from "./tool-registry";
import type { Root } from "mdast";
import { Settings as LlamaSettings } from "llamaindex";
import { LlamaIndexModelRegistry } from "./model-registry";

interface MessageContent {
  type: string;
  text?: string;
  [key: string]: any;
}

// Helper type to ensure exact properties only
type ExactProps<T, U> = U & {
  [K in Exclude<keyof U, keyof T>]: never;
};

// Helper type for message props that prevents both duplicate and invalid props
type MessageProps<TInput, TUsed> = keyof Omit<TInput, keyof TUsed> extends never
  ? { [K in keyof TInput]?: never }
  : { [K in keyof Omit<TInput, keyof TUsed>]: TInput[K] } & {
      [K in keyof TUsed]?: never;
    };

export class LlamaIndexAdapter<
  T extends PromptShape<T>,
  R extends LlamaIndexToolRegistry<any, any> = LlamaIndexToolRegistry<any, any>
> implements Adapter<T>
{
  readonly __dict!: T;
  readonly __name = "llama-index-adapter";

  private readonly toolsRegistry: R | undefined;

  constructor(toolRegistry?: R) {
    this.toolsRegistry = toolRegistry;
  }

  adaptTextForAgent<
    K extends KeysWithKind<T, "text"> & string,
    UsedProps extends Partial<T[K]["input"]>
  >(
    input: TextConfig,
    propsWrapper: { props: ExactProps<T[K]["input"], UsedProps> },
    metadata?: PromptMetadata,
    options?: AdaptOptions
  ) {
    const extracted = {
      model: "",
      systemPrompt: "",
      maxCalls: 1,
      tools: [] as Array<{
        name: string;
        description: string;
        parameters: any;
        call: (
          args: any,
          toolContext?: Record<string, any>
        ) => any | Promise<any>;
        metadata: ToolMetadata;
      }>,
    };

    // Extract model configuration
    extracted.model = input.text_config?.model_name || "";
    extracted.maxCalls = input.text_config?.max_calls || 1;
    // Extract system message
    const systemMessage = input.messages.find(
      (msg: RichChatMessage) => msg.role === "system"
    );

    if (systemMessage) {
      extracted.systemPrompt = (systemMessage?.content as string) || "";
    } else {
      console.warn("No system message found in messages:", input.messages);
    }

    // Process tools from the .prompt.mdx frontmatter
    if (
      input.text_config.tools &&
      typeof input.text_config.tools === "object"
    ) {
      for (const [toolName, toolDef] of Object.entries(
        input.text_config.tools
      )) {
        const toolImpl = this.toolsRegistry?.get(toolName);
        const metadata: ToolMetadata = {
          name: toolName,
          description: (toolDef as any).description ?? `Tool: ${toolName}`,
          parameters: (toolDef as any).parameters || {},
        };

        if (toolImpl) {
          extracted.tools.push({
            name: toolName,
            description: metadata.description,
            parameters: metadata.parameters,
            call: async (args: any) => {
              try {
                return await toolImpl(args, options?.toolContext);
              } catch (error) {
                console.error(`Error executing tool ${toolName}:`, error);
                throw error;
              }
            },
            metadata,
          });
        } else {
          console.warn(
            `Tool ${toolName} is defined in prompt but not registered in tool registry`
          );

          extracted.tools.push({
            name: toolName,
            description: metadata.description,
            parameters: metadata.parameters,
            call: (_: any) => {
              throw new Error(
                `Tool ${toolName} not registered in tool registry. Available tools: ${
                  this.toolsRegistry?.getToolNames().join(", ") || "none"
                }`
              );
            },
            metadata,
          });
        }
      }
    }
    return extracted;
  }

  adaptTextForGenerate(input: TextConfig) {
    const userMessage = input.messages.find(
      (msg: RichChatMessage) => msg.role === "user"
    );

    let userPrompt = "";
    if (userMessage) {
      if (typeof userMessage.content === "string") {
        userPrompt = userMessage.content;
      } else if (Array.isArray(userMessage.content)) {
        userPrompt = userMessage.content
          .filter((item: MessageContent) => item.type === "text")
          .map((item: MessageContent) => item.text || "")
          .join(" ");
      }
    } else {
      console.warn("No user message found in messages");
    }

    return userPrompt;
  }

  adaptText<K extends KeysWithKind<T, "text"> & string>(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): any {
    return input;
  }

  adaptObject<K extends KeysWithKind<T, "object"> & string>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): any {
    return "adaptObject is not implemented - use formatAgent instead";
  }

  adaptImage<K extends KeysWithKind<T, "image"> & string>(
    input: ImageConfig,
    options: AdaptOptions
  ): any {
    return "adaptImage is not implemented - use formatAgent instead";
  }

  adaptSpeech<K extends KeysWithKind<T, "speech"> & string>(
    input: SpeechConfig,
    options: AdaptOptions
  ): any {
    return "adaptSpeech is not implemented - use formatAgent instead";
  }
}

export class LlamaIndexTextPrompt<
  T extends PromptShape<T>,
  K extends KeysWithKind<T, "text"> & string,
  R extends LlamaIndexToolRegistry<any, any> = LlamaIndexToolRegistry<any, any>
> extends TextPrompt<T, LlamaIndexAdapter<T, R>, K> {
  modelRegistry: LlamaIndexModelRegistry;
  adapter: LlamaIndexAdapter<T, R>;

  constructor(
    content: unknown,
    templateEngine: any,
    adapter: LlamaIndexAdapter<T, R>,
    path: K | undefined,
    testSettings: any,
    loader: Loader<T> | undefined,
    modelRegistry: LlamaIndexModelRegistry
  ) {
    super(content, templateEngine, adapter, path, testSettings, loader);
    this.modelRegistry = modelRegistry;
    this.adapter = adapter;
  }

  async formatAgent<UsedProps extends Partial<T[K]["input"]>>(
    agentPropsWrapper: { props: ExactProps<T[K]["input"], UsedProps> },
    options?: AdaptOptions
  ) {
    const agentProps = agentPropsWrapper.props;

    const placeholderProps = {} as T[K]["input"];
    const partialProps = { ...placeholderProps, ...agentProps };

    const formattedInput = await this.compile(partialProps);

    const agentConfig = this.adapter.adaptTextForAgent(
      formattedInput,
      agentPropsWrapper,
      undefined,
      options
    );

    const llm = this.modelRegistry.getModel(agentConfig.model);
    LlamaSettings.llm = llm;

    return {
      ...agentConfig,
      formatGenerateText: async (
        messagePropsWrapper: {
          props: MessageProps<T[K]["input"], UsedProps>;
        } = { props: {} as MessageProps<T[K]["input"], UsedProps> }
      ) => {
        const messageProps = messagePropsWrapper.props;

        const allProps = {
          ...agentProps,
          ...messageProps,
        } as T[K]["input"];

        const finalFormattedInput = await this.compile(allProps);
        return this.adapter.adaptTextForGenerate(finalFormattedInput);
      },
    };
  }
}

export class LlamaAgentmark<
  T extends PromptShape<T>,
  R extends LlamaIndexToolRegistry<any, any> = LlamaIndexToolRegistry<any, any>
> extends AgentMark<T, LlamaIndexAdapter<T, R>> {
  modelRegistry: LlamaIndexModelRegistry;
  adapter: LlamaIndexAdapter<T, R>;
  toolRegistry?: R;

  constructor(opts: {
    loader?: Loader<T>;
    modelRegistry: LlamaIndexModelRegistry;
    toolRegistry?: R;
  }) {
    const adapter = new LlamaIndexAdapter<T, R>(opts.toolRegistry);
    super({ loader: opts.loader, adapter });
    this.modelRegistry = opts.modelRegistry;
    this.adapter = adapter;
    this.toolRegistry = opts.toolRegistry;
  }

  override async loadTextPrompt<K extends KeysWithKind<T, "text"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<LlamaIndexTextPrompt<T, K, R>> {
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

    return new LlamaIndexTextPrompt<T, K, R>(
      content,
      this.templateEngine,
      this.adapter,
      pathProvided ? pathOrPreloaded : undefined,
      textConfig.test_settings,
      this.loader,
      this.modelRegistry
    );
  }
}
