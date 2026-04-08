import type {
  TelemetryConfig,
  HookCallback,
  HookCallbackMatcher,
  HookInput,
  HookOutput,
} from "../types";

/**
 * Hook event names from Claude Agent SDK
 */
export type HookEventName =
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Stop'
  | 'UserPromptSubmit'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PermissionRequest'
  | 'Notification';

/**
 * Hook configuration for Claude Agent SDK - array of matchers per event
 */
export type HooksConfig = Partial<Record<HookEventName, HookCallbackMatcher[]>>;

/**
 * Telemetry event data for external consumers
 */
export interface TelemetryEvent {
  eventName: string;
  timestamp: number;
  sessionId: string;
  promptName: string;
  data: Record<string, unknown>;
}

/**
 * Telemetry event handler type
 */
export type TelemetryEventHandler = (event: TelemetryEvent) => void | Promise<void>;

/**
 * Creates telemetry hooks for Claude Agent SDK that integrate with AgentMark's
 * tracing system.
 *
 * The hooks capture key events during agent execution:
 * - Session start/end
 * - Tool use (before and after)
 * - Subagent events
 * - Errors
 *
 * @param config - Telemetry configuration
 * @param eventHandler - Optional handler for telemetry events
 * @returns Hook configuration for Claude Agent SDK
 *
 * @example
 * ```typescript
 * const hooks = createTelemetryHooks({
 *   isEnabled: true,
 *   promptName: 'my-agent-task',
 *   props: { userId: '123' },
 * });
 *
 * const result = await query({
 *   prompt: "Do something",
 *   options: { hooks }
 * });
 * ```
 */
export function createTelemetryHooks(
  config: TelemetryConfig,
  eventHandler?: TelemetryEventHandler
): HooksConfig {
  if (!config.isEnabled) {
    return {};
  }

  const emitEvent = async (
    eventName: string,
    sessionId: string,
    data: Record<string, unknown>
  ): Promise<void> => {
    if (eventHandler) {
      await eventHandler({
        eventName,
        timestamp: Date.now(),
        sessionId,
        promptName: config.promptName,
        data: {
          ...data,
          functionId: config.functionId,
          metadata: config.metadata,
          props: config.props,
        },
      });
    }
  };

  const sessionStartHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    await emitEvent('session_start', input.session_id, {
      cwd: input.cwd,
      transcript_path: input.transcript_path,
    });

    return { continue: true };
  };

  const sessionEndHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    await emitEvent('session_end', input.session_id, {
      reason: input.reason,
    });

    return { continue: true };
  };

  const preToolUseHook: HookCallback = async (
    input: HookInput,
    toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    await emitEvent('tool_start', input.session_id, {
      tool_name: input.tool_name,
      tool_input: input.tool_input,
      tool_use_id: toolUseId,
    });

    return { continue: true };
  };

  const postToolUseHook: HookCallback = async (
    input: HookInput,
    toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    await emitEvent('tool_end', input.session_id, {
      tool_name: input.tool_name,
      tool_response: input.tool_response,
      tool_use_id: toolUseId,
    });

    return { continue: true };
  };

  const postToolUseFailureHook: HookCallback = async (
    input: HookInput,
    toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    await emitEvent('tool_error', input.session_id, {
      tool_name: input.tool_name,
      error: input.error,
      tool_use_id: toolUseId,
    });

    return { continue: true };
  };

  const stopHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    await emitEvent('agent_stop', input.session_id, {
      reason: input.reason,
      result: input.result,
    });

    return { continue: true };
  };

  const subagentStartHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    await emitEvent('subagent_start', input.session_id, {
      subagent_type: input.subagent_type,
      subagent_prompt: input.subagent_prompt,
    });

    return { continue: true };
  };

  const subagentStopHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    await emitEvent('subagent_stop', input.session_id, {
      subagent_result: input.subagent_result,
    });

    return { continue: true };
  };

  return {
    SessionStart: [{ hooks: [sessionStartHook] }],
    SessionEnd: [{ hooks: [sessionEndHook] }],
    PreToolUse: [{ hooks: [preToolUseHook] }],
    PostToolUse: [{ hooks: [postToolUseHook] }],
    PostToolUseFailure: [{ hooks: [postToolUseFailureHook] }],
    Stop: [{ hooks: [stopHook] }],
    SubagentStart: [{ hooks: [subagentStartHook] }],
    SubagentStop: [{ hooks: [subagentStopHook] }],
  };
}

/**
 * Merges multiple hook configurations together.
 * Each config has arrays of matchers per event - we concatenate the arrays.
 *
 * @param configs - Array of hook configurations to merge
 * @returns Merged hook configuration
 */
export function mergeHooks(...configs: HooksConfig[]): HooksConfig {
  const merged: HooksConfig = {};

  for (const config of configs) {
    for (const [eventName, matchers] of Object.entries(config)) {
      const key = eventName as HookEventName;
      if (merged[key]) {
        merged[key] = [...merged[key]!, ...matchers];
      } else {
        merged[key] = [...matchers];
      }
    }
  }

  return merged;
}
