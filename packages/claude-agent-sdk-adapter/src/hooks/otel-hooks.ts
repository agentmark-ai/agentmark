/**
 * OpenTelemetry constants for Claude Agent SDK adapter.
 * These follow GenAI semantic conventions.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */

/**
 * The instrumentation scope name used for all AgentMark spans.
 * This scope name is registered in the normalizer for proper span transformation.
 */
export const TRACER_SCOPE_NAME = "agentmark";

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
