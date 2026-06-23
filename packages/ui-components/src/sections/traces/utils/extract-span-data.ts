/**
 * Span-kind-aware data extraction utilities.
 *
 * Different span types store their meaningful data in different fields:
 *   invoke_agent → props (template variables) as input, outputObject/output as expected output
 *   chat          → messages (gen_ai.request.input) as input, assistant response as expected output
 *   execute_tool  → tool arguments as input, tool result as expected output
 */

export type DatasetInputKind = "props" | "messages" | "tool call" | "IO" | null;

interface SpanLike {
  name?: string;
  data?: Record<string, any>;
}

/** Parse JSON if string, return as-is if already parsed, null on failure. */
function safeParseJson<T = unknown>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== "string") return value as T;
  try { return JSON.parse(value); } catch { return null; }
}

/**
 * Extract dataset input from a span, aware of span kind.
 */
export function extractSpanInput(span: SpanLike | null | undefined): Record<string, unknown> | null {
  if (!span?.data) return null;
  const d = span.data;
  const name = span.name || "";

  // Agent/invoke_agent spans: use props (template variables)
  if (name.startsWith("invoke_agent") && d.props) {
    const props = safeParseJson<Record<string, unknown>>(d.props);
    if (props) return props;
  }

  // Tool spans: use tool arguments from toolCalls
  if (d.toolCalls) {
    const calls = safeParseJson<any[]>(d.toolCalls);
    if (Array.isArray(calls) && calls.length > 0) {
      return calls[0].args ?? {};
    }
  }

  // Extract input data
  if (d.input) {
    const parsed = safeParseJson(d.input);
    if (parsed != null) {
      if (Array.isArray(parsed) && parsed.length > 0) {
        // For GENERATION spans, keep as chat messages
        if (d.type === "GENERATION") {
          return { messages: parsed };
        }
        // For non-GENERATION spans (functions, agents), the normalizer wraps
        // raw IO in a synthetic [{role:"user", content:"..."}] array.
        // Unwrap and return the actual content.
        if (parsed.length === 1 && parsed[0]?.role === "user" && parsed[0]?.content) {
          const content = safeParseJson<Record<string, unknown>>(parsed[0].content);
          if (content && typeof content === "object" && !Array.isArray(content)) {
            return content;
          }
        }
        return { messages: parsed };
      }
      return parsed as Record<string, unknown>;
    }
  }

  // Fallback: use props if available (e.g. root trace span)
  if (d.props) {
    const props = safeParseJson<Record<string, unknown>>(d.props);
    if (props) return props;
  }

  return null;
}

/**
 * Extract expected output from a span, aware of span kind.
 */
export function extractSpanExpectedOutput(span: SpanLike | null | undefined): unknown {
  if (!span?.data) return null;
  const d = span.data;

  // Tool spans: use tool result from toolCalls
  if (d.toolCalls) {
    const calls = safeParseJson<any[]>(d.toolCalls);
    if (Array.isArray(calls) && calls.length > 0 && calls[0].result != null) {
      return safeParseJson(calls[0].result) ?? calls[0].result;
    }
  }

  // For all span types: prefer outputObject (structured), then output (text)
  if (d.outputObject) {
    return safeParseJson(d.outputObject) ?? d.outputObject;
  }
  if (d.output) {
    return safeParseJson(d.output) ?? d.output;
  }
  return null;
}

/** Check if parsed input looks like a chat messages array (items have a `role` field). */
function isMessagesArray(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => item && typeof item === "object" && "role" in item);
}

/**
 * Extract the prompt name (frontmatter `name`) from a span.
 *
 * Spans normalized by the AgentMark pipeline carry the value on
 * `data.promptName`. The legacy ClickHouse column form `prompt_name` is also
 * accepted so this helper works for hosts that read directly from CH rows.
 * Returns `null` when no prompt name is present.
 */
export function extractSpanPromptName(span: SpanLike | null | undefined): string | null {
  const d = span?.data;
  if (!d) return null;
  const value = (d as { promptName?: unknown }).promptName
    ?? (d as { prompt_name?: unknown }).prompt_name;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Extract the prompt PATH (agentmark-root-relative, e.g.
 * `support/triage.prompt.mdx`) from a span — the folder-aware id carried on the
 * `agentmark.prompt_path` attribute. Unlike `extractSpanPromptName` (the flat
 * frontmatter `name`, which collides across folders), this uniquely resolves
 * the prompt, so it's what a "view prompt" link keys off. Accepts the
 * normalized `data.promptPath` and the raw column form `prompt_path`. Returns
 * `null` when absent.
 */
export function extractSpanPromptPath(span: SpanLike | null | undefined): string | null {
  const d = span?.data;
  if (!d) return null;
  const value = (d as { promptPath?: unknown }).promptPath
    ?? (d as { prompt_path?: unknown }).prompt_path;
  if (typeof value === "string" && value.length > 0) return value;
  // Fallback: read the raw OTel attribute. Hosts that carry the ClickHouse
  // SpanAttributes map (e.g. the dashboard) get it without promoting a column.
  return readRawSpanAttribute(d, "agentmark.prompt_path");
}

/**
 * Read a single attribute from a span's raw `data.attributes` JSON map (the
 * form hosts reading ClickHouse `SpanAttributes` carry). Returns null on
 * absence or parse failure.
 */
function readRawSpanAttribute(
  data: Record<string, unknown>,
  key: string
): string | null {
  const raw = (data as { attributes?: unknown }).attributes;
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const v = parsed?.[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Extract the commit sha the prompt content was served at (the prompt
 * VERSION), from `data.commitSha` / `commit_sha`. Pairs with
 * `extractSpanPromptPath` to link to an exact prompt version. Returns `null`
 * when absent.
 */
export function extractSpanCommitSha(span: SpanLike | null | undefined): string | null {
  const d = span?.data;
  if (!d) return null;
  const value = (d as { commitSha?: unknown }).commitSha
    ?? (d as { commit_sha?: unknown }).commit_sha;
  if (typeof value === "string" && value.length > 0) return value;
  // Fallback to the raw attribute — the SDK emits the served commit under the
  // metadata key (`agentmark.metadata.commit_sha`).
  return readRawSpanAttribute(d, "agentmark.metadata.commit_sha");
}

/**
 * Extract the *template variables* (frontmatter `props`) used to render
 * this span's prompt — distinct from `extractSpanInput`, which returns the
 * rendered chat messages for GENERATION spans.
 *
 * Use this when the consumer wants to re-run the same prompt with the same
 * inputs (e.g. the "Test prompt" dialog feeds these into
 * `agentmark run-prompt --props '<json>'`). For datasets, prefer
 * `extractSpanInput` — datasets store rendered IO as ground truth.
 *
 * Returns `null` when the span carries no props.
 */
export function extractSpanTemplateProps(
  span: SpanLike | null | undefined,
): Record<string, unknown> | null {
  const d = span?.data;
  if (!d) return null;
  const raw = (d as { props?: unknown }).props;
  if (raw == null) return null;
  if (typeof raw === "string") {
    const parsed = safeParseJson<unknown>(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

/**
 * Derive the input kind label for a span.
 */
export function getSpanInputKind(span: SpanLike | null | undefined): DatasetInputKind {
  if (!span?.data) return null;
  const d = span.data;
  const name = span.name || "";
  if (name.startsWith("invoke_agent") && d.props) return "props";
  if (d.toolCalls) return "tool call";
  if (d.input) {
    // Distinguish function IO (from @observe) vs chat messages
    const parsed = safeParseJson(d.input);
    if (isMessagesArray(parsed)) return "messages";
    return "IO";
  }
  if (d.props) return "props";
  return null;
}
