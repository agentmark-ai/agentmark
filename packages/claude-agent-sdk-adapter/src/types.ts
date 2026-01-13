import type {
  RichChatMessage,
  AdaptOptions,
} from "@agentmark-ai/prompt-core";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

// Re-export McpServerConfig from SDK for convenience
export type { McpServerConfig };

/**
 * Permission modes for Claude Agent SDK
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

/**
 * Telemetry context passed from adapter to withTracing() wrapper.
 * Only populated when telemetry is enabled in adapter options.
 */
export interface TracedTelemetryContext {
  /** Whether telemetry is enabled */
  isEnabled: boolean;
  /** Prompt name for span naming and attributes */
  promptName: string;
  /** System prompt (for gen_ai.system_prompt attribute) */
  systemPrompt?: string;
  /** Model name */
  model?: string;
  /** Props passed to the prompt template */
  props?: Record<string, unknown>;
  /** Additional metadata from the prompt frontmatter */
  meta?: Record<string, unknown>;
  /** Custom metadata passed via telemetry options (appears as agentmark.metadata.* attributes) */
  metadata?: Record<string, unknown>;
  /** Dataset run ID for experiment tracking */
  datasetRunId?: string;
  /** Dataset run name for experiment tracking */
  datasetRunName?: string;
  /** Dataset item name/index for experiment tracking */
  datasetItemName?: string;
  /** Expected output for dataset item */
  datasetExpectedOutput?: string;
  /** Path to the dataset file */
  datasetPath?: string;
}

/**
 * Configuration returned by adaptText for Claude Agent SDK
 */
export interface ClaudeAgentTextParams {
  /** Query parameters for Claude Agent SDK */
  query: {
    /** The prompt string to send to the agent */
    prompt: string;
    /** Claude Agent SDK query options */
    options: ClaudeAgentQueryOptions;
  };
  /** Original messages for reference */
  messages: RichChatMessage[];
  /** Telemetry context for withTracing() wrapper (only present if telemetry enabled) */
  telemetry?: TracedTelemetryContext;
}

/**
 * Configuration returned by adaptObject for structured output
 */
export interface ClaudeAgentObjectParams<T = unknown> {
  /** Query parameters for Claude Agent SDK */
  query: {
    /** The prompt string to send to the agent */
    prompt: string;
    /** Claude Agent SDK query options with output format */
    options: ClaudeAgentQueryOptions & {
      outputFormat: {
        type: 'json_schema';
        schema: Record<string, unknown>;
      };
    };
  };
  /** Original messages for reference */
  messages: RichChatMessage[];
  /** Schema type marker */
  _outputType?: T;
  /** Telemetry context for withTracing() wrapper (only present if telemetry enabled) */
  telemetry?: TracedTelemetryContext;
}

/**
 * Hook callback matcher - matches SDK's HookCallbackMatcher type
 */
export interface HookCallbackMatcher {
  /** Optional matcher pattern */
  matcher?: string;
  /** Array of hook callbacks */
  hooks: HookCallback[];
  /** Timeout in seconds for all hooks in this matcher */
  timeout?: number;
}

/**
 * Query options for Claude Agent SDK
 */
export interface ClaudeAgentQueryOptions {
  /** Model to use (e.g., 'claude-sonnet-4-20250514') */
  model?: string;
  /** Maximum thinking tokens for extended thinking */
  maxThinkingTokens?: number;
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** Permission mode for tool access */
  permissionMode?: PermissionMode;
  /** Working directory */
  cwd?: string;
  /** System prompt configuration */
  systemPrompt?: string | SystemPromptPreset;
  /** Allowed tools */
  allowedTools?: string[];
  /** Disallowed tools */
  disallowedTools?: string[];
  /** MCP servers configuration */
  mcpServers?: Record<string, McpServerConfig>;
  /** Hook callbacks for telemetry - array of matchers per event */
  hooks?: Record<string, HookCallbackMatcher[]>;
  /** Structured output format */
  outputFormat?: {
    type: 'json_schema';
    schema: Record<string, unknown>;
  };
}

/**
 * System prompt preset configuration
 */
export interface SystemPromptPreset {
  type: 'preset';
  preset: 'claude_code';
  append?: string;
}

/**
 * Hook callback function type
 */
export type HookCallback = (
  input: HookInput,
  toolUseId: string | null,
  options: { signal: AbortSignal }
) => Promise<HookOutput>;

/**
 * Hook input data
 */
export interface HookInput {
  hook_event_name: string;
  session_id: string;
  transcript_path?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  error?: string;
  [key: string]: unknown;
}

/**
 * Hook output for controlling SDK behavior
 */
export interface HookOutput {
  continue?: boolean;
  suppressOutput?: boolean;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
    additionalContext?: string;
  };
}

/**
 * Adapter-level options for ClaudeAgentAdapter
 */
export interface ClaudeAgentAdapterOptions {
  /** Permission mode for tool access (default: 'default') */
  permissionMode?: PermissionMode;
  /** Working directory for the agent */
  cwd?: string;
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** Use Claude Code's built-in system prompt preset */
  systemPromptPreset?: boolean;
  /** Allowed tools (whitelist) */
  allowedTools?: string[];
  /** Disallowed tools (blacklist) */
  disallowedTools?: string[];
}

/**
 * Tool definition for AgentMark tools to be bridged to MCP
 */
export interface AgentMarkToolDefinition {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** JSON Schema for parameters */
  parameters: Record<string, unknown>;
  /** Tool execution function */
  execute: (args: unknown) => Promise<unknown>;
}

/**
 * Result from Claude Agent SDK execution
 */
export interface ClaudeAgentResult {
  type: 'success' | 'error';
  result?: string;
  structured_output?: unknown;
  session_id: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  total_cost_usd: number;
  duration_ms: number;
  errors?: string[];
}

/**
 * Model configuration creator function type
 */
export type ModelConfigCreator = (
  modelName: string,
  options?: AdaptOptions
) => ModelConfig;

/**
 * Model configuration returned by registry
 */
export interface ModelConfig {
  /** Model name to use */
  model: string;
  /** Maximum thinking tokens for extended thinking models */
  maxThinkingTokens?: number;
}

/**
 * Telemetry configuration for hooks
 */
export interface TelemetryConfig {
  isEnabled: boolean;
  functionId?: string;
  metadata?: Record<string, unknown>;
  promptName: string;
  props: Record<string, unknown>;
}

/**
 * Configuration for OpenTelemetry hooks.
 * By default, uses the global tracer from AgentMarkSDK.initialize().
 * Optionally accepts a custom TracerProvider.
 */
export interface OtelHooksConfig {
  /**
   * Optional TracerProvider instance.
   * If not provided, uses the global tracer from AgentMarkSDK.initialize().
   */
  tracerProvider?: unknown;
  /** Prompt name for correlation (appears in agentmark.prompt_name attribute) */
  promptName: string;
  /** Model name being used (appears in gen_ai.request.model attribute) */
  model?: string;
  /** User ID for correlation (appears in agentmark.user_id attribute) */
  userId?: string;
  /** User's input prompt (appears in gen_ai.request.input attribute) */
  userPrompt?: string;
  /** Props passed to the prompt template (appears in agentmark.props attribute) */
  props?: Record<string, unknown>;
  /** Additional metadata from the prompt frontmatter (appears in agentmark.meta attribute) */
  agentmarkMeta?: Record<string, unknown>;
  /** Additional attributes to include on all spans */
  additionalAttributes?: Record<string, string | number | boolean>;
}

/**
 * Context for maintaining span hierarchy across hook callbacks.
 * This allows tool spans to be created as children of the session span.
 */
export interface TelemetryContext {
  /** Root session span */
  rootSpan?: unknown;
  /** Active tool spans keyed by tool_use_id */
  activeToolSpans: Map<string, unknown>;
  /** Active subagent spans keyed by session_id */
  activeSubagentSpans: Map<string, unknown>;
  /** OpenTelemetry Tracer instance */
  tracer: unknown;
  /** Configuration reference */
  config: OtelHooksConfig;
}
