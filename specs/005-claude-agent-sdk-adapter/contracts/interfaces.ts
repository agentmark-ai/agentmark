/**
 * Claude Agent SDK Adapter - Type Contracts
 *
 * This file documents the public API interfaces for the adapter.
 * The actual implementation is in packages/claude-agent-sdk-adapter/src/types.ts
 *
 * @package @agentmark-ai/claude-agent-sdk-adapter
 */

// ============================================================================
// Permission Mode
// ============================================================================

/**
 * Permission modes for Claude Agent SDK tool execution.
 *
 * @default 'default' - When not specified, adapter uses 'default' mode
 */
export type PermissionMode =
  | "default" // Claude Agent SDK's built-in permission prompts
  | "acceptEdits" // Auto-accept file edit permissions
  | "bypassPermissions" // Skip all permission checks (use with caution)
  | "plan"; // Planning mode with limited tool access

// ============================================================================
// Adapter Output Types
// ============================================================================

/**
 * Configuration returned by adaptText() for text/chat prompts.
 * Pass this to Claude Agent SDK's query() function.
 */
export interface ClaudeAgentTextParams {
  /** Flattened prompt string for the agent */
  prompt: string;
  /** Claude Agent SDK query options */
  options: ClaudeAgentQueryOptions;
  /** Original rich messages for reference (useful for debugging/logging) */
  messages: RichChatMessage[];
}

/**
 * Configuration returned by adaptObject() for structured output prompts.
 * Includes JSON schema for response validation.
 */
export interface ClaudeAgentObjectParams<T = unknown> {
  /** Flattened prompt string */
  prompt: string;
  /** Options including outputFormat with JSON schema */
  options: ClaudeAgentQueryOptions & {
    outputFormat: {
      type: "json_schema";
      schema: object;
    };
  };
  /** Original rich messages */
  messages: RichChatMessage[];
  /** TypeScript type marker (compile-time only) */
  _outputType?: T;
}

// ============================================================================
// Query Options
// ============================================================================

/**
 * Options for Claude Agent SDK query() function.
 * All fields are optional; defaults are applied by the SDK.
 */
export interface ClaudeAgentQueryOptions {
  /** Model identifier (e.g., 'claude-sonnet-4-20250514') */
  model?: string;
  /** Maximum tokens for extended thinking (thinking-enabled models only) */
  maxThinkingTokens?: number;
  /** Maximum conversation turns before stopping */
  maxTurns?: number;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** Permission mode for tool access */
  permissionMode?: PermissionMode;
  /** Working directory for file operations */
  cwd?: string;
  /** System prompt (string or preset configuration) */
  systemPrompt?: string | SystemPromptPreset;
  /** Allowed tools whitelist */
  allowedTools?: string[];
  /** Disallowed tools blacklist */
  disallowedTools?: string[];
  /** MCP server configurations */
  mcpServers?: Record<string, unknown>;
  /** Hook callbacks for telemetry/behavior */
  hooks?: Record<string, { hooks: HookCallback[] }>;
  /** Structured output format (for adaptObject) */
  outputFormat?: {
    type: "json_schema";
    schema: object;
  };
}

// ============================================================================
// Adapter Options
// ============================================================================

/**
 * Options for configuring ClaudeAgentAdapter defaults.
 * These apply to all prompts unless overridden per-prompt.
 */
export interface ClaudeAgentAdapterOptions {
  /** Default permission mode (default: 'default') */
  permissionMode?: PermissionMode;
  /** Default working directory */
  cwd?: string;
  /** Default maximum turns */
  maxTurns?: number;
  /** Default maximum budget in USD */
  maxBudgetUsd?: number;
  /** Use Claude Code's system prompt preset */
  systemPromptPreset?: boolean;
  /** Default allowed tools */
  allowedTools?: string[];
  /** Default disallowed tools */
  disallowedTools?: string[];
}

// ============================================================================
// Tool Registry Types
// ============================================================================

/**
 * Definition for a custom tool to be registered.
 */
export interface AgentMarkToolDefinition {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for parameters */
  parameters: object;
  /** Async execution function */
  execute: (args: unknown) => Promise<unknown>;
}

// ============================================================================
// Model Registry Types
// ============================================================================

/**
 * Pattern for matching model names in the registry.
 */
export type ModelPattern = string | RegExp | string[];

/**
 * Function that creates model configuration from a model name.
 */
export type ModelConfigCreator = (
  modelName: string,
  options?: AdaptOptions
) => ModelConfig;

/**
 * Model configuration returned by the registry.
 */
export interface ModelConfig {
  /** Model name to use */
  model: string;
  /** Maximum thinking tokens (for thinking-enabled models) */
  maxThinkingTokens?: number;
}

// ============================================================================
// Telemetry Types
// ============================================================================

/**
 * Configuration for telemetry hooks.
 */
export interface TelemetryConfig {
  /** Enable/disable telemetry */
  isEnabled: boolean;
  /** Unique function identifier for tracing */
  functionId?: string;
  /** Additional metadata to include in events */
  metadata?: Record<string, unknown>;
  /** Name of the prompt being executed */
  promptName: string;
  /** Props passed to the prompt */
  props: Record<string, unknown>;
}

/**
 * Hook event names supported by Claude Agent SDK.
 */
export type HookEventName =
  | "SessionStart"
  | "SessionEnd"
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "Stop"
  | "SubagentStart"
  | "SubagentStop";

// ============================================================================
// Hook Types
// ============================================================================

/**
 * Hook callback function signature.
 */
export type HookCallback = (
  input: HookInput,
  toolUseId: string | null,
  options: { signal: AbortSignal }
) => Promise<HookOutput>;

/**
 * Input data provided to hook callbacks.
 */
export interface HookInput {
  /** Name of the hook event */
  hook_event_name: string;
  /** Session identifier */
  session_id: string;
  /** Path to transcript file (if available) */
  transcript_path?: string;
  /** Working directory */
  cwd?: string;
  /** Tool name (for tool events) */
  tool_name?: string;
  /** Tool input arguments */
  tool_input?: unknown;
  /** Tool response (for post-tool events) */
  tool_response?: unknown;
  /** Error message (for failure events) */
  error?: string;
  /** Additional event-specific data */
  [key: string]: unknown;
}

/**
 * Output from hook callbacks to control SDK behavior.
 */
export interface HookOutput {
  /** Continue execution (default: true) */
  continue?: boolean;
  /** Suppress output display */
  suppressOutput?: boolean;
  /** System message to inject */
  systemMessage?: string;
  /** Hook-specific output data */
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision?: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
    additionalContext?: string;
  };
}

// ============================================================================
// Supporting Types (from AgentMark core)
// ============================================================================

/**
 * Rich chat message from AgentMark prompt-core.
 * Re-exported for reference; actual type from @agentmark-ai/prompt-core.
 */
export interface RichChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string }
  | { type: "tool_call"; tool_call: unknown }
  | { type: "tool_result"; tool_result: unknown };

/**
 * Adapt options from AgentMark prompt-core.
 */
export interface AdaptOptions {
  telemetry?: TelemetryConfig;
  [key: string]: unknown;
}

/**
 * System prompt preset configuration.
 */
export interface SystemPromptPreset {
  type: "preset";
  preset: "claude_code";
  append?: string;
}
