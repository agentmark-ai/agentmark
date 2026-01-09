import type {
  TextConfig,
  ImageConfig,
  ObjectConfig,
  SpeechConfig,
  PromptMetadata,
  AdaptOptions,
  PromptShape,
  KeysWithKind,
  Adapter,
  RichChatMessage,
} from "@agentmark-ai/prompt-core";
import { ClaudeAgentModelRegistry } from "./model-registry";
import { ClaudeAgentToolRegistry } from "./tool-registry";
import {
  createAgentMarkMcpServer,
  toClaudeAgentMcpServer,
} from "./mcp/agentmark-mcp-bridge";
import { createTelemetryHooks, mergeHooks } from "./hooks/telemetry-hooks";
import { createOtelHooks, combineWithOtelHooks } from "./hooks/otel-hooks";
import type {
  ClaudeAgentTextParams,
  ClaudeAgentObjectParams,
  ClaudeAgentAdapterOptions,
  ClaudeAgentQueryOptions,
  HookCallbackMatcher,
  McpServerConfig,
} from "./types";

/**
 * AgentMark adapter for Claude Agent SDK.
 *
 * This adapter bridges AgentMark's prompt framework with Anthropic's Claude Agent SDK,
 * enabling autonomous agent execution with built-in tools.
 *
 * Key differences from other adapters:
 * - Execution is agentic (autonomous loop) rather than request-response
 * - Uses AsyncGenerator streaming instead of ReadableStream
 * - Has built-in tools (Read, Write, Bash, etc.)
 * - Includes permission system for tool access control
 *
 * @example
 * ```typescript
 * import { ClaudeAgentAdapter, ClaudeAgentModelRegistry } from "@agentmark-ai/claude-agent-sdk-adapter";
 *
 * const adapter = new ClaudeAgentAdapter(
 *   ClaudeAgentModelRegistry.createDefault(),
 *   toolRegistry,
 *   { permissionMode: 'bypassPermissions' }
 * );
 * ```
 */
export class ClaudeAgentAdapter<
  T extends PromptShape<T>,
  R extends ClaudeAgentToolRegistry<any, any> = ClaudeAgentToolRegistry<any, any>
> implements Adapter<T>
{
  declare readonly __dict: T;
  readonly __name = "claude-agent-sdk";

  constructor(
    private modelRegistry: ClaudeAgentModelRegistry,
    private toolRegistry?: R,
    private adapterOptions?: ClaudeAgentAdapterOptions
  ) {}

  /**
   * Convert RichChatMessages to a prompt string for Claude Agent SDK.
   *
   * Claude Agent SDK expects a prompt string, not message arrays.
   * System messages are handled separately via the systemPrompt option.
   */
  private messagesToPrompt(messages: RichChatMessage[]): string {
    return messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        if (typeof m.content === "string") {
          return m.content;
        }
        // Handle rich content (array of parts)
        return m.content
          .map((part) => {
            if (part.type === "text") {
              return part.text;
            }
            // For file/image parts, include a placeholder
            if (part.type === "file" || part.type === "image") {
              return `[Attached ${part.type}]`;
            }
            return "";
          })
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");
  }

  /**
   * Extract system prompt from messages.
   */
  private extractSystemPrompt(messages: RichChatMessage[]): string | undefined {
    const systemMsg = messages.find((m) => m.role === "system");
    if (!systemMsg) return undefined;

    if (typeof systemMsg.content === "string") {
      return systemMsg.content;
    }

    // Handle rich content
    const content = systemMsg.content as Array<{ type: string; text?: string }>;
    return content
      .filter((part: { type: string }) => part.type === "text")
      .map((part: { type: string; text?: string }) => part.text ?? "")
      .join("\n");
  }

  /**
   * Convert tools defined in prompt frontmatter to AgentMark tool definitions.
   * Only includes tools that have a registered executor in the tool registry.
   */
  private convertPromptToolsToAgentMarkTools(
    tools: Record<string, { description: string; parameters: Record<string, unknown> }>
  ): Array<{ name: string; description: string; parameters: Record<string, unknown>; execute: (args: unknown) => Promise<unknown> }> {
    return Object.entries(tools)
      .filter(([name]) => this.toolRegistry?.has(name))
      .map(([name, toolDef]) => {
        const executor = this.toolRegistry!.get(name as never) as unknown as (args: unknown) => unknown;
        return {
          name,
          description: toolDef.description,
          parameters: toolDef.parameters,
          execute: async (args: unknown) => executor(args),
        };
      });
  }

  /**
   * Build common query options from config and adapter settings.
   */
  private buildQueryOptions(
    modelConfig: { model: string; maxThinkingTokens?: number },
    systemPrompt: string | undefined,
    settings: Record<string, unknown>,
    options: AdaptOptions,
    metadata: PromptMetadata,
    promptName: string
  ): ClaudeAgentQueryOptions {
    // Build MCP servers for AgentMark tools
    // Use McpServerConfig type for compatibility with Claude Agent SDK
    const mcpServers: Record<string, McpServerConfig> = {};

    // Add tools defined in the prompt's frontmatter
    // Tool executors are matched from the tool registry
    if (settings.tools && typeof settings.tools === 'object') {
      const promptTools = this.convertPromptToolsToAgentMarkTools(
        settings.tools as Record<string, { description: string; parameters: Record<string, unknown> }>
      );
      if (promptTools.length > 0) {
        const mcpServer = createAgentMarkMcpServer("prompt-tools", promptTools);
        mcpServers["prompt-tools"] = toClaudeAgentMcpServer(mcpServer) as unknown as McpServerConfig;
      }
    }

    // Build telemetry hooks (basic event hooks + OTEL span emission)
    let hooks: Record<string, HookCallbackMatcher[]> = {};
    if (options.telemetry?.isEnabled) {
      // Basic telemetry hooks for event capture
      const telemetryHooks = createTelemetryHooks({
        isEnabled: true,
        functionId: options.telemetry.functionId,
        metadata: options.telemetry.metadata,
        promptName,
        props: metadata.props,
      });
      hooks = mergeHooks(hooks, telemetryHooks);

      // OTEL hooks for span emission (uses global tracer from AgentMarkSDK.initialize())
      const additionalAttributes: Record<string, string | number | boolean> = {};
      if (options.telemetry.metadata?.session_id) {
        additionalAttributes["agentmark.session_id"] = String(options.telemetry.metadata.session_id);
      }
      if (options.telemetry.metadata?.session_name) {
        additionalAttributes["agentmark.session_name"] = String(options.telemetry.metadata.session_name);
      }
      if (options.telemetry.metadata?.trace_name) {
        additionalAttributes["agentmark.trace_name"] = String(options.telemetry.metadata.trace_name);
      }

      const { hooks: otelHooks } = createOtelHooks({
        promptName,
        model: modelConfig.model,
        userId: options.telemetry.metadata?.user_id as string | undefined,
        additionalAttributes,
      });
      hooks = combineWithOtelHooks(otelHooks, hooks);
    }

    // Build system prompt configuration
    let systemPromptConfig: string | { type: 'preset'; preset: 'claude_code'; append?: string } | undefined;
    if (this.adapterOptions?.systemPromptPreset) {
      systemPromptConfig = {
        type: "preset" as const,
        preset: "claude_code" as const,
        ...(systemPrompt && { append: systemPrompt }),
      };
    } else if (systemPrompt) {
      systemPromptConfig = systemPrompt;
    }

    const queryOptions: ClaudeAgentQueryOptions = {
      model: modelConfig.model,
      ...(modelConfig.maxThinkingTokens && {
        maxThinkingTokens: modelConfig.maxThinkingTokens,
      }),
      ...((settings as Record<string, unknown>).max_calls ? { maxTurns: (settings as Record<string, unknown>).max_calls as number } : {}),
      ...(this.adapterOptions?.permissionMode && {
        permissionMode: this.adapterOptions.permissionMode,
      }),
      ...(this.adapterOptions?.cwd && { cwd: this.adapterOptions.cwd }),
      ...(this.adapterOptions?.maxBudgetUsd && {
        maxBudgetUsd: this.adapterOptions.maxBudgetUsd,
      }),
      ...(this.adapterOptions?.maxTurns && {
        maxTurns: this.adapterOptions.maxTurns,
      }),
      ...(Object.keys(mcpServers).length > 0 && { mcpServers }),
      ...(Object.keys(hooks).length > 0 && { hooks }),
      ...(systemPromptConfig && { systemPrompt: systemPromptConfig }),
      ...(this.adapterOptions?.allowedTools && {
        allowedTools: this.adapterOptions.allowedTools,
      }),
      ...(this.adapterOptions?.disallowedTools && {
        disallowedTools: this.adapterOptions.disallowedTools,
      }),
    };

    return queryOptions;
  }

  /**
   * Adapt a text configuration for Claude Agent SDK.
   *
   * @param input - Text configuration from AgentMark prompt
   * @param options - Adapt options including telemetry settings
   * @param metadata - Prompt metadata including props
   * @returns Configuration for Claude Agent SDK query()
   */
  async adaptText<_K extends KeysWithKind<T, "text"> & string>(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<ClaudeAgentTextParams> {
    const { model_name, ...settings } = input.text_config;
    const modelConfig = this.modelRegistry.getModelConfig(model_name, options);
    const systemPrompt = this.extractSystemPrompt(input.messages);

    const queryOptions = this.buildQueryOptions(
      modelConfig,
      systemPrompt,
      settings,
      options,
      metadata,
      input.name
    );

    return {
      prompt: this.messagesToPrompt(input.messages),
      options: queryOptions,
      messages: input.messages,
    };
  }

  /**
   * Adapt an object configuration for Claude Agent SDK with structured output.
   *
   * @param input - Object configuration from AgentMark prompt
   * @param options - Adapt options including telemetry settings
   * @param metadata - Prompt metadata including props
   * @returns Configuration for Claude Agent SDK query() with outputFormat
   */
  async adaptObject<K extends KeysWithKind<T, "object"> & string>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<ClaudeAgentObjectParams<T[K]["output"]>> {
    const { model_name, schema, ...settings } = input.object_config;
    const modelConfig = this.modelRegistry.getModelConfig(model_name, options);
    const systemPrompt = this.extractSystemPrompt(input.messages);

    const queryOptions = this.buildQueryOptions(
      modelConfig,
      systemPrompt,
      settings,
      options,
      metadata,
      input.name
    );

    // Add structured output format
    const optionsWithOutput = {
      ...queryOptions,
      outputFormat: {
        type: "json_schema" as const,
        schema: schema,
      },
    };

    return {
      prompt: this.messagesToPrompt(input.messages),
      options: optionsWithOutput,
      messages: input.messages,
    };
  }

  /**
   * Image generation is not supported by Claude Agent SDK.
   *
   * @throws Error with guidance to use a different adapter
   */
  adaptImage<_K extends KeysWithKind<T, "image"> & string>(
    _input: ImageConfig,
    _options: AdaptOptions
  ): never {
    throw new Error(
      "Image generation is not supported by Claude Agent SDK. " +
        "Consider using the Vercel AI SDK adapter with an image model like DALL-E or Stable Diffusion."
    );
  }

  /**
   * Speech generation is not supported by Claude Agent SDK.
   *
   * @throws Error with guidance to use a different adapter
   */
  adaptSpeech<_K extends KeysWithKind<T, "speech"> & string>(
    _input: SpeechConfig,
    _options: AdaptOptions
  ): never {
    throw new Error(
      "Speech generation is not supported by Claude Agent SDK. " +
        "Consider using the Vercel AI SDK adapter with a speech model like OpenAI TTS."
    );
  }
}
