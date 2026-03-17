import type {
  Adapter,
  TextConfig,
  ObjectConfig,
  PromptShape,
  PromptMetadata,
  AdaptOptions,
  RichChatMessage,
} from "@agentmark-ai/prompt-core";
import { MastraModelRegistry } from "./model-registry";
import { AgentConfig, AgentGenerateOptions, ToolsInput } from "@mastra/core/agent";
import { resolveSerializedZodOutput } from "@mastra/core/utils";
import { parseSchema } from "json-schema-to-zod";
import { parseMcpUri } from "@agentmark-ai/prompt-core";
import type { McpServers } from "@agentmark-ai/prompt-core";
import { MCPClientManager } from "./mcp/mcp-client-manager";

function getTelemetryConfig(
  telemetry: AdaptOptions["telemetry"],
  props: Record<string, unknown>,
  promptName: string,
  agentmarkMeta?: Record<string, unknown>
) {
  return telemetry
    ? {
        ...telemetry,
        metadata: {
          ...telemetry.metadata,
          prompt_name: promptName,
          props: JSON.stringify(props ?? {}),
          ...(agentmarkMeta ? { ...agentmarkMeta } : {}),
        },
      }
    : undefined;
}

const extractInstructions = (messages: TextConfig["messages"]) => {
  return messages.find((i) => i.role === "system")?.content;
};

const extractMessages = (messages: TextConfig["messages"]) => {
  return messages.filter((i) => i.role !== "system");
};

export class MastraAdapter<
  T extends PromptShape<T> | undefined,
  TTools extends ToolsInput = ToolsInput
> implements Adapter<any>
{
  declare readonly __dict: T;
  readonly __name = "mastra";
  private _mcp?: MCPClientManager;

  constructor(
    private modelRegistry: MastraModelRegistry,
    private tools?: TTools,
    private mcpServers?: McpServers
  ) {}

  private getMcpManager(): MCPClientManager | undefined {
    if (!this.mcpServers) return undefined;
    if (!this._mcp) {
      this._mcp = new MCPClientManager(this.mcpServers);
    }
    return this._mcp;
  }

  async adaptText(input: TextConfig, options: AdaptOptions) {
    const agent = await this.adaptTextAgent(input, options);

    return {
      ...agent,
      adaptMessages: this.adaptTextMessages,
    };
  }

  async adaptObject(input: ObjectConfig, options: AdaptOptions) {
    const baseAgent = await this.adaptObjectAgent(input, options);

    return {
      ...baseAgent,
      adaptMessages: ({
        input,
        options,
        metadata,
      }: {
        input: ObjectConfig;
        options: AdaptOptions;
        metadata: PromptMetadata;
      }) => this.adaptObjectMessages(input, options, metadata),
    };
  }

  adaptImage(): any {
    throw new Error("Not implemented");
  }

  adaptSpeech(): any {
    throw new Error("Not implemented");
  }

  private async resolveTools(
    toolNames: string[]
  ): Promise<Record<string, TTools[keyof TTools]>> {
    const toolsObj: Record<string, TTools[keyof TTools]> = {};

    for (const toolName of toolNames) {
      if (toolName.startsWith("mcp://")) {
        const { server, tool } = parseMcpUri(toolName);
        const mcp = this.getMcpManager();
        if (!mcp) {
          throw new Error(
            `MCP server '${server}' not configured`
          );
        }
        if (tool === "*") {
          const namespacedTools = await mcp.getNamespacedTools();
          const prefix1 = `${server}_`;
          const prefix2 = `${server}.`;
          let matched = 0;
          for (const [key, toolImpl] of Object.entries(namespacedTools)) {
            if (key.startsWith(prefix1) || key.startsWith(prefix2)) {
              // Reconstruct the mcp:// URI as the key (consistent with single-tool behavior)
              const sep = key.startsWith(prefix1) ? prefix1 : prefix2;
              const toolKey = `mcp://${server}/${key.slice(sep.length)}`;
              toolsObj[toolKey] = toolImpl as unknown as TTools[keyof TTools];
              matched++;
            }
          }
          if (matched === 0) {
            console.warn(
              `[MastraAdapter] Wildcard expansion for mcp://${server}/* yielded zero tools. ` +
              `Check that the server name '${server}' matches the registered MCP server. ` +
              `Available namespaced keys: ${Object.keys(namespacedTools).join(", ") || "(none)"}`
            );
          }
          continue;
        }
        const namespacedTools = await mcp.getNamespacedTools();
        const keyUnderscore = `${server}_${tool}`;
        const keyDot = `${server}.${tool}`;
        const resolved =
          namespacedTools[keyUnderscore] ??
          namespacedTools[keyDot];
        if (!resolved) {
          throw new Error(
            `MCP tool not found: ${server}/${tool}`
          );
        }
        // MCP tools bypass TTools compile-time constraints; they are dynamically typed
        // and trusted from the registry without schema validation at runtime.
        toolsObj[toolName] = resolved as unknown as TTools[keyof TTools];
        continue;
      }

      if (this.tools && toolName in this.tools) {
        toolsObj[toolName] = this.tools[toolName] as TTools[keyof TTools];
      } else {
        const available = this.tools ? Object.keys(this.tools).join(", ") : "(none)";
        throw new Error(
          `Tool '${toolName}' referenced in prompt config was not found in the provided tools record. Available tools: ${available}`
        );
      }
    }

    return toolsObj;
  }

  private async adaptTextAgent(input: TextConfig, options?: AdaptOptions) {
    const { model_name, tools } = input.text_config;
    const modelCreator = this.modelRegistry?.getModelFunction(model_name);
    const model = modelCreator(model_name, options ?? {});

    const toolsObj = tools
      ? await this.resolveTools(tools as string[])
      : {};

    const instructions = extractInstructions(input.messages);

    return {
      name: input.name,
      instructions: instructions!,
      model,
      tools: toolsObj,
    };
  }

  private async adaptObjectAgent(
    input: ObjectConfig,
    options?: AdaptOptions
  ): Promise<AgentConfig> {
    const { model_name, tools } = input.object_config;
    const modelCreator = this.modelRegistry?.getModelFunction(model_name);
    const model = modelCreator(model_name, options ?? {});

    const toolsObj = tools
      ? await this.resolveTools(tools as string[])
      : {};

    const instructions = extractInstructions(input.messages);

    return {
      name: input.name,
      instructions: instructions!,
      model,
      tools: toolsObj,
    };
  }

  private adaptTextMessages({
    input,
    options,
    metadata,
  }: {
    input: TextConfig;
    options?: AdaptOptions;
    metadata: PromptMetadata;
  }): {
    messages: RichChatMessage[];
    options: AgentGenerateOptions<undefined, undefined> & {
      output?: never;
      experimental_output?: never;
    };
  } {
    const settings = input.text_config;

    const baseOptions = {
      ...(settings.temperature !== undefined
        ? { temperature: settings.temperature }
        : {}),
      ...(settings.max_tokens !== undefined
        ? { maxTokens: settings.max_tokens }
        : {}),
      ...(settings.top_p !== undefined ? { topP: settings.top_p } : {}),
      ...(settings.top_k !== undefined ? { topK: settings.top_k } : {}),
      ...(settings.presence_penalty !== undefined
        ? { presencePenalty: settings.presence_penalty }
        : {}),
      ...(settings.frequency_penalty !== undefined
        ? { frequencyPenalty: settings.frequency_penalty }
        : {}),
      ...(settings.stop_sequences !== undefined
        ? { stopSequences: settings.stop_sequences }
        : {}),
      ...(settings.seed !== undefined ? { seed: settings.seed } : {}),
      ...(options?.telemetry
        ? {
            telemetry: getTelemetryConfig(
              options?.telemetry,
              metadata.props,
              input.name,
              input.agentmark_meta
            ),
          }
        : {}),
      ...(settings.max_retries !== undefined
        ? { maxRetries: settings.max_retries }
        : {}),
      ...(settings.max_calls !== undefined
        ? { maxSteps: settings.max_calls }
        : {}),
      ...(settings.tool_choice !== undefined
        ? { toolChoice: settings.tool_choice as any }
        : {}),
    };

    return {
      messages: extractMessages(input.messages),
      options: {
        ...baseOptions,
        output: undefined,
        experimental_output: undefined,
      },
    };
  }

  private adaptObjectMessages(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ) {
    const { ...settings } = input.object_config;

    const baseOptions = {
      ...(settings.temperature !== undefined
        ? { temperature: settings.temperature }
        : {}),
      ...(settings.max_tokens !== undefined
        ? { maxTokens: settings.max_tokens }
        : {}),
      ...(settings.top_p !== undefined ? { topP: settings.top_p } : {}),
      ...(settings.top_k !== undefined ? { topK: settings.top_k } : {}),
      ...(settings.presence_penalty !== undefined
        ? { presencePenalty: settings.presence_penalty }
        : {}),
      output: resolveSerializedZodOutput(parseSchema(settings.schema)),
      ...(settings.frequency_penalty !== undefined
        ? { frequencyPenalty: settings.frequency_penalty }
        : {}),
      ...(settings.seed !== undefined ? { seed: settings.seed } : {}),
      ...(options?.telemetry
        ? {
            telemetry: getTelemetryConfig(
              options?.telemetry,
              metadata.props,
              input.name,
              input.agentmark_meta
            ),
          }
        : {}),
      ...(settings.max_retries !== undefined
        ? { maxRetries: settings.max_retries }
        : {}),
      ...(settings.max_calls !== undefined
        ? { maxSteps: settings.max_calls }
        : {}),
    };

    return {
      messages: input.messages,
      options: {
        ...baseOptions,
      },
    };
  }
}
