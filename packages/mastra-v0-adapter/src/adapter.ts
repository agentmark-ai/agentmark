import type {
  Adapter,
  TextConfig,
  ObjectConfig,
  PromptShape,
  PromptMetadata,
  AdaptOptions,
  RichChatMessage,
  ParamMap,
} from "@agentmark-ai/prompt-core";
import { MastraModelRegistry } from "./model-registry";
import { AgentConfig, AgentGenerateOptions, ToolsInput } from "@mastra/core/agent";
import { resolveSerializedZodOutput } from "@mastra/core/utils";
import { parseSchema } from "json-schema-to-zod";
import {
  applyParamMap,
  buildTelemetryMetadata,
  parseMcpUri,
} from "@agentmark-ai/prompt-core";
import type { McpServers } from "@agentmark-ai/prompt-core";
import { MCPClientManager } from "./mcp/mcp-client-manager";

/**
 * Declarative field maps — translate snake_case AgentMark config to the
 * camelCase keys Mastra's `AgentGenerateOptions` expects. Shared
 * `applyParamMap` semantics: undefined values and unmapped keys
 * (`model_name`, `tools` — consumed by the agent builders) are dropped.
 */
const MASTRA_TEXT_PARAM_MAP: ParamMap = {
  temperature: "temperature",
  max_tokens: "maxTokens",
  top_p: "topP",
  top_k: "topK",
  presence_penalty: "presencePenalty",
  frequency_penalty: "frequencyPenalty",
  stop_sequences: "stopSequences",
  seed: "seed",
  max_retries: "maxRetries",
  max_calls: "maxSteps",
  tool_choice: "toolChoice",
};

const MASTRA_OBJECT_PARAM_MAP: ParamMap = {
  temperature: "temperature",
  max_tokens: "maxTokens",
  top_p: "topP",
  top_k: "topK",
  presence_penalty: "presencePenalty",
  frequency_penalty: "frequencyPenalty",
  seed: "seed",
  max_retries: "maxRetries",
  max_calls: "maxSteps",
  // Mastra wants a Zod schema on `output`; prompts carry JSON Schema.
  schema: {
    key: "output",
    transform: (schema) => resolveSerializedZodOutput(parseSchema(schema)),
  },
};

/** `agent.generate` options for text prompts — param-mapped settings with the
 * object-output channels explicitly fenced off. */
export type MastraTextGenerateOptions = AgentGenerateOptions<
  undefined,
  undefined
> & {
  output?: never;
  experimental_output?: never;
};

/** `agent.generate` options for object prompts — param-mapped settings plus
 * the Zod `output` derived from the prompt's JSON schema (always present;
 * `object_config.schema` is required). Refine `output` with your prompt's
 * typed Zod schema via `MastraObjectPrompt.formatAgent`'s `formatMessages`. */
export type MastraObjectGenerateOptions = Record<string, unknown> & {
  output: unknown;
};

/**
 * The runnable bundle `adaptText` produces for the executor path: everything
 * `MastraExecutor` needs to construct the Agent and invoke it in one shot.
 * The user-facing `formatAgent` flow does NOT use this shape — it composes
 * `adaptTextAgent` + `adaptTextMessages` directly so callers own the Agent.
 */
export interface MastraTextParams {
  agent: AgentConfig;
  messages: RichChatMessage[];
  generateOptions: MastraTextGenerateOptions;
}

/** Object-kind twin of {@link MastraTextParams}, produced by `adaptObject`. */
export interface MastraObjectParams {
  agent: AgentConfig;
  messages: RichChatMessage[];
  generateOptions: MastraObjectGenerateOptions;
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

  /**
   * Protocol method consumed by the WebhookRunner→MastraExecutor path (via
   * `prompt.format()`). Returns the honest runnable bundle — everything the
   * executor needs to `new Agent(agent)` + `agent.generate(messages,
   * generateOptions)` in one shot.
   *
   * The user-facing two-stage flow does NOT come through here:
   * `MastraTextPrompt.formatAgent` composes {@link adaptTextAgent} +
   * {@link adaptTextMessages} directly, because its consumers construct and
   * own the `Agent` themselves (register it with a Mastra instance, attach
   * memory, re-derive messages with merged props per call).
   */
  async adaptText(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<MastraTextParams> {
    const agent = await this.adaptTextAgent(input, options);
    const { messages, options: generateOptions } = this.adaptTextMessages({
      input,
      options,
      metadata,
    });
    return { agent, messages, generateOptions };
  }

  /** Object-kind twin of {@link adaptText} — see its doc for the two-path split. */
  async adaptObject(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<MastraObjectParams> {
    const agent = await this.adaptObjectAgent(input, options);
    const { messages, options: generateOptions } = this.adaptObjectMessages(
      input,
      options,
      metadata
    );
    return { agent, messages, generateOptions };
  }

  adaptImage(): any {
    throw new Error("Not implemented");
  }

  adaptSpeech(): any {
    throw new Error("Not implemented");
  }

  /**
   * Deliberately NOT `BaseAdapter.resolveTools`: Mastra keys resolved MCP
   * tools by their full `mcp://server/tool` URI (and matches the
   * `server_tool` / `server.tool` namespacing `MCPClientManager` produces),
   * whereas `BaseAdapter` keys by bare tool name via `McpServerRegistry`.
   * The tool-map keys become the tool names the model sees, so unifying the
   * two would be a behavior change for existing Mastra prompts. The
   * param-map + telemetry duplication this adapter used to carry now comes
   * from `applyParamMap` / `buildTelemetryMetadata` instead.
   */
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

  /**
   * Building block for `MastraTextPrompt.formatAgent`: the durable
   * `AgentConfig` (instructions from `<System>`, resolved model, resolved
   * tools) the caller hands to `new Agent(...)` and keeps across calls.
   */
  async adaptTextAgent(
    input: TextConfig,
    options?: AdaptOptions
  ): Promise<AgentConfig> {
    const { model_name, tools } = input.text_config;
    const modelCreator = this.modelRegistry?.getModelFunction(model_name);
    const model = modelCreator(model_name, options ?? {});

    const toolsObj = tools
      ? await this.resolveTools(tools as string[])
      : {};

    const instructions = extractInstructions(input.messages);

    return {
      name: input.name,
      // Prompts without a <System> block produce no instructions. Mastra's
      // `AgentConfig` types the field as required but the Agent tolerates an
      // absent value at runtime — pass it through (cast, not `!`) so the
      // declared type stays source-compatible for `formatAgent` consumers.
      instructions: instructions as string,
      model,
      tools: toolsObj,
    };
  }

  /** Object-kind twin of {@link adaptTextAgent}. */
  async adaptObjectAgent(
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
      // See adaptTextAgent — deliberate cast for system-less prompts.
      instructions: instructions as string,
      model,
      tools: toolsObj,
    };
  }

  /**
   * Building block for `formatMessages`: the per-call `(messages,
   * generateOptions)` pair — re-derivable with different/merged props on
   * every call while the Agent from {@link adaptTextAgent} stays fixed.
   */
  adaptTextMessages({
    input,
    options,
    metadata,
  }: {
    input: TextConfig;
    options?: AdaptOptions;
    metadata: PromptMetadata;
  }): {
    messages: RichChatMessage[];
    options: MastraTextGenerateOptions;
  } {
    const mapped = applyParamMap(
      input.text_config as Record<string, unknown>,
      MASTRA_TEXT_PARAM_MAP
    );
    const telemetry = options?.telemetry
      ? buildTelemetryMetadata(
          options.telemetry,
          metadata.props ?? {},
          input.name,
          input.agentmark_meta
        )
      : undefined;

    return {
      messages: extractMessages(input.messages),
      options: {
        ...mapped,
        ...(telemetry ? { telemetry } : {}),
        output: undefined,
        experimental_output: undefined,
      } as MastraTextGenerateOptions,
    };
  }

  /** Object-kind twin of {@link adaptTextMessages}. */
  adaptObjectMessages(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): {
    messages: RichChatMessage[];
    options: MastraObjectGenerateOptions;
  } {
    const mapped = applyParamMap(
      input.object_config as Record<string, unknown>,
      MASTRA_OBJECT_PARAM_MAP
    );
    const telemetry = options?.telemetry
      ? buildTelemetryMetadata(
          options.telemetry,
          metadata.props ?? {},
          input.name,
          input.agentmark_meta
        )
      : undefined;

    return {
      messages: input.messages,
      // `output` is statically invisible through applyParamMap's
      // Record<string, unknown>, but always present: `object_config.schema`
      // is schema-required and the param map transforms it to `output`.
      options: {
        ...mapped,
        ...(telemetry ? { telemetry } : {}),
      } as MastraObjectGenerateOptions,
    };
  }
}
