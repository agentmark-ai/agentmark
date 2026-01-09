/**
 * OpenTelemetry hooks for Claude Agent SDK adapter.
 * Emits spans following GenAI semantic conventions.
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */

import type { HookCallback, HookInput, HookOutput, OtelHooksConfig, TelemetryContext } from "../types";
import type { HooksConfig } from "./telemetry-hooks";

// Type definitions for OpenTelemetry API (to avoid hard dependency)
interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: { code: number; message?: string }): void;
  recordException(exception: Error): void;
  end(): void;
  spanContext(): { traceId: string; spanId: string };
}

interface Tracer {
  startSpan(name: string, options?: { attributes?: Record<string, string | number | boolean> }, context?: unknown): Span;
}

interface TracerProvider {
  getTracer(name: string, version?: string): Tracer;
}

interface OtelApi {
  trace: {
    getTracer(name: string, version?: string): Tracer;
  };
}

/**
 * The instrumentation scope name used for all AgentMark spans.
 * This scope name is registered in the normalizer for proper span transformation.
 */
export const TRACER_SCOPE_NAME = "agentmark";

/**
 * Get the OpenTelemetry tracer from the global provider.
 * Returns null if @opentelemetry/api is not available or not initialized.
 * @internal
 */
function getGlobalTracer(): Tracer | null {
  try {
    // Dynamic require to avoid hard dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require("@opentelemetry/api") as OtelApi;
    return api.trace.getTracer(TRACER_SCOPE_NAME);
  } catch {
    // @opentelemetry/api not installed
    return null;
  }
}

// SpanStatusCode values from @opentelemetry/api
const SpanStatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
} as const;

/**
 * OpenTelemetry GenAI Semantic Convention attribute names.
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
export const GenAIAttributes = {
  /** AI system identifier (e.g., "anthropic") */
  SYSTEM: "gen_ai.system",
  /** Requested model name */
  REQUEST_MODEL: "gen_ai.request.model",
  /** Maximum tokens requested */
  REQUEST_MAX_TOKENS: "gen_ai.request.max_tokens",
  /** Temperature setting */
  REQUEST_TEMPERATURE: "gen_ai.request.temperature",
  /** Response identifier */
  RESPONSE_ID: "gen_ai.response.id",
  /** Model that actually responded */
  RESPONSE_MODEL: "gen_ai.response.model",
  /** Completion finish reasons (JSON array) */
  RESPONSE_FINISH_REASONS: "gen_ai.response.finish_reasons",
  /** Input token count */
  USAGE_INPUT_TOKENS: "gen_ai.usage.input_tokens",
  /** Output token count */
  USAGE_OUTPUT_TOKENS: "gen_ai.usage.output_tokens",
  /** Tool name */
  TOOL_NAME: "gen_ai.tool.name",
  /** Tool call identifier */
  TOOL_CALL_ID: "gen_ai.tool.call.id",
} as const;

/**
 * AgentMark-specific span attribute names for correlation.
 */
export const AgentMarkAttributes = {
  /** AgentMark prompt identifier */
  PROMPT_NAME: "agentmark.prompt_name",
  /** Session correlation ID */
  SESSION_ID: "agentmark.session_id",
  /** User correlation ID */
  USER_ID: "agentmark.user_id",
  /** Function identifier */
  FUNCTION_ID: "agentmark.function_id",
  /** Subagent type */
  SUBAGENT_TYPE: "agentmark.subagent_type",
} as const;

/**
 * Standard span names following OTEL GenAI conventions.
 */
export const SpanNames = {
  /** Root session span */
  SESSION: "gen_ai.session",
  /** Tool invocation span */
  TOOL_CALL: "gen_ai.tool.call",
  /** Subagent execution span */
  SUBAGENT: "gen_ai.subagent",
} as const;

/**
 * Creates a new telemetry context for tracking spans.
 * Uses the global tracer from AgentMarkSDK.initialize() or a provided TracerProvider.
 * @param config - OTEL hooks configuration
 * @returns New telemetry context, or null if OTEL is not available
 */
export function createTelemetryContext(config: OtelHooksConfig): TelemetryContext | null {
  let tracer: Tracer | null = null;

  if (config.tracerProvider) {
    // Use provided TracerProvider
    const provider = config.tracerProvider as TracerProvider;
    tracer = provider.getTracer(TRACER_SCOPE_NAME);
  } else {
    // Use global tracer from AgentMarkSDK.initialize()
    tracer = getGlobalTracer();
  }

  if (!tracer) {
    // OTEL not available
    return null;
  }

  return {
    rootSpan: undefined,
    activeToolSpans: new Map(),
    activeSubagentSpans: new Map(),
    tracer,
    config,
  };
}

/**
 * Gets common attributes for all spans.
 * @internal
 */
function getCommonAttributes(
  config: OtelHooksConfig,
  sessionId?: string
): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {
    [GenAIAttributes.SYSTEM]: "anthropic",
    [AgentMarkAttributes.PROMPT_NAME]: config.promptName,
  };

  if (config.model) {
    attrs[GenAIAttributes.REQUEST_MODEL] = config.model;
  }

  if (sessionId) {
    attrs[AgentMarkAttributes.SESSION_ID] = sessionId;
  }

  if (config.userId) {
    attrs[AgentMarkAttributes.USER_ID] = config.userId;
  }

  if (config.additionalAttributes) {
    Object.assign(attrs, config.additionalAttributes);
  }

  return attrs;
}

/**
 * Creates OpenTelemetry hooks for Claude Agent SDK that emit spans
 * following GenAI semantic conventions.
 *
 * Uses the global tracer from AgentMarkSDK.initialize() automatically.
 * You can also provide a custom TracerProvider if needed.
 *
 * @param config - OTEL hooks configuration
 * @returns Hook configuration and telemetry context, or null hooks if OTEL not available
 *
 * @example
 * ```typescript
 * // Simple usage - uses global tracer from AgentMarkSDK.initialize()
 * const { hooks } = createOtelHooks({
 *   promptName: "my-agent-task",
 *   model: "claude-sonnet-4-20250514",
 *   userId: "user-123",
 * });
 *
 * const result = await query({
 *   prompt: "Do something",
 *   options: { hooks }
 * });
 * ```
 */
export function createOtelHooks(config: OtelHooksConfig): {
  hooks: HooksConfig;
  context: TelemetryContext | null;
} {
  const ctx = createTelemetryContext(config);

  // If OTEL is not available, return empty hooks
  if (!ctx) {
    return { hooks: {}, context: null };
  }

  const tracer = ctx.tracer as Tracer;

  // SessionStart: Create root span
  const sessionStartHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    console.log("[OTEL Hook] SessionStart triggered, session_id:", input.session_id);
    const attributes = getCommonAttributes(config, input.session_id);

    const span = tracer.startSpan(SpanNames.SESSION, { attributes });
    console.log("[OTEL Hook] Root span created");
    ctx.rootSpan = span;

    return { continue: true };
  };

  // SessionEnd: End root span with usage attributes
  const sessionEndHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    console.log("[OTEL Hook] SessionEnd input keys:", Object.keys(input));
    console.log("[OTEL Hook] SessionEnd input:", JSON.stringify(input, null, 2));
    const rootSpan = ctx.rootSpan as Span | undefined;
    if (rootSpan) {
      // Add finish reason if available
      if (input.reason) {
        rootSpan.setAttribute(
          GenAIAttributes.RESPONSE_FINISH_REASONS,
          JSON.stringify([input.reason])
        );
      }

      // Add usage if available
      if (typeof input.input_tokens === "number") {
        rootSpan.setAttribute(GenAIAttributes.USAGE_INPUT_TOKENS, input.input_tokens);
      }
      if (typeof input.output_tokens === "number") {
        rootSpan.setAttribute(GenAIAttributes.USAGE_OUTPUT_TOKENS, input.output_tokens);
      }

      rootSpan.setStatus({ code: SpanStatusCode.OK });
      rootSpan.end();
      ctx.rootSpan = undefined;
    }

    return { continue: true };
  };

  // PreToolUse: Create child tool span
  const preToolUseHook: HookCallback = async (
    input: HookInput,
    toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    console.log("[OTEL Hook] PreToolUse triggered, tool:", input.tool_name);
    const attributes: Record<string, string | number | boolean> = {
      ...getCommonAttributes(config, input.session_id),
    };

    if (input.tool_name) {
      attributes[GenAIAttributes.TOOL_NAME] = String(input.tool_name);
    }

    if (toolUseId) {
      attributes[GenAIAttributes.TOOL_CALL_ID] = toolUseId;
    }

    // Add tool input
    if (input.tool_input !== undefined) {
      try {
        attributes["gen_ai.tool.input"] = JSON.stringify(input.tool_input);
      } catch {
        attributes["gen_ai.tool.input"] = String(input.tool_input);
      }
    }

    const spanName = input.tool_name
      ? `${SpanNames.TOOL_CALL} ${input.tool_name}`
      : SpanNames.TOOL_CALL;

    const toolSpan = tracer.startSpan(spanName, { attributes });

    if (toolUseId) {
      ctx.activeToolSpans.set(toolUseId, toolSpan);
    }

    return { continue: true };
  };

  // PostToolUse: End tool span with OK status
  const postToolUseHook: HookCallback = async (
    input: HookInput,
    toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    console.log("[OTEL Hook] PostToolUse triggered, toolUseId:", toolUseId);
    if (toolUseId) {
      const toolSpan = ctx.activeToolSpans.get(toolUseId) as Span | undefined;
      if (toolSpan) {
        // Add tool output/response
        if (input.tool_response !== undefined) {
          try {
            toolSpan.setAttribute("gen_ai.tool.output", JSON.stringify(input.tool_response));
          } catch {
            toolSpan.setAttribute("gen_ai.tool.output", String(input.tool_response));
          }
        }
        toolSpan.setStatus({ code: SpanStatusCode.OK });
        toolSpan.end();
        ctx.activeToolSpans.delete(toolUseId);
      }
    }

    return { continue: true };
  };

  // PostToolUseFailure: End tool span with ERROR status and record exception
  const postToolUseFailureHook: HookCallback = async (
    input: HookInput,
    toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    if (toolUseId) {
      const toolSpan = ctx.activeToolSpans.get(toolUseId) as Span | undefined;
      if (toolSpan) {
        const errorMessage = input.error || "Tool execution failed";
        toolSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage,
        });
        toolSpan.recordException(new Error(errorMessage));
        toolSpan.end();
        ctx.activeToolSpans.delete(toolUseId);
      }
    }

    return { continue: true };
  };

  // Stop: End root span (handles Stop before SessionEnd case)
  // Also create a session span if one doesn't exist (SessionStart not fired)
  const stopHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    console.log("[OTEL Hook] Stop triggered, input keys:", Object.keys(input));
    console.log("[OTEL Hook] Stop input:", JSON.stringify(input, null, 2));

    // Create a session span if SessionStart wasn't fired
    // This ensures we always have a root span with the agent response
    const attributes = getCommonAttributes(config, input.session_id);
    const sessionSpan = ctx.rootSpan as Span | undefined ?? tracer.startSpan(SpanNames.SESSION, { attributes });

    if (input.reason) {
      sessionSpan.setAttribute(
        GenAIAttributes.RESPONSE_FINISH_REASONS,
        JSON.stringify([input.reason])
      );
    }

    // Add usage if available
    if (typeof input.input_tokens === "number") {
      sessionSpan.setAttribute(GenAIAttributes.USAGE_INPUT_TOKENS, input.input_tokens);
    }
    if (typeof input.output_tokens === "number") {
      sessionSpan.setAttribute(GenAIAttributes.USAGE_OUTPUT_TOKENS, input.output_tokens);
    }

    // Add agent response/result
    if (input.result !== undefined) {
      try {
        sessionSpan.setAttribute("gen_ai.response.output", JSON.stringify(input.result));
      } catch {
        sessionSpan.setAttribute("gen_ai.response.output", String(input.result));
      }
    }

    sessionSpan.setStatus({ code: SpanStatusCode.OK });
    sessionSpan.end();
    ctx.rootSpan = undefined;

    return { continue: true };
  };

  // SubagentStart: Create subagent span
  const subagentStartHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    console.log("[OTEL Hook] SubagentStart input keys:", Object.keys(input));
    console.log("[OTEL Hook] SubagentStart input:", JSON.stringify(input, null, 2));
    const attributes: Record<string, string | number | boolean> = {
      ...getCommonAttributes(config, input.session_id),
    };

    if (input.subagent_type) {
      attributes[AgentMarkAttributes.SUBAGENT_TYPE] = String(input.subagent_type);
    }

    const subagentSpan = tracer.startSpan(SpanNames.SUBAGENT, { attributes });

    if (input.session_id) {
      ctx.activeSubagentSpans.set(input.session_id, subagentSpan);
    }

    return { continue: true };
  };

  // SubagentStop: End subagent span
  const subagentStopHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    console.log("[OTEL Hook] SubagentStop input keys:", Object.keys(input));
    console.log("[OTEL Hook] SubagentStop input:", JSON.stringify(input, null, 2));
    if (input.session_id) {
      const subagentSpan = ctx.activeSubagentSpans.get(input.session_id) as Span | undefined;
      if (subagentSpan) {
        subagentSpan.setStatus({ code: SpanStatusCode.OK });
        subagentSpan.end();
        ctx.activeSubagentSpans.delete(input.session_id);
      }
    }

    return { continue: true };
  };

  const hooks: HooksConfig = {
    SessionStart: [{ hooks: [sessionStartHook] }],
    SessionEnd: [{ hooks: [sessionEndHook] }],
    PreToolUse: [{ hooks: [preToolUseHook] }],
    PostToolUse: [{ hooks: [postToolUseHook] }],
    PostToolUseFailure: [{ hooks: [postToolUseFailureHook] }],
    Stop: [{ hooks: [stopHook] }],
    SubagentStart: [{ hooks: [subagentStartHook] }],
    SubagentStop: [{ hooks: [subagentStopHook] }],
  };

  return { hooks, context: ctx };
}

/**
 * Combines OTEL hooks with other hook configurations.
 * OTEL hooks execute first to ensure spans are created before other hooks run.
 *
 * @param otelHooks - OTEL hooks configuration from createOtelHooks()
 * @param otherHooks - Other hook configurations to merge
 * @returns Combined hooks configuration
 *
 * @example
 * ```typescript
 * const { hooks: otelHooks } = createOtelHooks({ tracer, promptName: "task" });
 * const customHooks = createTelemetryHooks(config);
 * const combinedHooks = combineWithOtelHooks(otelHooks, customHooks);
 * ```
 */
export function combineWithOtelHooks(
  otelHooks: HooksConfig,
  ...otherHooks: HooksConfig[]
): HooksConfig {
  const combined: HooksConfig = {};
  const eventNames = [
    "SessionStart",
    "SessionEnd",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
    "SubagentStart",
    "SubagentStop",
  ] as const;

  // Start with OTEL hooks (they run first)
  for (const eventName of eventNames) {
    if (otelHooks[eventName]) {
      combined[eventName] = [...otelHooks[eventName]!];
    }
  }

  // Merge other hooks (they run after OTEL hooks)
  for (const hooks of otherHooks) {
    for (const eventName of eventNames) {
      if (hooks[eventName]) {
        if (combined[eventName]) {
          combined[eventName] = [...combined[eventName]!, ...hooks[eventName]!];
        } else {
          combined[eventName] = [...hooks[eventName]!];
        }
      }
    }
  }

  return combined;
}
