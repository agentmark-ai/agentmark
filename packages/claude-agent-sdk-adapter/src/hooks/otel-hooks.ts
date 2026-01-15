/**
 * OpenTelemetry hooks for Claude Agent SDK adapter.
 * Emits spans following GenAI semantic conventions.
 *
 * Architecture inspired by claude_telemetry:
 * - UserPromptSubmit: Creates parent session span with user input
 * - PreToolUse/PostToolUse: Creates child tool spans
 * - Stop: Completes session span (since SessionEnd doesn't fire)
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 * @see https://github.com/TechNickAI/claude_telemetry
 */

import type { HookCallback, HookInput, HookOutput, OtelHooksConfig, TelemetryContext } from "../types";
import type { HooksConfig } from "./telemetry-hooks";

// Type definitions for OpenTelemetry API (to avoid hard dependency)
interface SpanContext {
  traceId: string;
  spanId: string;
}

interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: { code: number; message?: string }): void;
  recordException(exception: Error): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  end(): void;
  spanContext(): SpanContext;
}

interface Context {
  // OpenTelemetry context
}

interface Tracer {
  startSpan(name: string, options?: { attributes?: Record<string, string | number | boolean> }, context?: Context): Span;
}

interface TracerProvider {
  getTracer(name: string, version?: string): Tracer;
}

interface OtelTrace {
  getTracer(name: string, version?: string): Tracer;
  setSpan(context: Context, span: Span): Context;
}

interface OtelContext {
  active(): Context;
}

interface OtelApi {
  trace: OtelTrace;
  context: OtelContext;
}

/**
 * The instrumentation scope name used for all AgentMark spans.
 * This scope name is registered in the normalizer for proper span transformation.
 */
export const TRACER_SCOPE_NAME = "agentmark";

// Cached OpenTelemetry API reference (loaded lazily)
let cachedOtelApi: OtelApi | null | undefined;
let otelApiPromise: Promise<OtelApi | null> | null = null;

/**
 * Get the OpenTelemetry API asynchronously.
 * Returns null if @opentelemetry/api is not available.
 * Results are cached after first load.
 * @internal
 */
async function getOtelApiAsync(): Promise<OtelApi | null> {
  // Return cached value if available
  if (cachedOtelApi !== undefined) {
    return cachedOtelApi;
  }

  // Return existing promise if load is in progress
  if (otelApiPromise) {
    return otelApiPromise;
  }

  // Start loading
  otelApiPromise = (async () => {
    try {
      const api = await import("@opentelemetry/api");
      cachedOtelApi = api as unknown as OtelApi;
      return cachedOtelApi;
    } catch {
      cachedOtelApi = null;
      return null;
    }
  })();

  return otelApiPromise;
}

/**
 * Get the OpenTelemetry API synchronously (from cache only).
 * Returns null if not yet loaded or unavailable.
 * Call getOtelApiAsync() first to ensure the module is loaded.
 * @internal
 */
function getOtelApi(): OtelApi | null {
  return cachedOtelApi ?? null;
}

/**
 * Get the OpenTelemetry tracer from the global provider.
 * Returns null if @opentelemetry/api is not available or not initialized.
 * @internal
 */
function getGlobalTracer(): Tracer | null {
  const api = getOtelApi();
  if (!api) return null;
  return api.trace.getTracer(TRACER_SCOPE_NAME);
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
  /** User input prompt */
  REQUEST_INPUT: "gen_ai.request.input",
  /** Agent response output */
  RESPONSE_OUTPUT: "gen_ai.response.output",
  /** Tool input */
  TOOL_INPUT: "gen_ai.tool.input",
  /** Tool output */
  TOOL_OUTPUT: "gen_ai.tool.output",
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
  /** Agent ID */
  AGENT_ID: "agentmark.agent_id",
  /** Props passed to the prompt template (JSON stringified) */
  PROPS: "agentmark.props",
  /** Additional metadata from the prompt frontmatter (JSON stringified) */
  META: "agentmark.meta",
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
 * Extended telemetry context with OTEL API reference.
 */
interface InternalTelemetryContext extends TelemetryContext {
  otelApi: OtelApi;
  parentContext?: Context;
}

/**
 * Creates a new telemetry context for tracking spans.
 * Uses the global tracer from AgentMarkSDK.initialize() or a provided TracerProvider.
 * @param config - OTEL hooks configuration
 * @returns New telemetry context, or null if OTEL is not available
 */
export async function createTelemetryContext(config: OtelHooksConfig): Promise<InternalTelemetryContext | null> {
  const api = await getOtelApiAsync();
  if (!api) return null;

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
    return null;
  }

  return {
    rootSpan: undefined,
    activeToolSpans: new Map(),
    activeSubagentSpans: new Map(),
    tracer,
    config,
    otelApi: api,
    parentContext: undefined,
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
 * Architecture:
 * - UserPromptSubmit: Creates parent session span with user input
 * - PreToolUse/PostToolUse: Creates child tool spans under session
 * - SubagentStart/SubagentStop: Creates subagent spans
 * - Stop: Completes session span with final metrics
 *
 * @param config - OTEL hooks configuration
 * @returns Hook configuration and telemetry context, or null hooks if OTEL not available
 *
 * @example
 * ```typescript
 * const { hooks, context } = await createOtelHooks({
 *   promptName: "my-agent-task",
 *   model: "claude-sonnet-4-20250514",
 *   userId: "user-123",
 *   userPrompt: "Help me with this task",
 * });
 *
 * const result = await query({ prompt, options: { hooks } });
 *
 * // After query completes, finalize with result
 * if (context) {
 *   completeSession(context, result);
 * }
 * ```
 */
export async function createOtelHooks(config: OtelHooksConfig): Promise<{
  hooks: HooksConfig;
  context: TelemetryContext | null;
}> {
  const ctx = await createTelemetryContext(config);

  // If OTEL is not available, return empty hooks
  if (!ctx) {
    return { hooks: {}, context: null };
  }

  const tracer = ctx.tracer as Tracer;
  const api = ctx.otelApi;

  // UserPromptSubmit: Create parent session span with user input
  const userPromptSubmitHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    const attributes = getCommonAttributes(config, input.session_id);

    // Add user prompt if available from hook input or config
    const userPrompt = input.prompt || config.userPrompt;
    if (userPrompt) {
      attributes[GenAIAttributes.REQUEST_INPUT] = String(userPrompt);
    }

    // Create session span with prompt preview in name
    const promptPreview = userPrompt ? String(userPrompt).slice(0, 60) : config.promptName;
    const spanName = `${SpanNames.SESSION} ${promptPreview}${userPrompt && String(userPrompt).length > 60 ? '...' : ''}`;

    const span = tracer.startSpan(spanName, { attributes });
    ctx.rootSpan = span;

    // Store parent context for child spans
    ctx.parentContext = api.trace.setSpan(api.context.active(), span);

    // Add event for prompt submission
    span.addEvent("user_prompt_submitted", {
      prompt_length: userPrompt ? String(userPrompt).length : 0,
    });

    return { continue: true };
  };

  // PreToolUse: Create child tool span under session span
  const preToolUseHook: HookCallback = async (
    input: HookInput,
    toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
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
        attributes[GenAIAttributes.TOOL_INPUT] = JSON.stringify(input.tool_input);
      } catch {
        attributes[GenAIAttributes.TOOL_INPUT] = String(input.tool_input);
      }
    }

    const spanName = input.tool_name
      ? `${SpanNames.TOOL_CALL} ${input.tool_name}`
      : SpanNames.TOOL_CALL;

    // Create tool span as child of session span if available
    const parentContext = ctx.parentContext || api.context.active();
    const toolSpan = tracer.startSpan(spanName, { attributes }, parentContext);

    if (toolUseId) {
      ctx.activeToolSpans.set(toolUseId, toolSpan);
    }

    return { continue: true };
  };

  // PostToolUse: End tool span with OK status and output
  const postToolUseHook: HookCallback = async (
    input: HookInput,
    toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    if (toolUseId) {
      const toolSpan = ctx.activeToolSpans.get(toolUseId) as Span | undefined;
      if (toolSpan) {
        // Add tool output/response
        if (input.tool_response !== undefined) {
          try {
            toolSpan.setAttribute(GenAIAttributes.TOOL_OUTPUT, JSON.stringify(input.tool_response));
          } catch {
            toolSpan.setAttribute(GenAIAttributes.TOOL_OUTPUT, String(input.tool_response));
          }
        }
        toolSpan.setStatus({ code: SpanStatusCode.OK });
        toolSpan.end();
        ctx.activeToolSpans.delete(toolUseId);
      }
    }

    return { continue: true };
  };

  // PostToolUseFailure: End tool span with ERROR status
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

  // Stop: Add final metrics to session span but DON'T end it
  // The span will be ended by completeSession() which adds the output
  const stopHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    const sessionSpan = ctx.rootSpan as Span | undefined;

    // If no session span exists (UserPromptSubmit wasn't fired), create one now
    if (!sessionSpan) {
      const attributes = getCommonAttributes(config, input.session_id);
      if (config.userPrompt) {
        attributes[GenAIAttributes.REQUEST_INPUT] = String(config.userPrompt);
      }
      const fallbackSpan = tracer.startSpan(SpanNames.SESSION, { attributes });
      ctx.rootSpan = fallbackSpan;
    }

    const span = ctx.rootSpan as Span;

    // Add finish reason if available
    if (input.reason) {
      span.setAttribute(GenAIAttributes.RESPONSE_FINISH_REASONS, JSON.stringify([input.reason]));
    }

    // Add usage if available from Stop hook
    if (typeof input.input_tokens === "number") {
      span.setAttribute(GenAIAttributes.USAGE_INPUT_TOKENS, input.input_tokens);
    }
    if (typeof input.output_tokens === "number") {
      span.setAttribute(GenAIAttributes.USAGE_OUTPUT_TOKENS, input.output_tokens);
    }

    span.addEvent("session_stopped");

    // DON'T end the span here - let completeSession() do it so it can add the output
    // The span will be ended when completeSession() is called

    return { continue: true };
  };

  // SubagentStart: Create subagent span as child of session
  const subagentStartHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    const attributes: Record<string, string | number | boolean> = {
      ...getCommonAttributes(config, input.session_id),
    };

    const agentType = input.agent_type as string | undefined;
    const agentId = input.agent_id as string | undefined;

    if (agentType) {
      attributes[AgentMarkAttributes.SUBAGENT_TYPE] = agentType;
    }
    if (agentId) {
      attributes[AgentMarkAttributes.AGENT_ID] = agentId;
    }

    // Create subagent span as child of session span
    const parentContext = ctx.parentContext || api.context.active();
    const subagentSpan = tracer.startSpan(SpanNames.SUBAGENT, { attributes }, parentContext);

    // Use agent_id as key for tracking
    const agentKey = agentId || input.session_id;
    if (agentKey) {
      ctx.activeSubagentSpans.set(agentKey, subagentSpan);
    }

    return { continue: true };
  };

  // SubagentStop: End subagent span
  const subagentStopHook: HookCallback = async (
    input: HookInput,
    _toolUseId: string | null,
    _options: { signal: AbortSignal }
  ): Promise<HookOutput> => {
    const agentId = input.agent_id as string | undefined;
    const agentKey = agentId || input.session_id;
    if (agentKey) {
      const subagentSpan = ctx.activeSubagentSpans.get(agentKey) as Span | undefined;
      if (subagentSpan) {
        subagentSpan.setStatus({ code: SpanStatusCode.OK });
        subagentSpan.end();
        ctx.activeSubagentSpans.delete(agentKey);
      }
    }

    return { continue: true };
  };

  const hooks: HooksConfig = {
    UserPromptSubmit: [{ hooks: [userPromptSubmitHook] }],
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
 * Completes the session with the final agent result.
 * Call this after query() completes to add the agent's response to telemetry.
 *
 * Note: This is optional if you don't need to capture the final result.
 * The session span will be completed by the Stop hook automatically.
 *
 * @param context - Telemetry context from createOtelHooks()
 * @param result - The agent's final result/response
 * @param usage - Optional token usage metrics
 *
 * @example
 * ```typescript
 * const { hooks, context } = createOtelHooks(config);
 *
 * let result = "";
 * for await (const message of query({ prompt, options: { hooks } })) {
 *   if (message.type === "result" && message.subtype === "success") {
 *     result = message.result;
 *   }
 * }
 *
 * // Add the result to telemetry
 * if (context) {
 *   completeSession(context, result);
 * }
 * ```
 */
export function completeSession(
  context: TelemetryContext,
  result: string | Record<string, unknown>,
  usage?: { inputTokens?: number; outputTokens?: number }
): void {
  const span = context.rootSpan as Span | undefined;
  if (!span) {
    // Session already completed by Stop hook, or no session was created
    return;
  }

  // Add result
  try {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result);
    span.setAttribute(GenAIAttributes.RESPONSE_OUTPUT, resultStr);
  } catch {
    span.setAttribute(GenAIAttributes.RESPONSE_OUTPUT, String(result));
  }

  // Add usage if provided
  if (usage?.inputTokens !== undefined) {
    span.setAttribute(GenAIAttributes.USAGE_INPUT_TOKENS, usage.inputTokens);
  }
  if (usage?.outputTokens !== undefined) {
    span.setAttribute(GenAIAttributes.USAGE_OUTPUT_TOKENS, usage.outputTokens);
  }

  span.addEvent("session_completed");
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
  context.rootSpan = undefined;
}

/**
 * Combines OTEL hooks with other hook configurations.
 * OTEL hooks execute first to ensure spans are created before other hooks run.
 *
 * @param otelHooks - OTEL hooks configuration from createOtelHooks()
 * @param otherHooks - Other hook configurations to merge
 * @returns Combined hooks configuration
 */
export function combineWithOtelHooks(
  otelHooks: HooksConfig,
  ...otherHooks: HooksConfig[]
): HooksConfig {
  const combined: HooksConfig = {};

  // Get all event names from all hook configs
  const allEventNames = new Set<string>();
  for (const eventName of Object.keys(otelHooks)) {
    allEventNames.add(eventName);
  }
  for (const hooks of otherHooks) {
    for (const eventName of Object.keys(hooks)) {
      allEventNames.add(eventName);
    }
  }

  // Start with OTEL hooks (they run first)
  for (const eventName of allEventNames) {
    const key = eventName as keyof HooksConfig;
    if (otelHooks[key]) {
      combined[key] = [...otelHooks[key]!];
    }
  }

  // Merge other hooks (they run after OTEL hooks)
  for (const hooks of otherHooks) {
    for (const eventName of allEventNames) {
      const key = eventName as keyof HooksConfig;
      if (hooks[key]) {
        if (combined[key]) {
          combined[key] = [...combined[key]!, ...hooks[key]!];
        } else {
          combined[key] = [...hooks[key]!];
        }
      }
    }
  }

  return combined;
}
