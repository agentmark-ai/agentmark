/**
 * Tracing wrapper for Claude Agent SDK.
 *
 * @example
 * ```typescript
 * import { query } from "@anthropic-ai/claude-agent-sdk";
 * import { withTracing } from "@agentmark-ai/claude-agent-sdk-adapter";
 *
 * // Using with adapter output (telemetry auto-configured)
 * const adapted = await prompt.format({ props, telemetry: { isEnabled: true } });
 * const result = withTracing(query, {
 *   query: { prompt: adapted.prompt, options: adapted.options },
 *   telemetry: adapted.telemetry,
 * });
 *
 * for await (const message of result) {
 *   console.log(message);
 * }
 * ```
 *
 * Span structure (following OTEL GenAI semantic conventions):
 * - invoke_agent (parent) - full agent invocation with promptName, props, meta
 *   - chat {model} - each LLM response turn (GENERATION type)
 *     - execute_tool {tool_name} - tool executions
 *
 * Telemetry is automatically disabled if:
 * - telemetry is not provided or telemetry.isEnabled is false
 * - OTEL API is not available
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
 * @module traced
 */

// Types for OpenTelemetry (to avoid hard dependency)
interface SpanContext {
  traceId: string;
  spanId: string;
}

interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: { code: number; message?: string }): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  spanContext(): SpanContext;
  end(): void;
}

interface Context {}

interface Tracer {
  startSpan(
    name: string,
    options?: { attributes?: Record<string, string | number | boolean> },
    context?: Context
  ): Span;
}

interface OtelApi {
  trace: {
    getTracer(name: string): Tracer;
    setSpan(context: Context, span: Span): Context;
  };
  context: {
    active(): Context;
  };
}

// Types for Claude Agent SDK messages
interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface AssistantMessage {
  type: "assistant";
  message: {
    content: ContentBlock[];
    model?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

interface ResultMessage {
  type: "result";
  subtype: "success" | "error";
  result?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  total_cost_usd?: number;
  duration_ms?: number;
  session_id?: string;
}

type SDKMessage = AssistantMessage | ResultMessage | { type: string; [key: string]: unknown };

// Hook types
interface HookInput {
  hook_event_name: string;
  session_id: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  [key: string]: unknown;
}

interface HookOutput {
  continue?: boolean;
}

type HookCallback = (
  input: HookInput,
  toolUseId: string | null,
  options: { signal: AbortSignal }
) => Promise<HookOutput>;

interface HookCallbackMatcher {
  matcher?: string;
  hooks: HookCallback[];
}


// Import shared constant and types
import { TRACER_SCOPE_NAME } from "../hooks/otel-hooks";
import type { TracedTelemetryContext } from "../types";

// Re-export the type for external use
export type { TracedTelemetryContext };

const SpanStatusCode = {
  OK: 1,
  ERROR: 2,
} as const;

const GenAIAttributes = {
  OPERATION_NAME: "gen_ai.operation.name",
  REQUEST_MODEL: "gen_ai.request.model",
  RESPONSE_OUTPUT: "gen_ai.response.output",
  USAGE_INPUT_TOKENS: "gen_ai.usage.input_tokens",
  USAGE_OUTPUT_TOKENS: "gen_ai.usage.output_tokens",
  TOOL_NAME: "gen_ai.tool.name",
  TOOL_CALL_ID: "gen_ai.tool.call.id",
  TOOL_INPUT: "gen_ai.tool.input",
  TOOL_OUTPUT: "gen_ai.tool.output",
} as const;

const AgentMarkAttributes = {
  PROMPT_NAME: "agentmark.prompt_name",
  PROPS: "agentmark.props",
  META: "agentmark.meta",
} as const;

const OperationNames = {
  CHAT: "chat",
  EXECUTE_TOOL: "execute_tool",
  INVOKE_AGENT: "invoke_agent",
} as const;

/**
 * Input options for withTracing() - query params and optional telemetry context
 */
export interface TracedInput<TOptions = unknown> {
  /** Query parameters for Claude Agent SDK */
  query: {
    prompt: string;
    options?: TOptions;
  };
  /** Telemetry context from adapter (only present if telemetry enabled) */
  telemetry?: TracedTelemetryContext;
}

/**
 * Result of withTracing() - provides trace ID and is directly iterable
 */
export interface TracedResult<R> {
  /** OTEL trace ID (or generated fallback if OTEL unavailable) */
  traceId: string;

  /** Makes the result directly iterable with for-await-of */
  [Symbol.asyncIterator](): AsyncIterator<R>;
}

/**
 * Generate a fallback trace ID when OTEL is not available.
 * Uses crypto.randomUUID() format without hyphens (32 hex chars).
 */
function generateFallbackTraceId(): string {
  // Use crypto if available (Node.js 16+, modern browsers)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  // Fallback: generate 32 random hex characters
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

// Cached OpenTelemetry API reference
let cachedOtelApi: OtelApi | null | undefined;
let otelApiPromise: Promise<OtelApi | null> | null = null;

/**
 * Get OpenTelemetry API asynchronously if available.
 * Results are cached after first load.
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
 * Tracing context for a wrapped query
 */
interface TracingContext {
  api: OtelApi;
  tracer: Tracer;
  agentSpan: Span;
  parentContext: Context;
  currentChatSpan: Span | null;
  currentChatContext: Context | null;
  pendingToolSpans: Map<string, Span>;
  turnNumber: number;
  model: string | undefined;
}

/**
 * Create tracing context
 */
function createTracingContext(
  api: OtelApi,
  prompt: string,
  model: string | undefined,
  telemetry?: TracedTelemetryContext
): TracingContext {
  const tracer = api.trace.getTracer(TRACER_SCOPE_NAME);

  const agentSpanName = telemetry?.promptName
    ? `${OperationNames.INVOKE_AGENT} ${telemetry.promptName}`
    : OperationNames.INVOKE_AGENT;

  const attributes: Record<string, string | number | boolean> = {
    [GenAIAttributes.OPERATION_NAME]: OperationNames.INVOKE_AGENT,
  };

  // Build messages array for input (like AI SDK's ai.prompt.messages)
  const messages: Array<{ role: string; content: string }> = [];
  if (telemetry?.systemPrompt) {
    messages.push({ role: "system", content: telemetry.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  try {
    attributes["gen_ai.request.input"] = JSON.stringify(messages);
  } catch {
    // Fallback to just the user prompt if serialization fails
    attributes["gen_ai.request.input"] = prompt;
  }

  // Use model from telemetry context or fallback to options
  const resolvedModel = telemetry?.model || model;
  if (resolvedModel) {
    attributes[GenAIAttributes.REQUEST_MODEL] = resolvedModel;
  }

  // Add telemetry context attributes
  if (telemetry) {
    if (telemetry.promptName) {
      attributes[AgentMarkAttributes.PROMPT_NAME] = telemetry.promptName;
    }

    if (telemetry.props && Object.keys(telemetry.props).length > 0) {
      try {
        attributes[AgentMarkAttributes.PROPS] = JSON.stringify(telemetry.props);
      } catch {
        // If props can't be stringified, skip it
      }
    }

    if (telemetry.meta && Object.keys(telemetry.meta).length > 0) {
      try {
        attributes[AgentMarkAttributes.META] = JSON.stringify(telemetry.meta);
      } catch {
        // If meta can't be stringified, skip it
      }
    }

    // Add custom metadata as agentmark.metadata.* attributes
    if (telemetry.metadata && Object.keys(telemetry.metadata).length > 0) {
      for (const [key, value] of Object.entries(telemetry.metadata)) {
        if (value !== undefined && value !== null) {
          const attrKey = `agentmark.metadata.${key}`;
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            attributes[attrKey] = value;
          } else {
            // For objects/arrays, stringify them
            try {
              attributes[attrKey] = JSON.stringify(value);
            } catch {
              attributes[attrKey] = String(value);
            }
          }
        }
      }
    }

    // Add dataset/experiment attributes
    if (telemetry.datasetRunId) {
      attributes["agentmark.dataset_run_id"] = telemetry.datasetRunId;
    }
    if (telemetry.datasetRunName) {
      attributes["agentmark.dataset_run_name"] = telemetry.datasetRunName;
    }
    if (telemetry.datasetItemName) {
      attributes["agentmark.dataset_item_name"] = telemetry.datasetItemName;
    }
    if (telemetry.datasetExpectedOutput) {
      attributes["agentmark.dataset_expected_output"] = telemetry.datasetExpectedOutput;
    }
    if (telemetry.datasetPath) {
      attributes["agentmark.dataset_path"] = telemetry.datasetPath;
    }
  }

  const agentSpan = tracer.startSpan(agentSpanName, { attributes });
  const parentContext = api.trace.setSpan(api.context.active(), agentSpan);

  return {
    api,
    tracer,
    agentSpan,
    parentContext,
    currentChatSpan: null,
    currentChatContext: null,
    pendingToolSpans: new Map(),
    turnNumber: 0,
    model: resolvedModel,
  };
}

/**
 * End the current chat span if exists
 */
function endCurrentChat(ctx: TracingContext): void {
  if (ctx.currentChatSpan) {
    ctx.currentChatSpan.setStatus({ code: SpanStatusCode.OK });
    ctx.currentChatSpan.end();
    ctx.currentChatSpan = null;
    ctx.currentChatContext = null;
  }
}

/**
 * Process AssistantMessage - create chat span (LLM generation)
 */
function processAssistantMessage(ctx: TracingContext, message: AssistantMessage): void {
  endCurrentChat(ctx);
  ctx.turnNumber++;

  const model = ctx.model || message.message.model;
  if (model && !ctx.model) {
    ctx.model = model;
    ctx.agentSpan.setAttribute(GenAIAttributes.REQUEST_MODEL, model);
  }

  const textParts: string[] = [];
  const toolUseParts: string[] = [];

  for (const block of message.message.content) {
    if (block.type === "text" && block.text) {
      textParts.push(block.text);
    } else if (block.type === "tool_use" && block.name) {
      // Capture tool_use blocks so chat span shows what LLM requested
      const inputStr = block.input ? JSON.stringify(block.input) : "{}";
      toolUseParts.push(`[Tool: ${block.name}] ${inputStr}`);
    }
  }

  const chatSpanName = model
    ? `${OperationNames.CHAT} ${model}`
    : OperationNames.CHAT;

  const attributes: Record<string, string | number | boolean> = {
    [GenAIAttributes.OPERATION_NAME]: OperationNames.CHAT,
    "gen_ai.turn.number": ctx.turnNumber,
  };

  if (model) {
    attributes[GenAIAttributes.REQUEST_MODEL] = model;
  }

  // Build output: text first, then tool calls
  const outputParts = [...textParts, ...toolUseParts];
  if (outputParts.length > 0) {
    attributes[GenAIAttributes.RESPONSE_OUTPUT] = outputParts.join("\n");
  }

  if (message.message.usage) {
    attributes[GenAIAttributes.USAGE_INPUT_TOKENS] = message.message.usage.input_tokens;
    attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS] = message.message.usage.output_tokens;
  }

  ctx.currentChatSpan = ctx.tracer.startSpan(chatSpanName, { attributes }, ctx.parentContext);
  ctx.currentChatContext = ctx.api.trace.setSpan(ctx.parentContext, ctx.currentChatSpan);
}

/**
 * Process ResultMessage - complete agent span
 */
function processResultMessage(ctx: TracingContext, message: ResultMessage): void {
  endCurrentChat(ctx);

  // End any pending tool spans
  for (const [, span] of ctx.pendingToolSpans) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: "Tool not completed" });
    span.end();
  }
  ctx.pendingToolSpans.clear();

  if (message.result) {
    ctx.agentSpan.setAttribute(GenAIAttributes.RESPONSE_OUTPUT, message.result);
  }

  if (message.usage) {
    ctx.agentSpan.setAttribute(GenAIAttributes.USAGE_INPUT_TOKENS, message.usage.input_tokens);
    ctx.agentSpan.setAttribute(GenAIAttributes.USAGE_OUTPUT_TOKENS, message.usage.output_tokens);
  }

  if (message.total_cost_usd !== undefined) {
    ctx.agentSpan.setAttribute("gen_ai.usage.cost_usd", message.total_cost_usd);
  }

  if (message.duration_ms !== undefined) {
    ctx.agentSpan.setAttribute("gen_ai.duration_ms", message.duration_ms);
  }

  if (message.session_id) {
    ctx.agentSpan.setAttribute("agentmark.session_id", message.session_id);
  }

  const status = message.subtype === "success"
    ? { code: SpanStatusCode.OK }
    : { code: SpanStatusCode.ERROR, message: "Query failed" };

  ctx.agentSpan.setStatus(status);
  ctx.agentSpan.end();
}

/**
 * Create tool hooks that integrate with the tracing context
 */
function createToolHooks(ctx: TracingContext): {
  preToolUse: HookCallback;
  postToolUse: HookCallback;
} {
  const preToolUse: HookCallback = async (
    input: HookInput,
    toolUseId: string | null
  ): Promise<HookOutput> => {
    if (!toolUseId) return { continue: true };

    const toolName = input.tool_name ? String(input.tool_name) : undefined;

    const spanName = toolName
      ? `${OperationNames.EXECUTE_TOOL} ${toolName}`
      : OperationNames.EXECUTE_TOOL;

    const attributes: Record<string, string | number | boolean> = {
      [GenAIAttributes.OPERATION_NAME]: OperationNames.EXECUTE_TOOL,
    };

    if (toolName) {
      attributes[GenAIAttributes.TOOL_NAME] = toolName;
    }

    attributes[GenAIAttributes.TOOL_CALL_ID] = toolUseId;

    if (input.tool_input !== undefined) {
      try {
        attributes[GenAIAttributes.TOOL_INPUT] = JSON.stringify(input.tool_input);
      } catch {
        attributes[GenAIAttributes.TOOL_INPUT] = String(input.tool_input);
      }
    }

    const parentContext = ctx.currentChatContext || ctx.parentContext;
    const toolSpan = ctx.tracer.startSpan(spanName, { attributes }, parentContext);
    ctx.pendingToolSpans.set(toolUseId, toolSpan);

    return { continue: true };
  };

  const postToolUse: HookCallback = async (
    input: HookInput,
    toolUseId: string | null
  ): Promise<HookOutput> => {
    if (!toolUseId) return { continue: true };

    const toolSpan = ctx.pendingToolSpans.get(toolUseId);
    if (toolSpan) {
      if (input.tool_response !== undefined) {
        try {
          toolSpan.setAttribute(GenAIAttributes.TOOL_OUTPUT, JSON.stringify(input.tool_response));
        } catch {
          toolSpan.setAttribute(GenAIAttributes.TOOL_OUTPUT, String(input.tool_response));
        }
      }

      toolSpan.setStatus({ code: SpanStatusCode.OK });
      toolSpan.end();
      ctx.pendingToolSpans.delete(toolUseId);
    }

    return { continue: true };
  };

  return { preToolUse, postToolUse };
}

/**
 * Merge tracing hooks into options
 */
function mergeHooksIntoOptions<T>(
  options: T,
  preToolUse: HookCallback,
  postToolUse: HookCallback
): T {
  const opts = options as Record<string, unknown> | undefined;
  const existingHooks = (opts?.hooks as Record<string, HookCallbackMatcher[]>) || {};

  const newHooks: Record<string, HookCallbackMatcher[]> = {
    ...existingHooks,
  };

  if (newHooks.PreToolUse) {
    newHooks.PreToolUse = [{ hooks: [preToolUse] }, ...newHooks.PreToolUse];
  } else {
    newHooks.PreToolUse = [{ hooks: [preToolUse] }];
  }

  if (newHooks.PostToolUse) {
    newHooks.PostToolUse = [...newHooks.PostToolUse, { hooks: [postToolUse] }];
  } else {
    newHooks.PostToolUse = [{ hooks: [postToolUse] }];
  }

  return {
    ...options,
    hooks: newHooks,
  } as T;
}

/**
 * Wrap a Claude Agent SDK query with OpenTelemetry tracing.
 *
 * Returns a TracedResult object that provides the trace ID immediately
 * and is directly iterable with for-await-of.
 *
 * Tracing is automatically disabled if:
 * - OTEL API is not available
 * - telemetry is not provided or telemetry.isEnabled is false
 *
 * @param queryFn - The query function from @anthropic-ai/claude-agent-sdk
 * @param input - Query parameters and optional telemetry context from adapter
 * @returns Promise of TracedResult with traceId and async iterator
 *
 * @example
 * ```typescript
 * import { query } from "@anthropic-ai/claude-agent-sdk";
 * import { withTracing } from "@agentmark-ai/claude-agent-sdk-adapter";
 *
 * // Using with adapter output (telemetry auto-configured)
 * const adapted = await prompt.format({ props, telemetry: { isEnabled: true } });
 * const result = await withTracing(query, {
 *   query: { prompt: adapted.prompt, options: adapted.options },
 *   telemetry: adapted.telemetry,
 * });
 *
 * console.log("Trace ID:", result.traceId); // Available immediately
 *
 * for await (const message of result) {
 *   console.log(message);
 * }
 * ```
 */
export async function withTracing<TOptions, R>(
  queryFn: (options: { prompt: string; options?: TOptions }) => AsyncIterable<R>,
  input: TracedInput<TOptions>
): Promise<TracedResult<R>> {
  const { query: queryParams, telemetry } = input;

  // If telemetry is disabled, return passthrough with fallback trace ID
  if (!telemetry?.isEnabled) {
    const traceId = generateFallbackTraceId();
    return {
      traceId,
      async *[Symbol.asyncIterator]() {
        yield* queryFn(queryParams);
      },
    };
  }

  // Load OTEL API asynchronously
  const api = await getOtelApiAsync();

  // If OTEL not available, return passthrough with fallback trace ID
  if (!api) {
    const traceId = generateFallbackTraceId();
    return {
      traceId,
      async *[Symbol.asyncIterator]() {
        yield* queryFn(queryParams);
      },
    };
  }

  // Create tracing context now that we have the API
  const opts = queryParams.options as Record<string, unknown> | undefined;
  const ctx = createTracingContext(
    api,
    queryParams.prompt,
    opts?.model as string | undefined,
    telemetry
  );

  // Get the real trace ID immediately
  const traceId = ctx.agentSpan.spanContext().traceId;

  // Create tool hooks
  const { preToolUse, postToolUse } = createToolHooks(ctx);

  // Merge hooks into options (preserves original options type)
  const optionsWithHooks = mergeHooksIntoOptions(
    queryParams.options,
    preToolUse,
    postToolUse
  );

  // Create the async iterator that performs tracing
  async function* tracedIterator(): AsyncGenerator<R, void, unknown> {
    try {
      for await (const message of queryFn({
        prompt: queryParams.prompt,
        options: optionsWithHooks,
      })) {
        const msg = message as SDKMessage;
        if (msg.type === "assistant") {
          processAssistantMessage(ctx, msg as AssistantMessage);
        } else if (msg.type === "result") {
          processResultMessage(ctx, msg as ResultMessage);
        }

        yield message;
      }
    } catch (error) {
      endCurrentChat(ctx);
      for (const [, span] of ctx.pendingToolSpans) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
      }
      ctx.pendingToolSpans.clear();
      ctx.agentSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      ctx.agentSpan.end();
      throw error;
    } finally {
      // Cleanup any remaining pending tool spans on iterator completion
      if (ctx.pendingToolSpans.size > 0) {
        for (const [, span] of ctx.pendingToolSpans) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: "Iterator completed with pending tools" });
          span.end();
        }
        ctx.pendingToolSpans.clear();
      }
    }
  }

  return {
    traceId,
    [Symbol.asyncIterator]() {
      return tracedIterator();
    },
  };
}
