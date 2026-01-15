import type { PromptShape, Loader } from "@agentmark-ai/prompt-core";
import { AgentMark, EvalRegistry } from "@agentmark-ai/prompt-core";
import { ClaudeAgentAdapter } from "./adapter";
import { ClaudeAgentModelRegistry } from "./model-registry";
import { ClaudeAgentToolRegistry } from "./tool-registry";
import type { ClaudeAgentAdapterOptions } from "./types";

/**
 * Type alias for AgentMark client with Claude Agent SDK adapter
 */
export type ClaudeAgentMark<
  D extends PromptShape<D>,
  T extends ClaudeAgentToolRegistry<any, any>
> = AgentMark<D, ClaudeAgentAdapter<D, T>>;

/**
 * Options for creating an AgentMark client with Claude Agent SDK adapter
 */
export interface CreateClientOptions<
  D extends PromptShape<D>,
  T extends ClaudeAgentToolRegistry<any, any>
> {
  /** Loader for prompts (file, API, etc.) */
  loader?: Loader<D>;
  /** Model registry for model configuration */
  modelRegistry?: ClaudeAgentModelRegistry;
  /** Tool registry for custom tools */
  toolRegistry?: T;
  /** Eval registry for evaluations */
  evalRegistry?: EvalRegistry;
  /** Adapter-level options */
  adapterOptions?: ClaudeAgentAdapterOptions;
}

/**
 * Create an AgentMark client configured for Claude Agent SDK.
 *
 * This is the main entry point for using AgentMark with Claude Agent SDK.
 *
 * @param opts - Configuration options
 * @returns Configured AgentMark client
 *
 * @example
 * ```typescript
 * import { createAgentMarkClient, ClaudeAgentModelRegistry } from "@agentmark-ai/claude-agent-sdk-adapter";
 * import { FileLoader } from "@agentmark-ai/loader-file";
 *
 * const client = createAgentMarkClient({
 *   loader: new FileLoader({ dataDir: "./prompts" }),
 *   modelRegistry: ClaudeAgentModelRegistry.createDefault(),
 *   adapterOptions: {
 *     permissionMode: "bypassPermissions",
 *     maxTurns: 10,
 *   },
 * });
 *
 * // Load and format a prompt
 * const prompt = await client.loadTextPrompt("agent-task.prompt.mdx");
 * const adapted = await prompt.format({ props: { task: "Help me write code" } });
 *
 * // Execute with Claude Agent SDK
 * import { query } from "@anthropic-ai/claude-agent-sdk";
 *
 * for await (const message of query({
 *   prompt: adapted.prompt,
 *   options: adapted.options
 * })) {
 *   console.log(message);
 * }
 * ```
 */
export function createAgentMarkClient<
  D extends PromptShape<D> = PromptShape<Record<string, { input: unknown; output: unknown }>>,
  T extends ClaudeAgentToolRegistry<any, any> = ClaudeAgentToolRegistry<any, any>
>(
  opts: CreateClientOptions<D, T> = {}
): ClaudeAgentMark<D, T> {
  const adapter = new ClaudeAgentAdapter<D, T>(
    opts.modelRegistry ?? ClaudeAgentModelRegistry.createDefault(),
    opts.toolRegistry,
    opts.adapterOptions
  );

  return new AgentMark<D, ClaudeAgentAdapter<D, T>>({
    loader: opts.loader as Loader<D>,
    adapter,
    evalRegistry: opts.evalRegistry,
  });
}

// Re-export core classes
export { ClaudeAgentAdapter } from "./adapter";
export { ClaudeAgentModelRegistry } from "./model-registry";
export { ClaudeAgentToolRegistry } from "./tool-registry";

// Re-export MCP bridge utilities
export {
  createAgentMarkMcpServer,
  toClaudeAgentMcpServer,
} from "./mcp/agentmark-mcp-bridge";
export type {
  AgentMarkMcpServerConfig,
  CreateMcpServerOptions,
} from "./mcp/agentmark-mcp-bridge";

// Re-export telemetry hooks
export {
  createTelemetryHooks,
  mergeHooks,
} from "./hooks/telemetry-hooks";
export type {
  HookEventName,
  HooksConfig,
  TelemetryEvent,
  TelemetryEventHandler,
} from "./hooks/telemetry-hooks";

// Re-export OpenTelemetry constants
export {
  GenAIAttributes,
  AgentMarkAttributes,
  SpanNames,
  TRACER_SCOPE_NAME,
} from "./hooks/otel-hooks";

// Re-export EvalRegistry from prompt-core
export { EvalRegistry };

// Re-export tracing wrapper
export { withTracing } from "./traced";
export type { TracedInput, TracedResult, TracedTelemetryContext } from "./traced";

// Re-export types
export type {
  ClaudeAgentTextParams,
  ClaudeAgentObjectParams,
  ClaudeAgentQueryOptions,
  ClaudeAgentAdapterOptions,
  ClaudeAgentResult,
  AgentMarkToolDefinition,
  ModelConfig,
  ModelConfigCreator,
  TelemetryConfig,
  PermissionMode,
  HookCallback,
  HookInput,
  HookOutput,
  SystemPromptPreset,
  // MCP server configuration type (re-exported from SDK)
  McpServerConfig,
} from "./types";

// Re-export FormatWithDatasetOptions from prompt-core
export type { FormatWithDatasetOptions } from "@agentmark-ai/prompt-core";
